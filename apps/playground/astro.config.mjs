import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
import sentryStarlightTheme, {
  monochromeCodeTheme,
  sentryAgentMarkdown,
} from "@sentry/starlight-theme";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://sentry-starlight-theme.local",
  devToolbar: {
    enabled: false,
  },
  integrations: [
    starlight({
      title: "Sentry Theme",
      description: "Playground for Sentry's shared Starlight theme.",
      customCss: ["./src/styles/playground.css"],
      pagination: true,
      sidebar: [
        {
          label: "Theme Fixtures",
          items: [
            { label: "Overview", link: "/" },
            { label: "Content", link: "/content/" },
            { label: "Code", link: "/code/" },
          ],
        },
        {
          label: "Documentation",
          items: [
            { label: "Overview", link: "/docs/" },
            { label: "Theme Setup", link: "/docs/theme-setup/" },
            { label: "Agent Markdown", link: "/docs/agent-markdown/" },
            {
              label: "Visual Verification",
              link: "/docs/visual-verification/",
            },
          ],
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/getsentry/sentry-starlight-theme",
        },
      ],
      plugins: [sentryStarlightTheme(), sentryAgentMarkdown()],
    }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: monochromeCodeTheme,
    },
  },
});
