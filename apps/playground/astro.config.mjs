import mdx from "@astrojs/mdx";
import starlight from "@astrojs/starlight";
import sentryStarlightTheme, {
  monochromeCodeTheme,
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
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/getsentry/sentry-starlight-theme",
        },
      ],
      plugins: [sentryStarlightTheme()],
    }),
    mdx(),
  ],
  markdown: {
    shikiConfig: {
      theme: monochromeCodeTheme,
    },
  },
});
