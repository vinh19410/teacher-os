// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { SyllabusRoute } from "./index";

beforeEach(() => {
	resetRouterState();
	startKernelServer(
		snapshotFixture({
			syllabi: [
				syllabusRow({ id: "sy-t", name: "Template Writing" }),
				syllabusRow({ id: "sy-unused", name: "Template Speaking" }),
				// Class copy imported from sy-t: lives on cl-1, never in the gallery.
				syllabusRow({
					id: "sy-c",
					name: "Bản sao của lớp",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
				}),
			],
			classes: [
				classRow({ id: "cl-1", syllabusId: "sy-c" }),
				// Pointer equality to a template is NOT "in use" (no imported copy).
				classRow({ id: "cl-2", syllabusId: "sy-unused" }),
			],
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

function card(name: string): HTMLElement {
	return screen
		.getByRole("heading", { level: 3, name })
		.closest('[role="button"]') as HTMLElement;
}

describe("syllabus gallery", () => {
	it("lists shared templates only, never a class's imported copy", async () => {
		renderWithKernel(<SyllabusRoute />);
		expect(await screen.findByText("Template Writing")).toBeTruthy();
		expect(screen.getByText("Template Speaking")).toBeTruthy();
		expect(screen.queryByText("Bản sao của lớp")).toBeNull();
	});

	it("counts classes using a template by imported copies (provenance)", async () => {
		renderWithKernel(<SyllabusRoute />);
		await screen.findByText("Template Writing");
		expect(
			within(card("Template Writing")).getByText("Đang dùng 1 lớp"),
		).toBeTruthy();
		expect(
			within(card("Template Speaking")).getByText("Đang dùng 0 lớp"),
		).toBeTruthy();
	});
});

describe("create syllabus from the gallery", () => {
	function fillName(dialog: HTMLElement, name: string) {
		fireEvent.change(within(dialog).getByLabelText(/Tên syllabus/), {
			target: { value: name },
		});
	}

	it("opens the new syllabus once the created one is in the refreshed snapshot", async () => {
		vi.unstubAllGlobals();
		const server = startKernelServer(snapshotFixture(), (req, srv) => {
			srv.snapshot.syllabi.push(syllabusRow({ id: "sy-new", name: "Mới" }));
			return req.path === "/api/syllabus-templates"
				? { status: 201, body: { id: "sy-new" } }
				: undefined;
		});
		renderWithKernel(<SyllabusRoute />);
		fireEvent.click(
			await screen.findByRole("button", { name: "+ Tạo syllabus" }),
		);
		const dialog = screen.getByRole("dialog");
		fillName(dialog, "Mới");
		fireEvent.click(within(dialog).getByRole("button", { name: "Writing" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Tạo" }));

		await waitFor(() =>
			expect(routerState.navigate).toHaveBeenCalledWith({
				to: "/syllabus/$syllabusId",
				params: { syllabusId: "sy-new" },
			}),
		);
		expect(server.writes).toHaveLength(1);
	});

	it("does not navigate into a syllabus the snapshot could not confirm", async () => {
		vi.unstubAllGlobals();
		startKernelServer(snapshotFixture(), (_req, srv) => {
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return { status: 201, body: { id: "sy-new" } };
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<SyllabusRoute />);
		fireEvent.click(
			await screen.findByRole("button", { name: "+ Tạo syllabus" }),
		);
		const dialog = screen.getByRole("dialog");
		fillName(dialog, "Mới");
		fireEvent.click(within(dialog).getByRole("button", { name: "Writing" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Tạo" }));

		expect(
			await within(dialog).findByRole("button", { name: "Tải lại" }),
		).toBeTruthy();
		expect(routerState.navigate).not.toHaveBeenCalled();
	});

	it("keeps what was typed when the dialog is closed and reopened", async () => {
		renderWithKernel(<SyllabusRoute />);
		fireEvent.click(
			await screen.findByRole("button", { name: "+ Tạo syllabus" }),
		);
		fillName(screen.getByRole("dialog"), "Bản nháp dở");
		fireEvent.click(
			within(screen.getByRole("dialog")).getByRole("button", { name: "Hủy" }),
		);
		expect(screen.queryByRole("dialog")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "+ Tạo syllabus" }));
		expect(
			(
				within(screen.getByRole("dialog")).getByLabelText(
					/Tên syllabus/,
				) as HTMLInputElement
			).value,
		).toBe("Bản nháp dở");
	});
});

describe("syllabus gallery header and filters", () => {
	it("is titled Giáo trình and filters with Vietnamese skill chips", async () => {
		renderWithKernel(<SyllabusRoute />);
		expect(
			await screen.findByRole("heading", { level: 1, name: "Giáo trình" }),
		).toBeTruthy();
		expect(
			within(screen.getByRole("group"))
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Tất cả", "Viết", "Nói", "Đọc", "Nghe"]);
	});
});
