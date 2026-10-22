// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./card";

afterEach(cleanup);

/** Class gốc của Card (không tính className do call site truyền). */
const BASE = [
	"rounded-xl",
	"border",
	"bg-card",
	"p-6",
	"text-card-foreground",
	"shadow-sm",
];

function cardOf(container: HTMLElement): HTMLElement {
	return container.firstElementChild as HTMLElement;
}

describe("Card", () => {
	it("tự lo padding 24px (p-6) và là block flow — không có gap/flex-col ở gốc", () => {
		const { container } = render(<Card>Nội dung</Card>);
		const classList = cardOf(container).classList;
		// Khoá từng class trên DOM node (classList, không substring) — bắt cả
		// regression kiểu thay p-6 bằng px-6 py-6 / px-2 (mất padding 24px đều).
		expect(Array.from(classList)).toEqual(expect.arrayContaining(BASE));
		expect(classList.contains("flex")).toBe(false);
		expect(classList.contains("flex-col")).toBe(false);
		expect(classList.contains("gap-6")).toBe(false);
	});

	it("className p-0 override thắng nhờ twMerge (card viền tràn viền cho media)", () => {
		const { container } = render(<Card className="p-0">Media</Card>);
		const classList = cardOf(container).classList;
		expect(classList.contains("p-0")).toBe(true);
		expect(classList.contains("p-6")).toBe(false);
	});

	it("py-4 override chỉ đè padding dọc — padding ngang p-6 vẫn còn", () => {
		const { container } = render(<Card className="py-4">Danh sách gọn</Card>);
		const classList = cardOf(container).classList;
		expect(classList.contains("p-6")).toBe(true);
		expect(classList.contains("py-4")).toBe(true);
	});

	it("variant là no-op: white render cùng class với default", () => {
		const { container: def } = render(<Card>a</Card>);
		const { container: white } = render(<Card variant="white">a</Card>);
		expect(cardOf(white).getAttribute("class")).toBe(
			cardOf(def).getAttribute("class"),
		);
	});

	it("className ngoài padding không bị cn nuốt (vd mb-5)", () => {
		const { container } = render(<Card className="mb-5">a</Card>);
		const classList = cardOf(container).classList;
		expect(classList.contains("mb-5")).toBe(true);
		expect(classList.contains("p-6")).toBe(true);
	});

	it("flex flex-col gap-4 do call site truyền vẫn được giữ (xếp cột khi cần)", () => {
		const { container } = render(
			<Card className="flex flex-col gap-4">
				a<div>b</div>
			</Card>,
		);
		const classList = cardOf(container).classList;
		for (const cls of ["flex", "flex-col", "gap-4", "p-6"]) {
			expect(classList.contains(cls)).toBe(true);
		}
	});
});
