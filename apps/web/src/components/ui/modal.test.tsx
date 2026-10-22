// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
});
