// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./modal";

afterEach(cleanup);

describe("Modal", () => {
	it("không render khi open={false}", () => {
		render(
			<Modal open={false} onClose={() => {}} title="Test Modal">
				<p>Nội dung</p>
			</Modal>,
		);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	it("render dialog và thân modal có layout [&>form]:flex [&>form]:flex-col [&>form]:gap-4", () => {
		render(
			<Modal open onClose={() => {}} title="Test Modal">
				<form data-testid="form-child">
					<input placeholder="Test input" />
				</form>
			</Modal>,
		);

		const dialog = screen.getByRole("dialog", { name: "Test Modal" });
		expect(dialog).not.toBeNull();
		const form = screen.getByTestId("form-child");
		const body = form.parentElement;
		expect(body).not.toBeNull();

		const classList = Array.from(body?.classList ?? []);
		expect(classList).toContain("flex");
		expect(classList).toContain("flex-col");
		expect(classList).toContain("gap-4");
		expect(classList).toContain("p-6");
		expect(classList).toContain("[&>form]:flex");
		expect(classList).toContain("[&>form]:flex-col");
		expect(classList).toContain("[&>form]:gap-4");
	});

	it("render footer khi được truyền", () => {
		render(
			<Modal
				open
				onClose={() => {}}
				title="Modal with footer"
				footer={<button type="button">Lưu</button>}
			>
				<div>Nội dung</div>
			</Modal>,
		);
		expect(screen.getByRole("button", { name: "Lưu" })).not.toBeNull();
	});

	it("khi hai Modal cùng mở, Escape chỉ đóng modal trên cùng", () => {
		const onCloseParent = vi.fn();
		const onCloseChild = vi.fn();
		const { rerender } = render(
			<>
				<Modal open onClose={onCloseParent} title="Modal cha">
					<p>Cha</p>
				</Modal>
				<Modal open onClose={onCloseChild} title="Modal con">
					<p>Con</p>
				</Modal>
			</>,
		);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onCloseChild).toHaveBeenCalledTimes(1);
		expect(onCloseParent).not.toHaveBeenCalled();

		// Khi modal con vẫn mở với close guard no-op (đang saving), Escape không đóng modal cha.
		const onCloseLocked = vi.fn();
		rerender(
			<>
				<Modal open onClose={onCloseParent} title="Modal cha">
					<p>Cha</p>
				</Modal>
				<Modal open onClose={onCloseLocked} title="Modal con">
					<p>Đang lưu</p>
				</Modal>
			</>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onCloseLocked).toHaveBeenCalledTimes(1);
		expect(onCloseParent).not.toHaveBeenCalled();
	});

	it("hỗ trợ size='xl', description và scrollableBody mà không làm gãy layout", () => {
		render(
			<Modal
				open
				onClose={() => {}}
				title="Giao bài tập"
				description="Chọn một đề sẵn sàng và đặt hạn nộp."
				size="xl"
				scrollableBody
				footer={<button type="button">Huỷ</button>}
			>
				<div data-testid="scroll-content">Nội dung dài</div>
			</Modal>,
		);

		const dialog = screen.getByRole("dialog", { name: "Giao bài tập" });
		expect(dialog.className).toContain("max-w-4xl");
		expect(dialog.className).toContain("overflow-hidden");
		expect(
			screen.getByText("Chọn một đề sẵn sàng và đặt hạn nộp."),
		).not.toBeNull();
		const body = screen.getByTestId("scroll-content").parentElement;
		expect(body?.className).toContain("overflow-y-auto");
		expect(body?.className).toContain("flex-1");
	});

	it("Escape không đóng Modal khi có popup con đang mở bên trong hoặc qua portal, nhưng đóng sau khi popup con đã đóng", () => {
		const onClose = vi.fn();
		const { rerender } = render(
			<Modal open onClose={onClose} title="Modal có DatePicker">
				<button type="button" aria-haspopup="dialog" aria-expanded="true">
					Chọn ngày
				</button>
			</Modal>,
		);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();

		// Đóng trigger bên trong nhưng còn portal dialog đang mở
		rerender(
			<>
				<Modal open onClose={onClose} title="Modal có DatePicker">
					<button type="button" aria-haspopup="dialog" aria-expanded="false">
						Chọn ngày
					</button>
				</Modal>
				<div data-base-ui-portal="">
					<div role="dialog" data-open="">
						Lịch tháng
					</div>
				</div>
			</>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();

		// Sau khi popup con đóng hoàn toàn -> Escape đóng Modal bình thường
		rerender(
			<Modal open onClose={onClose} title="Modal có DatePicker">
				<button type="button" aria-haspopup="dialog" aria-expanded="false">
					Chọn ngày
				</button>
			</Modal>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("click backdrop không đóng Modal khi bắt đầu kéo từ bên trong hoặc khi có popup portal đang mở lúc pointerdown", () => {
		const onClose = vi.fn();
		const { rerender } = render(
			<>
				<Modal open onClose={onClose} title="Modal có DatePicker">
					<input aria-label="Ngày" />
				</Modal>
				<div data-base-ui-portal="">
					<div role="dialog" data-open="">
						Lịch tháng
					</div>
				</div>
			</>,
		);

		const modalDialog = screen.getByRole("dialog", {
			name: "Modal có DatePicker",
		});
		const overlay = modalDialog.parentElement as HTMLElement;

		// 1. Kéo chuột từ bên trong dialog rồi thả trên overlay -> không đóng
		fireEvent.pointerDown(screen.getByLabelText("Ngày"));
		fireEvent.click(overlay);
		expect(onClose).not.toHaveBeenCalled();

		// 2. Click backdrop khi portal đang mở tại pointerdown (portal đóng trước click) -> không đóng Modal
		fireEvent.pointerDown(overlay);
		rerender(
			<Modal open onClose={onClose} title="Modal có DatePicker">
				<input aria-label="Ngày" />
			</Modal>,
		);
		fireEvent.click(overlay);
		expect(onClose).not.toHaveBeenCalled();

		// 3. Click backdrop khi không còn portal -> đóng Modal
		fireEvent.pointerDown(overlay);
		fireEvent.click(overlay);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
