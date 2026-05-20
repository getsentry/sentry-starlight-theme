import { monochromeCodeTheme } from "./themes/monochrome";

export { monochromeCodeTheme } from "./themes/monochrome";

const packageName = "@sentry/starlight-theme";
const themeCss = `${packageName}/styles/index.css`;
const footerComponent = `${packageName}/components/Footer.astro`;
const headerComponent = `${packageName}/components/Header.astro`;
const mobileMenuFooterComponent = `${packageName}/components/MobileMenuFooter.astro`;
const paginationComponent = `${packageName}/components/Pagination.astro`;
const themeSelectComponent = `${packageName}/components/ThemeSelect.astro`;

type ComponentOverrides = NonNullable<StarlightUserConfig["components"]>;
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
        const components: ComponentOverrides = { ...(config.components ?? {}) };

        setThemeComponent({
          components,
          component: "Header",
          componentPath: headerComponent,
          logger,
        });
        setThemeComponent({
          components,
          component: "Footer",
          componentPath: footerComponent,
          logger,
        });
        setThemeComponent({
          components,
          component: "MobileMenuFooter",
          componentPath: mobileMenuFooterComponent,
          logger,
        });
        setThemeComponent({
          components,
          component: "Pagination",
          componentPath: paginationComponent,
          logger,
        });

        if (hideThemeSelect) {
          if (components.ThemeSelect) {
            logger.warn(
              "A `<ThemeSelect>` component override is already defined in your Starlight configuration.",
            );
            logger.warn(
              `To use ${packageName}'s single-theme behavior, remove that override or render ${themeSelectComponent}.`,
            );
          } else {
            components.ThemeSelect = themeSelectComponent;
          }
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
              content: "html{background:#000}",
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

function setThemeComponent({
  components,
  component,
  componentPath,
  logger,
}: {
  components: ComponentOverrides;
  component: string;
  componentPath: string;
  logger: {
    warn(message: string): void;
  };
}) {
  if (components[component]) {
    logger.warn(
      `A \`<${component}>\` component override is already defined in your Starlight configuration.`,
    );
    logger.warn(
      `To use ${packageName}'s ${component} design, remove that override or render ${componentPath}.`,
    );
    return;
  }

  components[component] = componentPath;
}
