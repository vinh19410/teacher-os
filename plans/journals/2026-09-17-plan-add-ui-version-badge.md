---
title: "plan: add-ui-version-badge"
date: 2026-09-17
summary: "Planned UI version badge (v{version} from root package.json) injected via Vite define; plan 260917-0519, GitHub issue #161"
---

# plan: add-ui-version-badge

## What happened
Ran `ak:plan --github` for a small UI feature: a tiny badge showing the running app version so post-deploy verification is possible.

Scout findings:
- Monorepo (turbo + pnpm), web app is Vite 8 + React + TanStack Router, deploys to Cloudflare Workers (`apps/web/src/worker.ts`).
- Root `package.json` holds the release version (`0.0.3`, bumped via `chore(release)` commits); `apps/web/package.json` is `0.0.0` and must NOT be the source.
- Sidebar (`apps/web/src/components/layout/sidebar.tsx`) already has a small mono chip pattern (the "PRO" badge) and `app:`-prefixed collapsed-branch invariant (D10).
- Existing `Badge` component at `apps/web/src/components/ui/badge.tsx` with `variant="muted"`.

## Decision
- Inject version at bundle time via Vite `define` global `__APP_VERSION__` read from root `package.json` in `apps/web/vite.config.ts` (fs/path already imported there). Rejected importing package.json into client code — would inline the whole manifest (deps list) into the bundle and dev/production behavior diverges.
- Place badge next to the "Teacher OS" logo inside the div that already gets `collapsed && "app:hidden"`, so the collapsed 64px rail needs no new logic.
- Extract a pure `VersionBadge` component so the vitest doesn't need TanStack Router context (`Sidebar` calls `useRouteContext({ from: "/_auth" })`).
- Mode: fast (simple task, clear scope). 2 phases: (1) injection + `src/vite-env.d.ts`, (2) badge UI + unit test + verification (`pnpm -F web test`, `pnpm -F web check-types` which includes the vite bundling step, `pnpm check`).

## Next steps
- Execute with `/ak:cook plans/260917-0519-add-ui-version-badge/plan.md` on branch `vinh19410/feat/ui-version-badge`.
- Optional follow-ups (out of scope): badge on login page for unauthenticated version checks; git SHA in tooltip.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
