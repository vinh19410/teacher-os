// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RingStat } from "@/components/class/ring-stat";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";

afterEach(() => {
	cleanup();
});

describe("Tabs (student v2 primitive)", () => {
	const items = [
		{ id: "journey", label: "Hành trình học" },
		{ id: "assignments", label: "Bài tập" },
		{ id: "syllabus", label: "Giáo trình" },
	] as const;

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
