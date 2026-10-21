// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
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
	type KernelServer,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./$syllabusId";

const SyllabusDetail = (
	Route as unknown as { component: () => React.ReactNode }
).component;

const lesson = (id: string) => ({
	id,
	title: `Buổi ${id}`,
	objectives: "",
	materials: "",
	kind: "lesson" as const,
	status: "upcoming" as const,
});

let server: KernelServer;

beforeEach(() => {
	resetRouterState();
	routerState.params = { syllabusId: "sy-t" };
	server = startKernelServer(
		snapshotFixture({
			syllabi: [
				syllabusRow({
					id: "sy-t",
					name: "Template Writing",
					modules: [
						{
							id: "m-1",
							title: "Module 1",
							description: "",
							lessons: [lesson("l-1")],
						},
					],
				}),
				syllabusRow({
					id: "sy-c",
					name: "Bản sao",
					classId: "cl-1",
					sourceTemplateId: "sy-t",
				}),
			],
			classes: [
				classRow({ id: "cl-1", name: "Lớp dùng bản sao", syllabusId: "sy-c" }),
				classRow({ id: "cl-2", name: "Lớp trỏ thẳng", syllabusId: "sy-t" }),
			],
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("syllabus template detail", () => {
	it("lists the classes holding an imported copy of this template", async () => {
		renderWithKernel(<SyllabusDetail />);
		expect(
			await screen.findByRole("heading", {
				level: 1,
				name: "Template Writing",
			}),
		).toBeTruthy();
		expect(screen.getByText(/Đang dùng 1 lớp/)).toBeTruthy();
		expect(screen.getByText("Lớp dùng bản sao")).toBeTruthy();
		expect(screen.queryByText("Lớp trỏ thẳng")).toBeNull();
	});

	it("re-reads the template before the overwrite confirm so it counts what is really deleted", async () => {
		const view = renderWithKernel(<SyllabusDetail />);
		await screen.findByRole("heading", { level: 1, name: "Template Writing" });

		// Another tab adds a module after this page loaded its snapshot.
		server.snapshot.syllabi[0].modules.push({
			id: "m-2",
			title: "Module 2",
			description: "",
			lessons: [lesson("l-2"), lesson("l-3")],
		});

		const input = view.container.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		fireEvent.change(input, {
			target: {
				// node:buffer File — jsdom's File has no .text(), which the parser uses.
				files: [new NodeFile(["M1;d1;o1;m1"], "x.csv", { type: "text/csv" })],
			},
		});
		fireEvent.click(
			await screen.findByRole("button", { name: "Ghi đè nội dung" }),
		);

		const dialog = await screen.findByRole("dialog");
		await waitFor(() =>
			expect(dialog.textContent).toMatch(/2 module · 3 buổi học — sẽ bị XÓA/),
		);
		expect(dialog.textContent).toMatch(/thay bằng 1 module · 1 buổi học/);
		expect(within(dialog).getByRole("button", { name: "Ghi đè" })).toBeTruthy();
	});
});

describe("syllabus template → lesson kind", () => {
	it("lets the template author pick a session kind when adding a lesson", async () => {
		renderWithKernel(<SyllabusDetail />);
		fireEvent.click(
			await screen.findByRole("button", { name: "+ Thêm buổi học" }),
		);
		const dialog = screen.getByRole("dialog");
		expect(within(dialog).getByLabelText("Loại buổi học")).toBeTruthy();
	});
});

describe("syllabus template → overwrite in flight", () => {
	it("locks importing again until the overwrite lands, then clears the preview", async () => {
		vi.unstubAllGlobals();
		let land: () => void = () => {};
		const held = startKernelServer(
			snapshotFixture({
				syllabi: [syllabusRow({ id: "sy-t", name: "Template Writing" })],
			}),
			() =>
				new Promise((resolve) => {
					land = () => resolve(undefined);
				}),
		);
		const view = renderWithKernel(<SyllabusDetail />);
		await screen.findByRole("heading", { level: 1, name: "Template Writing" });
		fireEvent.change(
			view.container.querySelector('input[type="file"]') as HTMLInputElement,
			{
				target: {
					files: [new NodeFile(["M1;d1;o1;m1"], "x.csv", { type: "text/csv" })],
				},
			},
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Ghi đè nội dung" }),
		);
		fireEvent.click(
			within(await screen.findByRole("dialog")).getByRole("button", {
				name: "Ghi đè",
			}),
		);
		await waitFor(() => expect(held.writes).toHaveLength(1));
		expect(held.writes[0].path).toBe("/api/syllabi/sy-t/replace-content");

		const importButton = screen.getByRole("button", {
			name: "Nhập từ Excel/CSV",
		}) as HTMLButtonElement;
		expect(importButton.disabled).toBe(true);

		land();
		await waitFor(() => expect(importButton.disabled).toBe(false));
		expect(
			screen.queryByRole("button", { name: "Ghi đè nội dung" }),
		).toBeNull();
	});
});
