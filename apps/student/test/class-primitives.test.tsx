// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RingStat } from "@/components/class/ring-stat";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";

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

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		MockResizeObserver.instances.push(this);
	}

	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
	trigger(): void {
		this.callback([], this as unknown as ResizeObserver);
	}
}

afterEach(() => {
	cleanup();
	MockResizeObserver.instances = [];
	restoreDescriptors();
	vi.restoreAllMocks();
});

describe("Tabs (student v2 primitive)", () => {
	const items = [
		{ id: "journey", label: "Hành trình học" },
		{ id: "assignments", label: "Bài tập" },
		{ id: "syllabus", label: "Giáo trình" },
		{ id: "materials", label: "Tài liệu chung" },
	] as const;

	function installStudentTabsLayoutMock(model: {
		clientWidth: number;
		scrollWidth: number;
		tabWidth: number;
		scrollLeft: number;
	}) {
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
				const index = items.findIndex((tab) => tab.label === el.textContent);
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

	it("renders tablist, aria-selected, testIdPrefix and invokes onChange", () => {
		const onChange = vi.fn();
		render(
			<Tabs
				tabs={items}
				active="journey"
				onChange={onChange}
				ariaLabel="Mục của lớp học"
				testIdPrefix="class-tab"
			/>,
		);

		const tablist = screen.getByRole("tablist", { name: "Mục của lớp học" });
		expect(tablist.className).toContain("bg-muted");
		expect(tablist.className).toContain("h-9");

		const journeyTab = screen.getByRole("tab", { name: "Hành trình học" });
		const assignmentsTab = screen.getByRole("tab", { name: "Bài tập" });

		expect(journeyTab.getAttribute("aria-selected")).toBe("true");
		expect(journeyTab.getAttribute("data-testid")).toBe("class-tab-journey");
		expect(journeyTab.className).toContain("bg-background");
		expect(journeyTab.className).toContain("shadow-sm");

		expect(assignmentsTab.getAttribute("aria-selected")).toBe("false");
		expect(assignmentsTab.getAttribute("data-testid")).toBe(
			"class-tab-assignments",
		);

		fireEvent.click(assignmentsTab);
		expect(onChange).toHaveBeenCalledWith("assignments");
	});

	it("auto-scrolls an off-screen active tab on mount without calling scrollIntoView", () => {
		stubReducedMotion(false);
		const model = {
			clientWidth: 340,
			scrollWidth: 480,
			tabWidth: 120,
			scrollLeft: 0,
		};
		const { scrollToSpy, scrollIntoViewSpy } =
			installStudentTabsLayoutMock(model);

		render(
			<Tabs
				tabs={items}
				active="materials"
				onChange={() => {}}
				ariaLabel="Mục của lớp học"
				testIdPrefix="class-tab"
			/>,
		);

		// materials is index 3 => [360..480], clientWidth 340 => left = 140
		expect(scrollToSpy).toHaveBeenCalledWith({
			left: 140,
			behavior: "instant",
		});
		expect(scrollIntoViewSpy).not.toHaveBeenCalled();
	});

	it("scrolls horizontally on active switch respecting prefers-reduced-motion", () => {
		stubReducedMotion(false);
		const model = {
			clientWidth: 340,
			scrollWidth: 480,
			tabWidth: 120,
			scrollLeft: 0,
		};
		const { scrollToSpy } = installStudentTabsLayoutMock(model);

		const { rerender } = render(
			<Tabs tabs={items} active="journey" onChange={() => {}} />,
		);
		expect(scrollToSpy).not.toHaveBeenCalled();

		rerender(<Tabs tabs={items} active="materials" onChange={() => {}} />);
		expect(scrollToSpy).toHaveBeenLastCalledWith({
			left: 140,
			behavior: "smooth",
		});

		stubReducedMotion(true);
		rerender(<Tabs tabs={items} active="journey" onChange={() => {}} />);
		expect(scrollToSpy).toHaveBeenLastCalledWith({
			left: 0,
			behavior: "instant",
		});
	});

	it("realigns active tab with instant behavior when tablist resizes narrower", () => {
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

		const model = {
			clientWidth: 640,
			scrollWidth: 480,
			tabWidth: 120,
			scrollLeft: 0,
		};
		const { scrollToSpy } = installStudentTabsLayoutMock(model);

		render(<Tabs tabs={items} active="materials" onChange={() => {}} />);
		expect(scrollToSpy).not.toHaveBeenCalled();

		const observer = MockResizeObserver.instances[0];
		expect(observer).toBeDefined();

		model.clientWidth = 340;
		observer?.trigger();
		expect(scrollToSpy).toHaveBeenCalledWith({
			left: 140,
			behavior: "instant",
		});
	});
});

describe("Badge (student v2 primitive)", () => {
	it("renders all 4 design v2 variants and optional dot indicator", () => {
		const html = renderToStaticMarkup(
			<div>
				<Badge variant="default">Mặc định</Badge>
				<Badge variant="secondary">Phụ</Badge>
				<Badge variant="outline" dot>
					Viền
				</Badge>
				<Badge variant="destructive">Quá hạn</Badge>
			</div>,
		);
		expect(html).toContain("bg-primary text-primary-foreground");
		expect(html).toContain("bg-secondary text-secondary-foreground");
		expect(html).toContain("text-foreground");
		expect(html).toContain("bg-destructive text-white");
		expect(html).toContain("size-1.5 rounded-full bg-current");
	});
});

describe("AvatarInitials (student v2 primitive)", () => {
	it("renders circular initials badge with aria-hidden", () => {
		const html = renderToStaticMarkup(<AvatarInitials initials="BN" />);
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("rounded-full");
		expect(html).toContain("bg-muted");
		expect(html).toContain("size-8");
		expect(html).toContain(">BN<");
	});
});

describe("RingStat (design v2 tokens)", () => {
	it("uses stroke-muted and stroke-primary tokens and guards max=0", () => {
		const html = renderToStaticMarkup(
			<RingStat
				icon={BookOpen}
				value={3}
				max={0}
				display="0%"
				label="Chuyên cần"
				sub="0/0 buổi đã học"
			/>,
		);
		expect(html).toContain("stroke-muted");
		expect(html).toContain("stroke-primary");
		expect(html).not.toContain("stroke-surface");
		expect(html).not.toContain("stroke-hot");
		expect(html).not.toContain("rounded-lg rounded-xl");
		expect(html).not.toContain("NaN");
	});
});
