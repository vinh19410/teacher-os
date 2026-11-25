import { useEffect, useLayoutEffect, useRef } from "react";

const SCROLL_EPSILON_PX = 1;
const SMOOTH_FALLBACK_MS = 600;

const useIsomorphicLayoutEffect =
	typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface SmoothTrackState {
	target: number | null;
	timer: ReturnType<typeof setTimeout> | null;
}

function parsePx(value: string | undefined): number {
	const parsed = Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Collision-free signature over tab `[id, label]` pairs so unrelated parent
 * re-renders passing fresh inline `tabs={[...]}` literals do not re-trigger
 * auto-scroll, while dynamic label changes (e.g. validation error counts) do.
 */
export function createTabsSignature(
	tabs: readonly { id: string; label: string }[],
): string {
	return JSON.stringify(tabs.map((tab) => [tab.id, tab.label]));
}

export function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		Boolean(window.matchMedia("(prefers-reduced-motion: reduce)")?.matches)
	);
}

/**
 * Computes the minimal horizontal `scrollLeft` needed to bring `activeTab`
 * completely inside `container`'s padded horizontal viewport (`inline: "nearest"`),
 * without touching vertical ancestor scroll containers. Returns `null` when no
 * scroll is needed.
 */
export function computeActiveTabScrollLeft(
	container: HTMLElement,
	activeTab: HTMLElement,
): number | null {
	if (!container.contains(activeTab)) return null;

	const maxScrollLeft = container.scrollWidth - container.clientWidth;
	if (container.clientWidth <= 0 || maxScrollLeft <= 0) return null;

	const containerRect = container.getBoundingClientRect();
	const tabRect = activeTab.getBoundingClientRect();
	if (containerRect.width <= 0 || tabRect.width <= 0) return null;

	const style =
		typeof getComputedStyle === "function" ? getComputedStyle(container) : null;
	const padLeft = parsePx(style?.paddingLeft);
	const padRight = parsePx(style?.paddingRight);

	const innerLeft = containerRect.left + container.clientLeft;
	const innerRight = innerLeft + container.clientWidth;
	const hasRoomForPadding = padLeft + padRight < container.clientWidth;
	const safeLeft = hasRoomForPadding ? innerLeft + padLeft : innerLeft;
	const safeRight = hasRoomForPadding ? innerRight - padRight : innerRight;

	let delta: number;
	if (tabRect.left < safeLeft - SCROLL_EPSILON_PX) {
		delta = tabRect.left - safeLeft;
	} else if (tabRect.right > safeRight + SCROLL_EPSILON_PX) {
		delta = Math.min(tabRect.right - safeRight, tabRect.left - safeLeft);
	} else {
		return null;
	}

	const nextLeft = Math.min(
		maxScrollLeft,
		Math.max(0, container.scrollLeft + delta),
	);
	if (
		!Number.isFinite(nextLeft) ||
		Math.abs(nextLeft - container.scrollLeft) < SCROLL_EPSILON_PX
	) {
		return null;
	}

	return nextLeft;
}

function scrollContainer(
	container: HTMLElement,
	left: number,
	behavior: ScrollBehavior,
): boolean {
	if (typeof container.scrollTo === "function") {
		try {
			container.scrollTo({ left, behavior });
			return true;
		} catch {
			// Fall back to direct scrollLeft when ScrollToOptions is unsupported.
		}
	}
	container.scrollLeft = left;
	return false;
}

function clearSmoothTracking(state: SmoothTrackState): void {
	state.target = null;
	if (state.timer !== null) {
		clearTimeout(state.timer);
		state.timer = null;
	}
}

function alignActiveTab(
	container: HTMLElement | null,
	activeTab: HTMLElement | null,
	smoothState: SmoothTrackState,
	behavior: ScrollBehavior,
	cancelSmoothIfVisible: boolean,
): void {
	if (!container || !activeTab) return;

	const nextLeft = computeActiveTabScrollLeft(container, activeTab);
	if (nextLeft === null) {
		if (cancelSmoothIfVisible && smoothState.target !== null) {
			const inFlightTarget = smoothState.target;
			clearSmoothTracking(smoothState);
			if (
				Math.abs(container.scrollLeft - inFlightTarget) >= SCROLL_EPSILON_PX
			) {
				scrollContainer(container, container.scrollLeft, "instant");
			}
		}
		return;
	}

	clearSmoothTracking(smoothState);
	const usedScrollTo = scrollContainer(container, nextLeft, behavior);
	if (behavior === "smooth" && usedScrollTo) {
		smoothState.target = nextLeft;
		smoothState.timer = setTimeout(() => {
			smoothState.target = null;
			smoothState.timer = null;
		}, SMOOTH_FALLBACK_MS);
	}
}

/**
 * Keeps the active tab horizontally scrolled into view inside an `overflow-x-auto`
 * tablist on initial mount, active-tab change, dynamic label change, webfont load,
 * and container width resize, without scrolling ancestor vertical containers.
 */
