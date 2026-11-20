// Self-destruct stub: replaces the broken vite-plugin-pwa service worker
// (issue #125 — blank SPA boot, failed module fetches, stale shells across
// deploys). Any browser that still holds the old SW update-checks this file,
// byte-diffs it, installs it, and this activate step purges the workbox state.
// Only workbox-named caches are deleted: this stub can activate opportunistically
// in any browser with an old registration, and the app may grow its own
// non-workbox Cache Storage users later.
self.addEventListener("install", () => {
	self.skipWaiting();
});
self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			for (const key of await caches.keys()) {
				if (key.startsWith("workbox")) await caches.delete(key);
			}
			await self.registration.unregister();
			for (const client of await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			})) {
				// navigate() rejects asynchronously (e.g. client mid-navigation);
				// the rejection must never abort the loop for remaining clients.
				client.navigate(client.url).catch(() => {});
			}
		})(),
	);
});
