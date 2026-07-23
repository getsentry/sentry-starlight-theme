# @sentry/starlight-theme

Shared Astro Starlight theme for Sentry docs sites.

## Install

```sh
pnpm add @sentry/starlight-theme @astrojs/starlight astro
```

## Use

```js
import starlight from "@astrojs/starlight";
import sentryStarlightTheme, {
  monochromeCodeTheme,
  sentryAgentMarkdown,
} from "@sentry/starlight-theme";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Sentry project",
      plugins: [sentryStarlightTheme(), sentryAgentMarkdown()],
    }),
  ],
  markdown: {
    shikiConfig: {
      theme: monochromeCodeTheme,
    },
  },
});
```

The plugin installs the shared CSS, applies the monochrome Expressive Code theme, and overrides Starlight's `ThemeSelect` with an empty component because this theme is intentionally dark-only. Project-level `customCss` is kept after the package CSS so consuming docs sites can make small local adjustments.

## Known consumers

These repositories use this theme and help define future compatibility requirements:

- [getsentry/warden](https://github.com/getsentry/warden)
- [getsentry/vitest-evals](https://github.com/getsentry/vitest-evals)
- [getsentry/dotagents](https://github.com/getsentry/dotagents)
- [getsentry/cli](https://github.com/getsentry/cli)
- [getsentry/junior](https://github.com/getsentry/junior)

## Copyable prompts

Use the shared `CopyPrompt` component in MDX to give readers a collapsible prompt with clipboard feedback:

```mdx
import CopyPrompt from "@sentry/starlight-theme/components/CopyPrompt.astro";

export const prompt = `Review this repository.

1. Make the **smallest coherent change**.
2. Run the project checks.`;

<CopyPrompt content={prompt} />
```

The raw Markdown `content` is shown as a code block in the expanded panel and copied unchanged. Set `open` to expand it initially, or customize the button's accessible name with `copyLabel`.

## Markdown for AI agents

`sentryAgentMarkdown()` generates static `.md` versions of Starlight docs pages for LLM and coding-agent clients:

- `/index.md` for the root docs page.
- `/<slug>.md` for every other docs page.

Markdown responses include YAML metadata (`title`, `description`, and `url`), use `text/markdown; charset=utf-8`, and rewrite internal docs links to `.md` URLs when possible. The exporter uses rendered HTML when Astro makes it available and otherwise falls back to normalized source Markdown/MDX, stripping common JSX wrappers and import/export statements.

Markdown pages also include lightweight navigation sections derived from the docs collection and explicit Starlight sidebar config when present. Non-root pages get a `Navigation` section with docs-home and previous/next sibling links, plus a parent link for nested pages. Pages with visible child pages also get a `Pages in this section` list. Draft, hidden, and versioned pages are omitted from these lists.

Disable generated navigation if a site already owns its Markdown index content:

```js
sentryAgentMarkdown({
  navigation: false,
});
```

The plugin also adds a copy-to-clipboard Markdown action below Starlight's right-sidebar table of contents. Disable this if a site has its own table-of-contents override:

```js
sentryAgentMarkdown({
  markdownActions: false,
});
```

By default, the plugin only emits static Markdown routes. SSR/on-demand deployments can also enable `Accept: text/markdown` handling:

```js
sentryAgentMarkdown({
  contentNegotiation: true,
});
```

Static deployments cannot vary an already-built HTML page by request headers without platform-level rewrites, so keep content negotiation disabled unless the site runs Astro middleware at request time.

When content negotiation is enabled, the middleware also serves Markdown for `?format=md`, `Accept: text/plain`, and common AI-agent user agents.

This is intentionally lighter weight than Sentry's main docs pipeline, which converts built HTML after the site build. Highly custom MDX components may need site-specific Markdown authoring or a post-build exporter for perfect output.

## Develop

This repo includes a local Starlight playground app at `apps/playground`. It depends on `@sentry/starlight-theme` via `workspace:*`, so package changes are tested through the same import path consuming projects use.

```sh
pnpm install
pnpm dev
```

Treat the playground as the package's visual sandbox. Add or update a playground fixture before changing shared visual behavior, component overrides, or rendered HTML patterns that the Markdown exporter needs to understand. The `Documentation` section in the playground mirrors a consuming docs site and covers theme setup, agent Markdown options, and visual verification checks.

Useful commands:

- `pnpm dev` starts the playground site.
- `pnpm lint` runs ESLint and Prettier checks.
- `pnpm format` formats the repo with Prettier.
- `pnpm astro:check` runs Astro diagnostics for the playground.
- `pnpm playground:build` builds the playground.
- `pnpm typecheck` typechecks the theme package.
- `pnpm pack:dry` shows the files that would be published.
- `pnpm release:check` validates Craft/workflow package alignment.
- `pnpm test` runs release config validation, package typecheck, Astro check, playground build, and package dry run.

## Release

Releases are managed by Craft through GitHub Actions:

- `.github/workflows/release.yml` manually prepares a release PR with `getsentry/action-prepare-release`.
- `.github/workflows/merge-jobs.yml` runs after merges to `main` and `release/*`, then uploads the npm tarball artifact named by the commit SHA.
- `.craft.yml` publishes the `sentry-starlight-theme-<version>.tgz` artifact to npm as `@sentry/starlight-theme` and creates the GitHub release tag.

The release workflow expects the standard Sentry release bot variables and secrets: `SENTRY_RELEASE_BOT_CLIENT_ID` and `SENTRY_RELEASE_BOT_PRIVATE_KEY`.
