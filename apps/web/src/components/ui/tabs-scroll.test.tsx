// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "./tabs";

const TEACHER_CLASS_TABS = [
	{ id: "sessions-practice", label: "Buổi học & luyện tập" },
	{ id: "roster", label: "Học viên" },
	{ id: "curriculum", label: "Giáo trình" },
	{ id: "materials", label: "Tài liệu chung" },
	{ id: "vocab", label: "Từ vựng" },
	{ id: "notes", label: "Ghi chú" },
];

function makeRect(left: number, width: number): DOMRect {
	return {
		x: left,
		y: 0,
		left,
		top: 0,
		width,
		height: 36,
		right: left + width,
		bottom: 36,
		toJSON() {
			return {};
		},
	} as DOMRect;
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
	const exists = savedDescriptors.some(
		(entry) => entry.target === target && entry.prop === prop,
	);
	if (!exists) {
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

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	callback: ResizeObserverCallback;
	disconnected = false;

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		MockResizeObserver.instances.push(this);
	}

	observe(): void {}
	unobserve(): void {}
	disconnect(): void {
		this.disconnected = true;
	}
	trigger(): void {
		this.callback([], this as unknown as ResizeObserver);
	}
}

interface LayoutModel {
	clientWidth: number;
	scrollWidth: number;
	tabWidth: number;
	scrollLeft: number;
}

function installTabsLayoutMock(model: LayoutModel) {
	const scrollToSpy = vi.fn(function scrollTo(
		this: HTMLElement,
		options?: ScrollToOptions,
	) {
		if (this.getAttribute("role") === "tablist" && options) {
			if (typeof options.left === "number") {
				model.scrollLeft = options.left;
			}
		}
	});
	const scrollIntoViewSpy = vi.fn();

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
				return makeRect(0, model.clientWidth);
			}
			const index = TEACHER_CLASS_TABS.findIndex(
				(tab) => tab.label === el.textContent,
			);
			const safeIndex = index >= 0 ? index : 0;
			return makeRect(
				safeIndex * model.tabWidth - model.scrollLeft,
				model.tabWidth,
			);
		},
	});
	stubDescriptor(HTMLElement.prototype, "scrollTo", {
		configurable: true,
		writable: true,
		value: scrollToSpy,
	});
	stubDescriptor(HTMLElement.prototype, "scrollIntoView", {
		configurable: true,
		writable: true,
		value: scrollIntoViewSpy,
	});

	return { scrollToSpy, scrollIntoViewSpy };
}

afterEach(() => {
	cleanup();
	MockResizeObserver.instances = [];
	restoreDescriptors();
	vi.restoreAllMocks();
});

describe("Tabs horizontal auto-scroll (web)", () => {
	it("scrolls off-screen active tab horizontally on mount without calling scrollIntoView", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToSpy, scrollIntoViewSpy } = installTabsLayoutMock(model);

		render(
			<Tabs tabs={TEACHER_CLASS_TABS} active="notes" onChange={() => {}} />,
		);

		expect(scrollToSpy).toHaveBeenCalledWith({
			left: 260,
			behavior: "instant",
		});
		expect(scrollIntoViewSpy).not.toHaveBeenCalled();
	});

	it("scrolls smooth on active change and instant under prefers-reduced-motion", () => {
		stubReducedMotion(false);
		const model: LayoutModel = {
			clientWidth: 340,
			scrollWidth: 600,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToSpy } = installTabsLayoutMock(model);

		const { rerender } = render(
			<Tabs
				tabs={TEACHER_CLASS_TABS}
				active="sessions-practice"
				onChange={() => {}}
			/>,
		);
		expect(scrollToSpy).not.toHaveBeenCalled();

		rerender(
			<Tabs tabs={TEACHER_CLASS_TABS} active="notes" onChange={() => {}} />,
		);
		expect(scrollToSpy).toHaveBeenLastCalledWith({
			left: 260,
			behavior: "smooth",
		});

		stubReducedMotion(true);
		rerender(
			<Tabs
				tabs={TEACHER_CLASS_TABS}
				active="sessions-practice"
				onChange={() => {}}
			/>,
		);
		expect(scrollToSpy).toHaveBeenLastCalledWith({
			left: 0,
			behavior: "instant",
		});
	});

	it("realigns active tab with instant behavior when ResizeObserver shrinks tablist width", () => {
		stubReducedMotion(false);
		MockResizeObserver.instances = [];
		stubDescriptor(globalThis, "ResizeObserver", {
			configurable: true,
			writable: true,
			value: MockResizeObserver,
		});
		stubDescriptor(globalThis, "requestAnimationFrame", {
			configurable: true,
			writable: true,
			value: vi.fn((cb: FrameRequestCallback) => {
				cb(0);
				return 1;
			}),
		});

		const model: LayoutModel = {
			clientWidth: 700,
			scrollWidth: 600,
			tabWidth: 100,
			scrollLeft: 0,
		};
		const { scrollToSpy } = installTabsLayoutMock(model);

		render(
			<Tabs tabs={TEACHER_CLASS_TABS} active="notes" onChange={() => {}} />,
		);
		expect(scrollToSpy).not.toHaveBeenCalled();

		const observer = MockResizeObserver.instances[0];
		expect(observer).toBeDefined();

		model.clientWidth = 340;
		observer?.trigger();
		expect(scrollToSpy).toHaveBeenCalledWith({
			left: 260,
			behavior: "instant",
		});
	});

	it("keeps <button> tabs as direct children of role=tablist", () => {
		render(
			<Tabs tabs={TEACHER_CLASS_TABS} active="notes" onChange={() => {}} />,
		);
		const tablist = screen.getByRole("tablist");
		expect(tablist.children.length).toBe(TEACHER_CLASS_TABS.length);
		for (const child of Array.from(tablist.children)) {
			expect(child.tagName).toBe("BUTTON");
		}
	});
});
