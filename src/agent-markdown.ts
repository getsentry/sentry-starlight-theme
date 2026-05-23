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
  sidebar?: unknown;
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
  /**
   * Append navigation sections to Markdown pages with visible child pages.
   */
  navigation?: boolean;
}

export function sentryAgentMarkdown({
  markdownRoutes = true,
  contentNegotiation = false,
  markdownActions = true,
  navigation = true,
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
          ...config.components,
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
          agentMarkdownIntegration({
            markdownRoutes,
            contentNegotiation,
            navigation,
            sidebar: config.sidebar,
          }),
        );
      },
    },
  };
}

function agentMarkdownIntegration({
  markdownRoutes,
  contentNegotiation,
  navigation,
  sidebar,
}: Required<
  Pick<
    SentryAgentMarkdownOptions,
    "contentNegotiation" | "markdownRoutes" | "navigation"
  >
> & { sidebar: unknown }): AstroIntegration {
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
            plugins: [
              agentMarkdownConfigPlugin(config.base, {
                navigation,
                sidebar,
              }),
            ],
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

function agentMarkdownConfigPlugin(
  base: string,
  { navigation, sidebar }: { navigation: boolean; sidebar: unknown },
) {
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
        return [
          `export const base = ${JSON.stringify(normalizeBase(base))};`,
          `export const appendNavigation = ${JSON.stringify(navigation)};`,
          `export const sidebar = ${JSON.stringify(normalizeSidebar(sidebar))};`,
        ].join("\n");
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

function normalizeSidebar(sidebar: unknown): unknown[] {
  return Array.isArray(sidebar)
    ? sidebar.map(normalizeSidebarItem).filter(Boolean)
    : [];
}

function normalizeSidebarItem(item: unknown): unknown {
  if (typeof item === "string") {
    return item;
  }

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }

  const record = item as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const key of ["label", "link", "slug"]) {
    if (typeof record[key] === "string") {
      normalized[key] = record[key];
    }
  }

  if (Array.isArray(record.items)) {
    normalized.items = record.items.map(normalizeSidebarItem).filter(Boolean);
  }

  if (record.autogenerate && typeof record.autogenerate === "object") {
    const autogenerate = record.autogenerate as Record<string, unknown>;
    if (typeof autogenerate.directory === "string") {
      normalized.autogenerate = { directory: autogenerate.directory };
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}
