# Agent Instructions

## File Tree

| Path                   | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `src/index.ts`         | Starlight plugin entrypoint and public exports.                    |
| `src/styles/index.css` | Shared Sentry Starlight CSS theme.                                 |
| `src/components/`      | Starlight component overrides exported by the package.             |
| `src/themes/`          | Syntax highlighting themes exported by the package.                |
| `apps/playground/`     | Private Starlight app for testing theme changes via `workspace:*`. |
| `scripts/`             | Release, Craft, and repo maintenance scripts.                      |
| `.github/workflows/`   | PR checks, post-merge artifact build, and release prep.            |
| `.craft.yml`           | Craft publish targets for npm and GitHub releases.                 |

## Package Manager

- Use pnpm: `pnpm install`.
- Keep `pnpm-lock.yaml` updated when dependencies change.

## Commands

| Task                   | Command                 |
| ---------------------- | ----------------------- |
| Start playground       | `pnpm dev`              |
| Lint and format check  | `pnpm lint`             |
| Format                 | `pnpm format`           |
| Theme typecheck        | `pnpm typecheck`        |
| Playground Astro check | `pnpm astro:check`      |
| Playground build       | `pnpm playground:build` |
| Release config check   | `pnpm release:check`    |
| Full validation        | `pnpm test`             |
| Package dry run        | `pnpm pack:dry`         |

## Conventions

- The root package is the published package: `@sentry/starlight-theme`.
- The playground is private and must not be included in the npm package.
- Keep package exports in `package.json` aligned with files under `src/`.
- Keep Craft target IDs, version bump files, and pack workflow aligned; verify with `pnpm release:check`.
- Do not edit generated `apps/playground/.astro/` or `apps/playground/dist/`.
- Use the playground for visual/theme behavior changes before changing release files.
- Put shared theme styling in `src/styles/index.css`, not in Astro component `<style>` blocks or inline `style` attributes. Component-scoped CSS can load after first paint and cause visible flicker in the playground and downstream docs sites.
- Keep Starlight component overrides in `src/components/` focused on markup and composition. If an override needs layout or visual styles, add stable classes and style them from `src/styles/index.css`.

## Release Notes

- Release prep is manual through `.github/workflows/release.yml`.
- Post-merge artifacts are built by `.github/workflows/merge-jobs.yml`.
- Craft publishes `sentry-starlight-theme-<version>.tgz` to npm as `@sentry/starlight-theme`.