export function useScrollActiveTab(active: string, tabsSignature: string) {
	const tablistRef = useRef<HTMLDivElement | null>(null);
	const activeTabRef = useRef<HTMLButtonElement | null>(null);
	const hasMountedRef = useRef(false);
	const prevActiveRef = useRef(active);
	const prevTabsSignatureRef = useRef(tabsSignature);
	const userInteractedRef = useRef(false);
	const wasHiddenOnMountRef = useRef(false);
	const smoothStateRef = useRef<SmoothTrackState>({
		target: null,
		timer: null,
	});

	useIsomorphicLayoutEffect(() => {
		const isInitial = !hasMountedRef.current;
		const activeChanged = prevActiveRef.current !== active;
		const tabsChanged = prevTabsSignatureRef.current !== tabsSignature;

		hasMountedRef.current = true;
		prevActiveRef.current = active;
		prevTabsSignatureRef.current = tabsSignature;

		if (!isInitial && !activeChanged && !tabsChanged) return;

		if (isInitial && (tablistRef.current?.clientWidth ?? 0) <= 0) {
			wasHiddenOnMountRef.current = true;
		}

		const behavior: ScrollBehavior =
			!isInitial && activeChanged && !prefersReducedMotion()
				? "smooth"
				: "instant";

		alignActiveTab(
			tablistRef.current,
			activeTabRef.current,
			smoothStateRef.current,
			behavior,
			!isInitial,
		);
	}, [active, tabsSignature]);

	useEffect(() => {
		const container = tablistRef.current;
		if (!container) return;

		const smoothState = smoothStateRef.current;
		let cancelled = false;
		let rafScheduled = false;
		let rafId: number | null = null;

		const onPointerDown = (event: PointerEvent) => {
			userInteractedRef.current = true;
			// Mouse clicks on child tab buttons do not interrupt an in-flight
			// smooth scroll in Chromium; keep smoothState intact so clicking a
			// visible tab mid-flight can cancel the old animation explicitly.
			if (event.pointerType === "touch" || event.target === container) {
				clearSmoothTracking(smoothState);
			}
		};
		const onScrollGesture = () => {
			userInteractedRef.current = true;
			clearSmoothTracking(smoothState);
		};
		const onScrollEnd = () => {
			// Ignore queued scrollend events from an earlier scroll before the
			// current smooth scroll reaches its target.
			if (
				smoothState.target !== null &&
				Math.abs(container.scrollLeft - smoothState.target) < SCROLL_EPSILON_PX
			) {
				clearSmoothTracking(smoothState);
			}
		};

		container.addEventListener("pointerdown", onPointerDown, {
			passive: true,
		});
		container.addEventListener("wheel", onScrollGesture, { passive: true });
		container.addEventListener("touchstart", onScrollGesture, {
			passive: true,
		});
		container.addEventListener("scrollend", onScrollEnd, { passive: true });

		if (
			typeof document !== "undefined" &&
			document.fonts &&
			document.fonts.status !== "loaded"
		) {
			void Promise.resolve(document.fonts.ready)
				.then(() => {
					if (cancelled || userInteractedRef.current) return;
					alignActiveTab(
						container,
						activeTabRef.current,
						smoothState,
						"instant",
						true,
					);
				})
				.catch(() => {});
		}

		let observer: ResizeObserver | null = null;
		if (typeof ResizeObserver !== "undefined") {
			let lastWidth = wasHiddenOnMountRef.current ? 0 : container.clientWidth;

			const runResizeCheck = () => {
				rafScheduled = false;
				rafId = null;
				if (cancelled) return;
				const nextWidth = container.clientWidth;
				if (nextWidth === lastWidth) return;
				lastWidth = nextWidth;
				alignActiveTab(
					container,
					activeTabRef.current,
					smoothState,
					"instant",
					true,
				);
			};

			observer = new ResizeObserver(() => {
				if (typeof requestAnimationFrame === "function") {
					if (rafScheduled) return;
					rafScheduled = true;
					const scheduledId = requestAnimationFrame(runResizeCheck);
					if (rafScheduled) {
						rafId = scheduledId;
					}
					return;
				}
				runResizeCheck();
			});
			observer.observe(container);
		}

		return () => {
			cancelled = true;
			if (rafId !== null && typeof cancelAnimationFrame === "function") {
				cancelAnimationFrame(rafId);
			}
			rafScheduled = false;
			rafId = null;
			observer?.disconnect();
			container.removeEventListener("pointerdown", onPointerDown);
			container.removeEventListener("wheel", onScrollGesture);
			container.removeEventListener("touchstart", onScrollGesture);
			container.removeEventListener("scrollend", onScrollEnd);
			clearSmoothTracking(smoothState);
		};
	}, []);

	return { tablistRef, activeTabRef };
}
