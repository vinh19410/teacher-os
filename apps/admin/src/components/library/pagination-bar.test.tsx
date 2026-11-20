// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaginationBar, type PaginationBarProps } from "./pagination-bar";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function renderStatic(overrides: Partial<PaginationBarProps> = {}) {
	return renderToStaticMarkup(
		<PaginationBar
			page={1}
			pageSize={20}
			total={45}
			totalPages={3}
			onPageChange={vi.fn()}
			onPageSizeChange={vi.fn()}
			{...overrides}
		/>,
	);
}

describe("PaginationBar (render tĩnh)", () => {
	it("total = 0 → trả rỗng (null)", () => {
		expect(renderStatic({ total: 0, totalPages: 1 })).toBe("");
	});

	it("1 trang vẫn hiển thị thanh phân trang, khóa Trang trước/Trang sau, không thêm aria-live", () => {
		const html = renderStatic({
			page: 1,
			pageSize: 20,
			total: 8,
			totalPages: 1,
		});
		expect(html).toContain("Hiển thị 1–8 / 8 bộ đề");
		expect(html).toContain('aria-label="Phân trang bộ đề"');
		expect(html).toContain('aria-label="Số bộ đề mỗi trang"');
		expect(html).toContain("Trang 1 / 1");
		expect(html).not.toContain("aria-live");
	});

	it("nhiều trang: đánh dấu aria-current=page, hiển thị chỉ báo mobile và ellipsis", () => {
		const html = renderStatic({
			page: 5,
			pageSize: 10,
			total: 100,
			totalPages: 10,
			isFetching: true,
		});
		expect(html).toContain("Hiển thị 41–50 / 100 bộ đề");
		expect(html).toContain("đang cập nhật…");
		expect(html).toContain('aria-label="Trang 5" aria-current="page"');
		expect(html).toContain("Trang 5 / 10");
		expect(html).toContain(">…</span>");
	});
});

describe("PaginationBar (tương tác DOM)", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	function mount(props: PaginationBarProps) {
		act(() => {
			root.render(<PaginationBar {...props} />);
		});
	}

	it("1 trang: nút Trang trước và Trang sau bị khóa, vẫn đổi được số dòng mỗi trang", () => {
		const onPageChange = vi.fn();
		const onPageSizeChange = vi.fn();
		mount({
			page: 1,
			pageSize: 20,
			total: 8,
			totalPages: 1,
			onPageChange,
			onPageSizeChange,
		});

		const buttons = Array.from(container.querySelectorAll("button"));
		const prev = buttons.find((b) => b.textContent?.includes("Trang trước"));
		const next = buttons.find((b) => b.textContent?.includes("Trang sau"));
		expect(prev?.disabled).toBe(true);
		expect(next?.disabled).toBe(true);

		const select = container.querySelector("select");
		expect(select).not.toBeNull();
		const valueSetter = Object.getOwnPropertyDescriptor(
			HTMLSelectElement.prototype,
			"value",
		)?.set;
		act(() => {
			valueSetter?.call(select, "50");
			select?.dispatchEvent(new Event("change", { bubbles: true }));
		});
		expect(onPageSizeChange).toHaveBeenCalledWith(50);
		expect(onPageChange).not.toHaveBeenCalled();
	});

	it("nhiều trang: bấm Trang trước, Trang sau, số trang gọi đúng onPageChange và không gọi lại khi bấm trang hiện tại", () => {
		const onPageChange = vi.fn();
		mount({
			page: 2,
			pageSize: 10,
			total: 35,
			totalPages: 4,
			onPageChange,
			onPageSizeChange: vi.fn(),
		});

		const buttons = Array.from(container.querySelectorAll("button"));
		const prev = buttons.find((b) => b.textContent?.includes("Trang trước"));
		const next = buttons.find((b) => b.textContent?.includes("Trang sau"));
		const page2 = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Trang 2"]',
		);
		const page4 = container.querySelector<HTMLButtonElement>(
			'button[aria-label="Trang 4"]',
		);

		expect(prev?.disabled).toBe(false);
		expect(next?.disabled).toBe(false);
		expect(page2?.getAttribute("aria-current")).toBe("page");
		expect(page4?.getAttribute("aria-current")).toBeNull();

		act(() => {
			page2?.click();
		});
		expect(onPageChange).not.toHaveBeenCalled();

		act(() => {
			prev?.click();
		});
		expect(onPageChange).toHaveBeenLastCalledWith(1);

		act(() => {
			next?.click();
		});
		expect(onPageChange).toHaveBeenLastCalledWith(3);

		act(() => {
			page4?.click();
		});
		expect(onPageChange).toHaveBeenLastCalledWith(4);
	});
});
