# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the plugin source. Key areas: `modules/` (MyParcel domain logic), `providers/` (integrations), `api/` (admin routes), `admin/` (UI), plus `workflows/`, `jobs/`, `subscribers/`, and `links/`.
- `.medusa/server/` is generated build output. Treat it as read-only.
- `scripts/` contains build/setup helpers (for example `scripts/patch-buffer-equal-constant-time.js`).

## Build, Test, and Development Commands
- `yarn dev` — runs `medusa plugin:develop` for local development.
- `yarn build` — builds the plugin into `.medusa/server/`.
- `yarn prepublishOnly` — runs the build before publishing.
- `yarn postinstall` — automatically patches dependencies after install.

No test script is currently defined in `package.json`. Add one if you introduce tests.

## Coding Style & Naming Conventions
- TypeScript + React codebase; follow the existing 2‑space indentation and ES module imports.
- Naming patterns: module folders under `src/modules/` (for example `myparcel`), with `index.ts`, `service.ts`, `constants.ts`, and `types.ts` as appropriate.
- Admin routes follow `src/admin/routes/<area>/<feature>/page.tsx`.

## Testing Guidelines
- There are no tests in this repo today. If you add tests, keep them close to the feature (for example `src/modules/myparcel/__tests__/...`).
- `@medusajs/test-utils` is available in devDependencies if you need Medusa test helpers.

## Commit & Pull Request Guidelines
- Commit history is short and sentence‑case (for example “Project setup”). Keep messages concise and descriptive.
- PRs should include: a brief summary, testing notes (or “not tested”), and screenshots for admin UI changes.

## Security & Configuration Tips
- Requires Node `>=20` and Yarn `1.22.19` (see `package.json`).
- Keep MyParcel credentials and API keys in environment/config files; do not commit secrets.
