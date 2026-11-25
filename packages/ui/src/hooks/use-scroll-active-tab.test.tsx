import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	computeActiveTabScrollLeft,
	createTabsSignature,
	prefersReducedMotion,
	useScrollActiveTab,
} from "./use-scroll-active-tab";

interface RectInput {
	left: number;
	width: number;
	top?: number;
	height?: number;
}

function makeRect({ left, width, top = 0, height = 36 }: RectInput): DOMRect {
	return {
		x: left,
		y: top,
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON() {
			return {};
		},
	} as DOMRect;
}

function mockElementMetrics(
	el: HTMLElement,
	opts: {
		scrollWidth?: number;
		clientWidth?: number;
		clientLeft?: number;
		scrollLeft?: number;
		rect: RectInput;
	},
): void {
	if (opts.scrollWidth !== undefined) {
		Object.defineProperty(el, "scrollWidth", {
			configurable: true,
			value: opts.scrollWidth,
		});
	}
	if (opts.clientWidth !== undefined) {
		Object.defineProperty(el, "clientWidth", {
			configurable: true,
			value: opts.clientWidth,
		});
	}
	if (opts.clientLeft !== undefined) {
		Object.defineProperty(el, "clientLeft", {
			configurable: true,
			value: opts.clientLeft,
		});
	}
	if (opts.scrollLeft !== undefined) {
		el.scrollLeft = opts.scrollLeft;
	}
	vi.spyOn(el, "getBoundingClientRect").mockImplementation(() =>
		makeRect(opts.rect),
	);
}

type SavedDescriptor = {
	target: object;
	prop: PropertyKey;
	descriptor: PropertyDescriptor | undefined;
};

const savedDescriptors: SavedDescriptor[] = [];

function stubDescriptor(
	target: object,
	prop: PropertyKey,
	descriptor: PropertyDescriptor,
): void {
	const alreadySaved = savedDescriptors.some(
		(entry) => entry.target === target && entry.prop === prop,
	);
	if (!alreadySaved) {
		savedDescriptors.push({
			target,
			prop,
			descriptor: Object.getOwnPropertyDescriptor(target, prop),
		});
	}
	Object.defineProperty(target, prop, descriptor);
}

function restoreDescriptors(): void {
	while (savedDescriptors.length > 0) {
		const entry = savedDescriptors.pop();
		if (!entry) continue;
		if (entry.descriptor) {
			Object.defineProperty(entry.target, entry.prop, entry.descriptor);
		} else {
			Reflect.deleteProperty(entry.target, entry.prop);
		}
	}
}

