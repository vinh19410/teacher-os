---
phase: 1
title: "Remove the broken PWA service worker"
status: pending
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 1: Remove the broken PWA service worker

## Overview

Remove the vite-plugin-pwa service worker from the web build (the root cause of
the staging blank-boot/broken-fetch behavior) and ship self-unregistering
stubs so browsers that already installed the broken SW (QC's browser, all
earlier staging visitors) self-heal without manual DevTools intervention —
dev-shell browsers via `/dev-sw.js`, staging/prod browsers via `/sw.js`.

## Requirements

- Functional: no service worker registers on any page (dev, staging, prod);
  browsers with a previously-installed workbox SW converge to a clean,
  network-served app (stale shell served at most once more, then fresh).
- Functional: `GET /sw.js`, `GET /registerSW.js`, and `GET /dev-sw.js` keep
  returning real JavaScript (never the SPA HTML fallback) so stale shells and
  dev shells can update/unregister.
- Non-functional: no changes to API/auth code in this phase; removal must not
  touch the app shell or routing.

## Architecture

The plugin (`VitePWA` in `apps/web/vite.config.ts`, `registerType: "autoUpdate"`,
`devOptions.enabled: true`) precaches `index.html` and injects `/registerSW.js`
into the built HTML. Evidence shows this layer breaks first boot (blank `#app`,
failed dynamic import) and serves stale shells across deploys. The app has no
offline feature; the SW provides no value today, so removal is the honest fix.

Self-heal chain for an affected staging/prod browser (e.g. QC's):
1. Navigation request → old SW serves precached old `index.html` (stale shell,
   at most one more time).
2. Browser update-checks `/sw.js` → network stub differs by bytes → installs →
   `skipWaiting` → activates. (The update check reaches the network because
   Workers assets serve `Cache-Control: public, max-age=0, must-revalidate`;
   Phase 3 asserts this header so the assumption stays pinned.)
3. Stub activate: claim clients, delete every Cache Storage bucket
   (`workbox-precache-v2-*`), `registration.unregister()`, then navigate open
   clients (must use `includeUncontrolled: true` — without `clients.claim()`
   the default `matchAll` returns an empty list and the reload loop is dead
   code).
4. Next navigation: no SW, fresh `index.html` from network → app works.

Known benign race: a stale shell's precached `registerSW.js` may call
`register('/sw.js')` right after the stub unregisters; the stub then
reinstalls, purges again, and converges one cycle later. Convergence relies on
the `/sw.js` byte-diff (the update-check target), not on the `registerSW.js`
no-op — that no-op only matters for shells that fetch it after the old SW is
gone.

Dev-shell heal: `devOptions.enabled: true` registered a dev SW at
`/dev-sw.js?dev-sw`. A `public/dev-sw.js` stub (same body) lets those browsers
update-check and self-unregister; without it the update check SPA-falls-back to
HTML and the stale dev registration persists indefinitely.

Regression guard reality (red-team Finding A): the Playwright suite runs with
`serviceWorkers: "block"` globally, so SW behavior is invisible to the default
suite. The new spec opts into `serviceWorkers: "allow"` so its assertions are
falsifiable; the heal-on-real-browsers criterion is additionally verified
manually on staging (done during investigation: SW removal → app renders and
auth round-trips) and `/sw.js` serving is asserted by the Phase 3 deploy smoke.

## Related Code Files

- Modify: `apps/web/vite.config.ts` — remove `VitePWA` plugin + import.
- Modify: `apps/web/package.json` — remove `vite-plugin-pwa`,
  `@vite-pwa/assets-generator`, `generate-pwa-assets` script; run
  `pnpm install` to sync the lockfile (CI uses `--frozen-lockfile`).
- Delete: `apps/web/pwa-assets.config.ts` (only consumed by the removed script).
- Create: `apps/web/public/sw.js` — self-unregistering stub (see steps).
- Create: `apps/web/public/dev-sw.js` — same stub body (dev-shell heal).
- Create: `apps/web/public/registerSW.js` — no-op stub (comment-only).
- Modify: `apps/e2e/playwright.config.ts` — rewrite the `serviceWorkers:
  "block"` comment: the block stays, now guarding against any future SW
  (including the shipped stubs) breaking reload-based assertions.
- Modify: `README.md` — remove the PWA feature bullet and the
  `generate-pwa-assets` doc line.
- Keep: `apps/web/public/logo.png`. Accepted noise: old shells requesting
  `/manifest.webmanifest` log a harmless manifest parse error during the
  one-time heal.

## Implementation Steps

1. Write the e2e spec first (`apps/e2e/specs/no-service-worker.spec.ts`) with
   `test.use({ serviceWorkers: "allow" })` so the assertions can actually fail:
   - `GET /sw.js`, `/registerSW.js`, `/dev-sw.js` → 200, content-type
     `text/javascript`, bodies contain `unregister` and `caches.delete`
     (registerSW.js no-op excepted — JS but comment-only).
   - After the load, `/sw.js` response carries `cache-control` with
     `max-age=0`, `no-store`, or `no-cache` (any revalidate-before-reuse
     policy keeps the update check on the network; dev serves `no-cache`,
     Workers assets serve `max-age=0`).
   - **Behavioral stub-lifecycle test (advisory condition — prevents a
     vacuously-green spec):** in a page with `serviceWorkers: "allow"`,
     explicitly `navigator.serviceWorker.register('/sw.js')`, seed a dummy
     Cache Storage entry, then assert the registrations drain to empty and
     `caches.keys()` empties (the stub's activate ran), and a following
     reload renders the app.
   - `page.goto('/')` → `navigator.serviceWorker.getRegistrations()` length 0
     and `navigator.serviceWorker.controller` null (meaningful under `allow`;
     tautological under the global `block`).
2. Edit `apps/web/vite.config.ts`: drop `VitePWA(...)` and its import.
3. Create `public/sw.js` and `public/dev-sw.js` stubs:
   ```js
   // Self-destruct stub: replaces the broken vite-plugin-pwa SW (issue #125).
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", (event) => {
     event.waitUntil(
       (async () => {
         await self.clients.claim();
         for (const key of await caches.keys()) await caches.delete(key);
         await self.registration.unregister();
         for (const client of await self.clients.matchAll({
           type: "window",
           includeUncontrolled: true,
         })) {
           try {
             client.navigate(client.url);
           } catch {
             // client mid-navigation; it will pick up the clean state itself
           }
         }
       })(),
     );
   });
   ```
4. Create `public/registerSW.js` no-op (comment only — stale shells load it;
   it must be real JS, not the SPA fallback).
5. Package cleanup + `pnpm install` (lockfile sync), delete
   `pwa-assets.config.ts`; README + playwright.config comment updates.
6. Run local gates: `pnpm exec biome check .`, `pnpm test`, `pnpm check-types`,
   `pnpm build`; verify `dist/` has the three stub files and **no** workbox
   precache manifest / injected SW registration in `index.html`; run the e2e
   suite (auth specs + the new no-SW spec).

## Success Criteria

- [x] New e2e spec (with `serviceWorkers: "allow"`) passes and is demonstrably
      falsifiable (it fails against the pre-fix build with the plugin's dev SW).
- [x] `dist/` contains the stubs, no workbox manifest, no SW registration
      injected into `index.html`.
- [x] All repo gates green (biome, test, check-types, build).
