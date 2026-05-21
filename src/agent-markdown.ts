import type { AstroIntegration } from "astro";
import {
  setStarlightComponentOverride,
  type StarlightComponentOverrides,
} from "./starlight-components";

const packageName = "@sentry/starlight-theme";
const pluginName = `${packageName}/agent-markdown`;
const tableOfContentsComponent = `${packageName}/agent-markdown/TableOfContents`;

interface StarlightUserConfig {
  components?: Record<string, string | undefined>;
}

interface StarlightPlugin {
  name: string;
  hooks: {
    "config:setup"(context: {
      config: StarlightUserConfig;
      addIntegration(integration: AstroIntegration): void;
      updateConfig(config: Partial<StarlightUserConfig>): void;
      logger: {
        warn(message: string): void;
      };
    }): void;
  };
}

export interface SentryAgentMarkdownOptions {
  /**
   * Generate static Markdown routes for Starlight docs pages.
   *
   * The root docs page is emitted as `/index.md`; all other pages are emitted
   * as `/<slug>.md`.
   */
  markdownRoutes?: boolean;
  /**
   * Serve Markdown for normal docs URLs when the request `Accept` header
   * prefers `text/markdown`.
   *
   * This only works for SSR/on-demand deployments. Static builds cannot vary a
   * prebuilt HTML file by request headers without platform-level rewrites.
   */
  contentNegotiation?: boolean;
  /**
   * Add Markdown actions below Starlight's right-sidebar table of contents.
   */
  markdownActions?: boolean;
}

export function sentryAgentMarkdown({
  markdownRoutes = true,
  contentNegotiation = false,
  markdownActions = true,
}: SentryAgentMarkdownOptions = {}): StarlightPlugin {
  return {
    name: pluginName,
    hooks: {
      "config:setup"({ config, addIntegration, updateConfig, logger }) {
        if (!markdownRoutes && !contentNegotiation) {
          logger.warn(
            `${pluginName} is enabled, but both markdownRoutes and contentNegotiation are disabled.`,
          );
        }

        const components: StarlightComponentOverrides = {
          ...(config.components ?? {}),
        };
        if (markdownActions && !markdownRoutes) {
          logger.warn(
            `${pluginName}'s markdownActions option requires markdownRoutes. No Markdown actions will be added.`,
          );
        } else if (markdownActions) {
          setStarlightComponentOverride({
            components,
            component: "TableOfContents",
            componentPath: tableOfContentsComponent,
            logger,
            usage: `show ${pluginName}'s Markdown actions`,
          });
        }

        updateConfig({ components });

        addIntegration(
          agentMarkdownIntegration({ markdownRoutes, contentNegotiation }),
        );
      },
    },
  };
}

function agentMarkdownIntegration({
  markdownRoutes,
  contentNegotiation,
}: Required<
  Pick<SentryAgentMarkdownOptions, "markdownRoutes" | "contentNegotiation">
>): AstroIntegration {
  return {
    name: pluginName,
    hooks: {
      "astro:config:setup"({
        addMiddleware,
        config,
        injectRoute,
        updateConfig,
      }) {
        if (contentNegotiation && !markdownRoutes) {
          throw new Error(
            `${pluginName}: contentNegotiation requires markdownRoutes because it rewrites requests to generated .md routes.`,
          );
        }

        updateConfig({
          vite: {
            plugins: [agentMarkdownConfigPlugin(config.base)],
          },
        });

        if (markdownRoutes) {
          injectRoute({
            pattern: "/index.md",
            entrypoint: `${packageName}/agent-markdown/index-endpoint`,
            prerender: true,
          });
          injectRoute({
            pattern: "/[...slug].md",
            entrypoint: `${packageName}/agent-markdown/slug-endpoint`,
            prerender: true,
          });
        }

        if (contentNegotiation) {
          addMiddleware({
            entrypoint: `${packageName}/agent-markdown/middleware`,
            order: "pre",
          });
        }
      },
    },
  };
}

const virtualConfigModuleId =
  "virtual:sentry-starlight-theme/agent-markdown/config";
const resolvedVirtualConfigModuleId = `\0${virtualConfigModuleId}`;

function agentMarkdownConfigPlugin(base: string) {
  return {
    name: `${pluginName}/config`,
    resolveId(id: string) {
      if (id === virtualConfigModuleId) {
        return resolvedVirtualConfigModuleId;
      }

      return undefined;
    },
    load(id: string) {
      if (id === resolvedVirtualConfigModuleId) {
        return `export const base = ${JSON.stringify(normalizeBase(base))};`;
      }

      return undefined;
    },
  };
}

function normalizeBase(base: string) {
  if (!base || base === "/") {
    return "/";
  }

  return `/${base.replace(/^\/|\/$/g, "")}`;
}