function stubReducedMotion(matches: boolean): void {
	stubDescriptor(window, "matchMedia", {
		configurable: true,
		writable: true,
		value: vi.fn((query: string) => ({
			matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
}

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
	MockResizeObserver.instances = [];
	restoreDescriptors();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("createTabsSignature", () => {
	it("produces identical signatures for equal [id, label] across new arrays", () => {
		const first = createTabsSignature([
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		]);
		const second = createTabsSignature([
			{ id: "a", label: "Alpha" },
			{ id: "b", label: "Beta" },
		]);
		expect(first).toBe(second);
	});

	it("changes when a tab label changes dynamically", () => {
		const before = createTabsSignature([{ id: "speaking", label: "Speaking" }]);
		const after = createTabsSignature([
			{ id: "speaking", label: "Speaking (2 lỗi)" },
		]);
		expect(before).not.toBe(after);
	});

	it("avoids delimiter collisions for arbitrary string IDs", () => {
		const one = createTabsSignature([{ id: "a\u0000b", label: "x" }]);
		const two = createTabsSignature([
			{ id: "a", label: "b" },
			{ id: "x", label: "" },
		]);
		expect(one).not.toBe(two);
	});
});

describe("prefersReducedMotion", () => {
	it("returns true when matchMedia reports reduce", () => {
		stubReducedMotion(true);
		expect(prefersReducedMotion()).toBe(true);
	});

	it("returns false when matchMedia reports no-preference", () => {
		stubReducedMotion(false);
		expect(prefersReducedMotion()).toBe(false);
	});

	it("returns false when matchMedia is missing or returns undefined", () => {
		stubDescriptor(window, "matchMedia", {
			configurable: true,
			writable: true,
			value: undefined,
		});
		expect(prefersReducedMotion()).toBe(false);

		stubDescriptor(window, "matchMedia", {
			configurable: true,
			writable: true,
			value: vi.fn(() => undefined),
		});
		expect(prefersReducedMotion()).toBe(false);
	});
});

describe("computeActiveTabScrollLeft", () => {
	function createContainerAndTab() {
		const container = document.createElement("div");
		const tab = document.createElement("button");
		container.appendChild(tab);
		document.body.appendChild(container);
		return { container, tab };
	}

	it("returns null when activeTab is not contained in container", () => {
		const container = document.createElement("div");
		const outside = document.createElement("button");
		document.body.append(container, outside);
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 300,
			scrollLeft: 0,
			rect: { left: 0, width: 300 },
		});
		mockElementMetrics(outside, { rect: { left: 450, width: 100 } });
		expect(computeActiveTabScrollLeft(container, outside)).toBeNull();
	});

	it("returns null when there is no horizontal overflow", () => {
		const { container, tab } = createContainerAndTab();
		mockElementMetrics(container, {
			scrollWidth: 300,
			clientWidth: 300,
			scrollLeft: 0,
			rect: { left: 0, width: 300 },
		});
		mockElementMetrics(tab, { rect: { left: 200, width: 80 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();
	});

	it("returns null when container or tab width is non-positive", () => {
		const { container, tab } = createContainerAndTab();
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 300,
			scrollLeft: 0,
			rect: { left: 0, width: 0 },
		});
		mockElementMetrics(tab, { rect: { left: 450, width: 100 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();

		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 300,
			scrollLeft: 0,
			rect: { left: 0, width: 300 },
		});
		mockElementMetrics(tab, { rect: { left: 450, width: 0 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();
	});

	it("returns null when active tab already sits within padded safe bounds", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "3px";
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 343,
			scrollLeft: 100,
			rect: { left: 16, width: 343 },
		});
		// safeLeft = 19, safeRight = 356
		mockElementMetrics(tab, { rect: { left: 19, width: 120 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();
	});

	it("handles empty string padding on one side without NaN corruption", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "";
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 300,
			scrollLeft: 100,
			rect: { left: 10, width: 300 },
		});
		// safeLeft = 13; tab.left = 5 => delta = -8 => nextLeft = 92
		mockElementMetrics(tab, { rect: { left: 5, width: 80 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(92);
	});

	it("scrolls right when active tab is clipped or off-screen to the right, clamped to maxScrollLeft", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "3px";
		mockElementMetrics(container, {
			scrollWidth: 620,
			clientWidth: 343,
			scrollLeft: 0,
			rect: { left: 16, width: 343 },
		});
		// safeRight = 16 + 343 - 3 = 356; tab right = 520 => delta = 164
		mockElementMetrics(tab, { rect: { left: 440, width: 80 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(164);

		// Past maxScrollLeft (620 - 343 = 277) => clamped to 277
		mockElementMetrics(tab, { rect: { left: 560, width: 100 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(277);
	});

	it("scrolls left when active tab is clipped or off-screen to the left, clamped to 0", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "3px";
		mockElementMetrics(container, {
			scrollWidth: 620,
			clientWidth: 343,
			scrollLeft: 200,
			rect: { left: 16, width: 343 },
		});
		// safeLeft = 19; tab left = -31 => delta = -50 => nextLeft = 150
		mockElementMetrics(tab, { rect: { left: -31, width: 90 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(150);

		// Clamped to 0
		mockElementMetrics(tab, { rect: { left: -240, width: 90 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(0);
	});

	it("aligns start edge when a single active tab is wider than the container", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "3px";
		mockElementMetrics(container, {
			scrollWidth: 700,
			clientWidth: 200,
			scrollLeft: 0,
			rect: { left: 10, width: 200 },
		});
		// safeLeft = 13, safeRight = 207; tab [50..350] (width 300 > 194)
		// right - safeRight = 143, left - safeLeft = 37 => min = 37
		mockElementMetrics(tab, { rect: { left: 50, width: 300 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(37);
	});

	it("returns null at maxScrollLeft when trailing padding would request <1px change", () => {
		const { container, tab } = createContainerAndTab();
		container.style.paddingLeft = "3px";
		container.style.paddingRight = "3px";
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 343,
			scrollLeft: 257, // already at maxScrollLeft
			rect: { left: 16, width: 343 },
		});
		// Last tab right sits at innerRight = 359 (> safeRight 356), but clamped nextLeft is still 257
		mockElementMetrics(tab, { rect: { left: 280, width: 79 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();
	});

	it("accounts for clientLeft border offset", () => {
		const { container, tab } = createContainerAndTab();
		mockElementMetrics(container, {
			scrollWidth: 500,
			clientWidth: 200,
			clientLeft: 2,
			scrollLeft: 50,
			rect: { left: 10, width: 204 },
		});
		// innerLeft = 12, innerRight = 212; tab right = 250 => delta = 38 => nextLeft = 88
		mockElementMetrics(tab, { rect: { left: 170, width: 80 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBe(88);
	});
});

interface HarnessTab {
	id: string;
	label: string;
}

const DEFAULT_TABS: HarnessTab[] = [
	{ id: "t1", label: "Tab 1" },
	{ id: "t2", label: "Tab 2" },
	{ id: "t3", label: "Tab 3" },
	{ id: "t4", label: "Tab 4" },
	{ id: "t5", label: "Tab 5" },
	{ id: "t6", label: "Tab 6" },
];

function TabsHarness({
	tabs,
	active,
}: {
	tabs: readonly HarnessTab[];
	active: string;
}) {
	const { tablistRef, activeTabRef } = useScrollActiveTab(
		active,
		createTabsSignature(tabs),
	);
	return (
		<div ref={tablistRef} role="tablist">
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					data-tab-id={tab.id}
					aria-selected={tab.id === active}
					ref={tab.id === active ? activeTabRef : undefined}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}

interface LayoutModel {
	clientWidth: number;
	scrollWidth: number;
	containerLeft: number;
	tabWidth: number;
	scrollLeft: number;
	updateScrollLeftOnScrollTo?: boolean;
	throwOnScrollTo?: boolean;
	omitScrollTo?: boolean;
}

function installPrototypeLayoutMock(model: LayoutModel) {
	const scrollToCalls: ScrollToOptions[] = [];

	stubDescriptor(HTMLElement.prototype, "clientWidth", {
		configurable: true,
		get() {
			return (this as HTMLElement).getAttribute("role") === "tablist"
				? model.clientWidth
				: model.tabWidth;
		},
	});
	stubDescriptor(HTMLElement.prototype, "scrollWidth", {
		configurable: true,
		get() {
			return (this as HTMLElement).getAttribute("role") === "tablist"
				? model.scrollWidth
				: model.tabWidth;
		},
	});
	stubDescriptor(HTMLElement.prototype, "scrollLeft", {
		configurable: true,
		get() {
			return (this as HTMLElement).getAttribute("role") === "tablist"
				? model.scrollLeft
				: 0;
		},
		set(value: number) {
			if ((this as HTMLElement).getAttribute("role") === "tablist") {
				model.scrollLeft = value;
			}
		},
	});
	stubDescriptor(HTMLElement.prototype, "getBoundingClientRect", {
		configurable: true,
		value: function getBoundingClientRect() {
			const el = this as HTMLElement;
			if (el.getAttribute("role") === "tablist") {
				return makeRect({
					left: model.containerLeft,
					width: model.clientWidth,
				});
			}
			const tabId = el.getAttribute("data-tab-id");
			const index = tabId ? Number.parseInt(tabId.replace("t", ""), 10) - 1 : 0;
			const left =
				model.containerLeft + index * model.tabWidth - model.scrollLeft;
			return makeRect({ left, width: model.tabWidth });
		},
	});

	if (model.omitScrollTo) {
		stubDescriptor(HTMLElement.prototype, "scrollTo", {
			configurable: true,
			writable: true,
			value: undefined,
		});
	} else {
		stubDescriptor(HTMLElement.prototype, "scrollTo", {
			configurable: true,
			writable: true,
			value: vi.fn(function scrollTo(
				this: HTMLElement,
				options?: ScrollToOptions,
			) {
				if (model.throwOnScrollTo) {
					throw new Error("scrollTo unsupported");
				}
				if (this.getAttribute("role") === "tablist" && options) {
					scrollToCalls.push(options);
					if (
						model.updateScrollLeftOnScrollTo !== false &&
						typeof options.left === "number"
					) {
						model.scrollLeft = options.left;
					}
				}
			}),
		});
	}

	return { scrollToCalls };
}

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	callback: ResizeObserverCallback;
	observed: Element[] = [];
	disconnected = false;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		MockResizeObserver.instances.push(this);
	}

	observe(target: Element): void {
		this.observed.push(target);
	}

	unobserve(): void {}

	disconnect(): void {
		this.disconnected = true;
	}

	trigger(): void {
		this.callback([], this as unknown as ResizeObserver);
	}
}

function stubSyncRaf(): { cancelSpy: ReturnType<typeof vi.fn> } {
	const cancelSpy = vi.fn();
	stubDescriptor(globalThis, "requestAnimationFrame", {
		configurable: true,
		writable: true,
		value: vi.fn((cb: FrameRequestCallback) => {
			cb(0);
			return 1;
		}),
	});
	stubDescriptor(globalThis, "cancelAnimationFrame", {
		configurable: true,
		writable: true,
		value: cancelSpy,
	});
	return { cancelSpy };
}

describe("useScrollActiveTab", () => {
	it("scrolls off-screen active tab with instant behavior on initial mount", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 16,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);

		// t6 is at [500..600], visible right is 340 => target left = 260
		expect(scrollToCalls).toEqual([{ left: 260, behavior: "instant" }]);
		expect(model.scrollLeft).toBe(260);
	});

	it("scrolls smooth on active tab change when motion is allowed, and instant when reduced motion is active", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t1" />,
		);
		expect(scrollToCalls).toEqual([]);

		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		expect(scrollToCalls).toEqual([{ left: 260, behavior: "smooth" }]);

		stubReducedMotion(true);
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		expect(scrollToCalls).toEqual([
			{ left: 260, behavior: "smooth" },
			{ left: 0, behavior: "instant" },
		]);
	});

	it("falls back to direct scrollLeft assignment when scrollTo is missing or throws", () => {
		stubReducedMotion(false);
		const missingModel: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
			omitScrollTo: true,
		};
		installPrototypeLayoutMock(missingModel);

		render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		expect(missingModel.scrollLeft).toBe(260);

		cleanup();
		restoreDescriptors();

		stubReducedMotion(false);
		const throwingModel: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
			throwOnScrollTo: true,
		};
		installPrototypeLayoutMock(throwingModel);

		render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		expect(throwingModel.scrollLeft).toBe(260);
	});

	it("does not override manual scroll when parent re-renders with a fresh inline tabs array", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender } = render(
			<TabsHarness tabs={DEFAULT_TABS.map((t) => ({ ...t }))} active="t1" />,
		);
		expect(scrollToCalls).toEqual([]);

		// User manually swipes tablist so t1 is off-screen to the left
		model.scrollLeft = 220;

		// Parent re-renders with brand-new array reference, identical [id, label]
		rerender(
			<TabsHarness tabs={DEFAULT_TABS.map((t) => ({ ...t }))} active="t1" />,
		);
		expect(scrollToCalls).toEqual([]);
		expect(model.scrollLeft).toBe(220);
	});

	it("realigns with instant behavior when dynamic tab labels change", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t5" />,
		);
		// t5 at [400..500] => scrolled to 160
		expect(scrollToCalls).toEqual([{ left: 160, behavior: "instant" }]);

		// Labels widen dynamically (e.g. validation error counts), pushing t5 further right
		model.tabWidth = 120;
		model.scrollWidth = 720;
		const widenedTabs = DEFAULT_TABS.map((t) => ({
			...t,
			label: `${t.label} (2 lỗi)`,
		}));

		rerender(<TabsHarness tabs={widenedTabs} active="t5" />);
		// t5 now [480..600] - 160 = [320..440], safeRight = 340 => delta = 100 => nextLeft = 260
		expect(scrollToCalls).toEqual([
			{ left: 160, behavior: "instant" },
			{ left: 260, behavior: "instant" },
		]);
	});

	it("cancels an in-flight smooth scroll when switching mid-flight to a currently visible tab", () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 260,
			updateScrollLeftOnScrollTo: false,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t6" />,
		);
		expect(scrollToCalls).toEqual([]);

		// Switch to t1 => smooth scroll toward 0 starts
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		expect(scrollToCalls).toEqual([{ left: 0, behavior: "smooth" }]);

		// Mid-flight at scrollLeft = 180, switch to t4 ([300..400] - 180 = [120..220], currently visible)
		model.scrollLeft = 180;
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t4" />);

		// Must cancel old smooth animation at current scrollLeft (180) with instant
		expect(scrollToCalls).toEqual([
			{ left: 0, behavior: "smooth" },
			{ left: 180, behavior: "instant" },
		]);
	});

	it("clears prior smooth timeout on back-to-back smooth switches", () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 260,
			updateScrollLeftOnScrollTo: false,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t6" />,
		);

		// Smooth scroll #1 at t = 0
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		vi.advanceTimersByTime(400);

		// Smooth scroll #2 at t = 400 (target = 260) while scrollLeft drifted to 100
		model.scrollLeft = 100;
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);

		// Advance 250ms (past #1's 600ms mark, before #2's 600ms mark)
		vi.advanceTimersByTime(250);

		// Switch to currently visible t3 ([200..300] - 100 = [100..200]) => #2 must STILL be cancelled
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t3" />);
		expect(scrollToCalls[scrollToCalls.length - 1]).toEqual({
			left: 100,
			behavior: "instant",
		});
	});

	it("realigns once after document.fonts.ready unless user already interacted", async () => {
		stubReducedMotion(false);
		let resolveFonts!: () => void;
		const ready = new Promise<void>((res) => {
			resolveFonts = res;
		});
		stubDescriptor(document, "fonts", {
			configurable: true,
			value: { status: "loading", ready },
		});

		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 500,
			containerLeft: 0,
			tabWidth: 80,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		// Before font swap: t6 [400..480], clientWidth 340 => left 140
		expect(scrollToCalls).toEqual([{ left: 140, behavior: "instant" }]);

		// WebFont loads and widens tabs
		model.tabWidth = 100;
		model.scrollWidth = 600;
		await act(async () => {
			resolveFonts();
			await Promise.resolve();
		});

		// Realigned for widened t6 [500..600] => left 260
		expect(scrollToCalls).toEqual([
			{ left: 140, behavior: "instant" },
			{ left: 260, behavior: "instant" },
		]);
	});

	it("skips document.fonts.ready realignment when user already interacted with tablist", async () => {
		stubReducedMotion(false);
		let resolveFonts!: () => void;
		const ready = new Promise<void>((res) => {
			resolveFonts = res;
		});
		stubDescriptor(document, "fonts", {
			configurable: true,
			value: { status: "loading", ready },
		});

		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 500,
			containerLeft: 0,
			tabWidth: 80,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { getByRole } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t6" />,
		);
		expect(scrollToCalls).toHaveLength(1);

		// User interacts with tablist before font finishes loading
		fireEvent.pointerDown(getByRole("tablist"));
		model.tabWidth = 100;
		model.scrollWidth = 600;

		await act(async () => {
			resolveFonts();
			await Promise.resolve();
		});

		expect(scrollToCalls).toHaveLength(1);
	});

	it("realigns with instant behavior on ResizeObserver width change and ignores height-only resizes", () => {
		stubReducedMotion(false);
		MockResizeObserver.instances = [];
		stubDescriptor(globalThis, "ResizeObserver", {
			configurable: true,
			writable: true,
			value: MockResizeObserver,
		});
		stubSyncRaf();

		const model: LayoutModel = {
			clientWidth: 700,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { unmount } = render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		expect(scrollToCalls).toEqual([]);
		expect(MockResizeObserver.instances).toHaveLength(1);
		const observer = MockResizeObserver.instances[0];
		if (!observer) throw new Error("Expected ResizeObserver instance");

		// Height-only resize: clientWidth stays 700 => no-op
		observer.trigger();
		expect(scrollToCalls).toEqual([]);

		// Viewport shrinks from desktop (700) to mobile (340) => t6 becomes off-screen
		model.clientWidth = 340;
		observer.trigger();
		expect(scrollToCalls).toEqual([{ left: 260, behavior: "instant" }]);

		// Unmount disconnects observer
		unmount();
		expect(observer.disconnected).toBe(true);
	});

	it("handles hidden-to-visible ResizeObserver transition (0 -> 340) and cancels pending rAF on unmount", () => {
		stubReducedMotion(false);
		MockResizeObserver.instances = [];
		stubDescriptor(globalThis, "ResizeObserver", {
			configurable: true,
			writable: true,
			value: MockResizeObserver,
		});

		const queuedRafs: FrameRequestCallback[] = [];
		const cancelSpy = vi.fn();
		stubDescriptor(globalThis, "requestAnimationFrame", {
			configurable: true,
			writable: true,
			value: vi.fn((cb: FrameRequestCallback) => {
				queuedRafs.push(cb);
				return queuedRafs.length;
			}),
		});
		stubDescriptor(globalThis, "cancelAnimationFrame", {
			configurable: true,
			writable: true,
			value: cancelSpy,
		});

		const model: LayoutModel = {
			clientWidth: 0,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { unmount } = render(<TabsHarness tabs={DEFAULT_TABS} active="t6" />);
		expect(scrollToCalls).toEqual([]);
		const observer = MockResizeObserver.instances[0];
		if (!observer) throw new Error("Expected ResizeObserver instance");

		// Dialog becomes visible (0 -> 340)
		model.clientWidth = 340;
		observer.trigger();
		// Coalesced inside rAF: second trigger before frame does not schedule a duplicate rAF
		observer.trigger();
		expect(queuedRafs).toHaveLength(1);

		queuedRafs[0]?.(16);
		expect(scrollToCalls).toEqual([{ left: 260, behavior: "instant" }]);

		// Trigger another resize and unmount before rAF fires => cancelAnimationFrame called
		model.clientWidth = 300;
		observer.trigger();
		unmount();
		expect(cancelSpy).toHaveBeenCalled();
	});

	it("does not throw when ResizeObserver is unavailable and handles StrictMode cleanly", () => {
		stubReducedMotion(false);
		stubDescriptor(globalThis, "ResizeObserver", {
			configurable: true,
			writable: true,
			value: undefined,
		});

		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		render(
			<StrictMode>
				<TabsHarness tabs={DEFAULT_TABS} active="t6" />
			</StrictMode>,
		);

		expect(scrollToCalls).toEqual([{ left: 260, behavior: "instant" }]);
	});

	it("returns null from computeActiveTabScrollLeft when clientWidth is 0 even if rect width > 0", () => {
		const container = document.createElement("div");
		const tab = document.createElement("button");
		container.appendChild(tab);
		document.body.appendChild(container);
		mockElementMetrics(container, {
			scrollWidth: 600,
			clientWidth: 0,
			scrollLeft: 0,
			rect: { left: 0, width: 4 },
		});
		mockElementMetrics(tab, { rect: { left: 100, width: 80 } });
		expect(computeActiveTabScrollLeft(container, tab)).toBeNull();
	});

	it("preserves smooth-scroll cancellation across mouse pointerdown on a child tab button", () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 260,
			updateScrollLeftOnScrollTo: false,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender, getByText } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t6" />,
		);

		// Start smooth scroll toward 0
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		expect(scrollToCalls).toEqual([{ left: 0, behavior: "smooth" }]);

		// Mid-flight at scrollLeft = 180, user mouse-clicks visible tab t4
		model.scrollLeft = 180;
		fireEvent.pointerDown(getByText("Tab 4"), { pointerType: "mouse" });
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t4" />);

		expect(scrollToCalls).toEqual([
			{ left: 0, behavior: "smooth" },
			{ left: 180, behavior: "instant" },
		]);
	});

	it("ignores stale scrollend before target and clears smooth tracking once target is reached", () => {
		vi.useFakeTimers();
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 260,
			updateScrollLeftOnScrollTo: false,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		const { rerender, getByRole } = render(
			<TabsHarness tabs={DEFAULT_TABS} active="t6" />,
		);
		const tablist = getByRole("tablist");

		// Start smooth scroll toward 0 while scrollLeft is still at previous 260
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		expect(scrollToCalls).toEqual([{ left: 0, behavior: "smooth" }]);

		// Queued scrollend from previous scroll arrives at 260 (not target 0) -> must NOT clear tracking
		tablist.dispatchEvent(new Event("scrollend"));

		// Mid-flight at 180, switch to visible t4 -> still cancels old smooth animation
		model.scrollLeft = 180;
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t4" />);
		expect(scrollToCalls).toEqual([
			{ left: 0, behavior: "smooth" },
			{ left: 180, behavior: "instant" },
		]);

		// Start a second smooth scroll to 0, then settle at 0 and dispatch scrollend at target
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t1" />);
		model.scrollLeft = 0;
		tablist.dispatchEvent(new Event("scrollend"));

		// Switching to already-visible t2 after target scrollend must NOT emit redundant instant cancel
		const callsBefore = scrollToCalls.length;
		rerender(<TabsHarness tabs={DEFAULT_TABS} active="t2" />);
		expect(scrollToCalls).toHaveLength(callsBefore);
	});

	it("handles StrictMode remount with active ResizeObserver and missing requestAnimationFrame fallback", () => {
		stubReducedMotion(false);
		stubDescriptor(globalThis, "ResizeObserver", {
			configurable: true,
			writable: true,
			value: MockResizeObserver,
		});
		stubDescriptor(globalThis, "requestAnimationFrame", {
			configurable: true,
			writable: true,
			value: undefined,
		});

		const model: LayoutModel = {
			clientWidth: 700,
			scrollWidth: 600,
			containerLeft: 0,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToCalls } = installPrototypeLayoutMock(model);

		render(
			<StrictMode>
				<TabsHarness tabs={DEFAULT_TABS} active="t6" />
			</StrictMode>,
		);

		// StrictMode mounts, disconnects first observer, and keeps second active
		expect(MockResizeObserver.instances.length).toBeGreaterThanOrEqual(2);
		expect(MockResizeObserver.instances[0]?.disconnected).toBe(true);
		const activeObserver =
			MockResizeObserver.instances[MockResizeObserver.instances.length - 1];
		expect(activeObserver?.disconnected).toBe(false);

		model.clientWidth = 340;
		activeObserver?.trigger();
		expect(scrollToCalls).toEqual([{ left: 260, behavior: "instant" }]);
	});
});
