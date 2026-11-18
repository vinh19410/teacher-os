# Plan #768: Switch primary sans-serif font to Be Vietnam Pro

- **Issue:** https://github.com/vinh19410/teacher-os/issues/768
- **Branch:** `feat/768-be-vietnam-pro-font` (base: `develop`)
- **Status:** Verified & Reviewed (Ready to Ship to `develop`)

## Acceptance Criteria (Done means)

1. [x] `@fontsource-variable/geist` removed from `packages/ui/package.json`, `pnpm-lock.yaml`, and `packages/ui/src/styles/globals.css`.
2. [x] `@fontsource/be-vietnam-pro` installed in `@teacher-os/ui` and imported for weights `400`, `500`, `600`, `700`, `800` (normal & italic) in `packages/ui/src/styles/globals.css`.
3. [x] `--font-sans` updated to `"Be Vietnam Pro", ui-sans-serif, system-ui, -apple-system, sans-serif`; `--font-mono` remains `"Geist Mono Variable", ui-monospace, "JetBrains Mono", monospace`.
4. [x] `DESIGN.md`, `AGENTS.md`, and comment in `apps/admin/src/components/layout/admin-shell.tsx` updated.
5. [x] `web`, `student`, `admin` builds include `be-vietnam-pro` woff2 assets; browser verification confirms `document.fonts` loads `Be Vietnam Pro`, zero CSP errors, zero horizontal overflow/clipping across `1440x900`, `768x1024`, `375x812` (light & dark).
6. [ ] `pnpm exec biome check .`, `pnpm check-types`, `pnpm test`, `pnpm build` pass; isolated code review clean; PR merged into `develop` (`--beta --merge`); POT commented on #768 and issue labelled `shipped`.

## Phases

1. **Font package & CSS tokens** (`packages/ui/*`, `pnpm-lock.yaml`, `apps/admin/src/components/layout/admin-shell.tsx`)
2. **Docs sync** (`DESIGN.md`, `AGENTS.md`)
3. **Verification & 3-viewport POT** (`pnpm check`, `check-types`, `test`, `build`, Playwright 3-viewport check + screenshots in `plans/reports/`)
4. **Isolated review** (fresh `code-reviewer` subagent)
5. **Ship `--beta --merge`** (PR to `develop`, CI green, POT on #768, merge to `develop`, label `shipped`)
