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
});
