import { monochromeCodeTheme } from "./themes/monochrome";
import {
  setStarlightComponentOverride,
  type StarlightComponentOverrides,
} from "./starlight-components";

export {
  sentryAgentMarkdown,
  type SentryAgentMarkdownOptions,
} from "./agent-markdown";
export { monochromeCodeTheme } from "./themes/monochrome";

const packageName = "@sentry/starlight-theme";
const themeCss = `${packageName}/styles/index.css`;
const footerComponent = `${packageName}/components/Footer.astro`;
const headerComponent = `${packageName}/components/Header.astro`;
const mobileMenuFooterComponent = `${packageName}/components/MobileMenuFooter.astro`;
const paginationComponent = `${packageName}/components/Pagination.astro`;
const themeSelectComponent = `${packageName}/components/ThemeSelect.astro`;

type ExpressiveCodeConfig = Exclude<
  StarlightUserConfig["expressiveCode"],
  boolean | undefined
>;
type ExpressiveCodeStyleOverrides = Record<string, unknown> & {
  frames?: Record<string, unknown>;
};

interface HeadTag {
  tag: string;
  attrs?: Record<string, string | boolean | undefined>;
  content?: string;
}

interface StarlightUserConfig {
  customCss?: string[];
  components?: Record<string, string | undefined>;
  expressiveCode?:
    | boolean
    | (Record<string, unknown> & {
        styleOverrides?: ExpressiveCodeStyleOverrides;
      });
  head?: HeadTag[];
}

interface StarlightPlugin {
  name: string;
  hooks: {
    "config:setup"(context: {
      config: StarlightUserConfig;
      updateConfig(config: Partial<StarlightUserConfig>): void;
      logger: {
        warn(message: string): void;
      };
    }): void;
  };
}

export interface SentryStarlightThemeOptions {
  /**
   * Hide Starlight's theme selector. This defaults to true because the theme is
   * intentionally dark-only.
   */
  hideThemeSelect?: boolean;
}

export function sentryStarlightTheme({
  hideThemeSelect = true,
}: SentryStarlightThemeOptions = {}): StarlightPlugin {
  return {
    name: packageName,
    hooks: {
      "config:setup"({ config, updateConfig, logger }) {
        const components: StarlightComponentOverrides = {
          ...(config.components ?? {}),
        };

        setStarlightComponentOverride({
          components,
          component: "Header",
          componentPath: headerComponent,
          logger,
          usage: `${packageName}'s Header design`,
        });
        setStarlightComponentOverride({
          components,
          component: "Footer",
          componentPath: footerComponent,
          logger,
          usage: `${packageName}'s Footer design`,
        });
        setStarlightComponentOverride({
          components,
          component: "MobileMenuFooter",
          componentPath: mobileMenuFooterComponent,
          logger,
          usage: `${packageName}'s MobileMenuFooter design`,
        });
        setStarlightComponentOverride({
          components,
          component: "Pagination",
          componentPath: paginationComponent,
          logger,
          usage: `${packageName}'s Pagination design`,
        });

        if (hideThemeSelect) {
          setStarlightComponentOverride({
            components,
            component: "ThemeSelect",
            componentPath: themeSelectComponent,
            logger,
            usage: `use ${packageName}'s single-theme behavior`,
          });
        }

        updateConfig({
          customCss: dedupeCss([themeCss, ...(config.customCss ?? [])]),
          components,
          head: [
            ...(config.head ?? []),
            // Prevent white FOUC before CSS loads by signaling dark color
            // scheme at HTML-parse time and inlining a black background.
            {
              tag: "meta",
              attrs: { name: "color-scheme", content: "dark" },
            },
            {
              tag: "style",
              content: "html{background:#0a0a0f}",
            },
          ],
          expressiveCode:
            config.expressiveCode === false
              ? false
              : buildExpressiveCodeConfig(getExpressiveCodeConfig(config)),
        });
      },
    },
  };
}

export default sentryStarlightTheme;

function getExpressiveCodeConfig(
  config: StarlightUserConfig,
): ExpressiveCodeConfig {
  if (!config.expressiveCode || config.expressiveCode === true) {
    return {};
  }

  return config.expressiveCode;
}

function buildExpressiveCodeConfig(
  userConfig: ExpressiveCodeConfig,
): ExpressiveCodeConfig {
  const userStyleOverrides = userConfig.styleOverrides ?? {};

  return {
    emitExternalStylesheet: false,
    minSyntaxHighlightingColorContrast: 7,
    themes: [monochromeCodeTheme],
    useStarlightDarkModeSwitch: false,
    useStarlightUiThemeColors: false,
    useThemedScrollbars: false,
    ...userConfig,
    styleOverrides: {
      borderColor: "transparent",
      borderRadius: "8px",
      borderWidth: "0px",
      codeBackground: "#111111",
      codeForeground: "#f5f5f5",
      codeFontFamily: "var(--__sl-font-mono)",
      codeFontSize: "var(--sl-text-code)",
      codeLineHeight: "1.65",
      codePaddingBlock: "0.9rem",
      codePaddingInline: "1rem",
      focusBorder: "#ffffff",
      gutterBorderColor: "var(--ve-line)",
      gutterForeground: "var(--ve-text-tertiary)",
      gutterHighlightForeground: "var(--ve-text)",
      scrollbarThumbColor: "#3a3a3a",
      scrollbarThumbHoverColor: "#626262",
      uiFontFamily: "var(--__sl-font)",
      uiFontSize: "0.82rem",
      uiLineHeight: "1.4",
      uiPaddingBlock: "0.35rem",
      uiPaddingInline: "0.75rem",
      ...userStyleOverrides,
      frames: {
        editorActiveTabBackground: "#000000",
        editorActiveTabBorderColor: "transparent",
        editorActiveTabIndicatorBottomColor: "transparent",
        editorActiveTabIndicatorHeight: "0px",
        editorActiveTabIndicatorTopColor: "transparent",
        editorBackground: "#111111",
        editorTabBarBackground: "#000000",
        editorTabBarBorderBottomColor: "transparent",
        editorTabBarBorderColor: "transparent",
        frameBoxShadowCssValue: "none",
        inlineButtonBackground: "transparent",
        inlineButtonBorder: "transparent",
        inlineButtonForeground: "var(--ve-text-secondary)",
        terminalBackground: "#111111",
        terminalTitlebarBackground: "#111111",
        terminalTitlebarBorderBottomColor: "transparent",
        ...userStyleOverrides.frames,
      },
    },
  };
}

function dedupeCss(css: NonNullable<StarlightUserConfig["customCss"]>) {
  return css.filter((item, index) => css.indexOf(item) === index);
}
