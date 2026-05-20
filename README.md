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
} from "@sentry/starlight-theme";
import { defineConfig } from "astro/config";

export default defineConfig({
  integrations: [
    starlight({
      title: "My Sentry project",
      plugins: [sentryStarlightTheme()],
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

## Develop

This repo includes a local Starlight playground app at `apps/playground`. It depends on `@sentry/starlight-theme` via `workspace:*`, so package changes are tested through the same import path consuming projects use.

```sh
pnpm install
pnpm dev
```

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
