// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import ExcelJS from "exceljs";
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import {
	buildSampleXlsxBytes,
	SYLLABUS_SAMPLE_MIME,
} from "@/lib/syllabus-import";
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
let sampleUploadBytes: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
	const workbook = new ExcelJS.Workbook();
	const sheet = workbook.addWorksheet("Syllabus");
	sheet.addRow(["Module", "Mô tả module", "Mục tiêu", "Tài liệu", "Loại"]);
	sheet.addRow(["M1", "d1", "o1", "m1", ""]);
	const raw = await workbook.xlsx.writeBuffer();
	const buffer = new ArrayBuffer(raw.byteLength);
	sampleUploadBytes = new Uint8Array(buffer);
	sampleUploadBytes.set(new Uint8Array(raw));
});

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
	vi.restoreAllMocks();
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
				// node:buffer File — jsdom's File has no .arrayBuffer(), which the parser uses.
				files: [
					new NodeFile([sampleUploadBytes], "sample.xlsx", {
						type: SYLLABUS_SAMPLE_MIME,
					}),
				],
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

	it("downloads the v4 sample XLSX template from the detail toolbar", async () => {
		let capturedBlob: Blob | null = null;
		let createdAnchor: HTMLAnchorElement | null = null;
		vi.spyOn(URL, "createObjectURL").mockImplementation(
			(obj: Blob | MediaSource) => {
				capturedBlob = obj as Blob;
				return "blob:detail-sample";
			},
		);
		vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
		const origCreateElement = document.createElement.bind(document);
		vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
			const el = origCreateElement(tag);
			if (tag.toLowerCase() === "a") {
				createdAnchor = el as HTMLAnchorElement;
			}
			return el;
		}) as typeof document.createElement);
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => {});

		renderWithKernel(<SyllabusDetail />);
		await screen.findByRole("heading", { level: 1, name: "Template Writing" });

		fireEvent.click(screen.getByRole("button", { name: "Tải file mẫu" }));

		expect(clickSpy).toHaveBeenCalledTimes(1);
		expect(createdAnchor).not.toBeNull();
		if (!createdAnchor) throw new Error("expected createdAnchor");
		expect((createdAnchor as HTMLAnchorElement).download).toBe(
			"syllabus-template.xlsx",
		);
		expect(capturedBlob).toBeInstanceOf(Blob);
		if (!capturedBlob) throw new Error("expected capturedBlob");
		expect((capturedBlob as Blob).type).toBe(SYLLABUS_SAMPLE_MIME);
		const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as ArrayBuffer);
			reader.onerror = () => reject(reader.error);
			reader.readAsArrayBuffer(capturedBlob as Blob);
		});
		expect(new Uint8Array(buf)).toEqual(buildSampleXlsxBytes());
	});

	it("rejects uploading a .csv file with an explicit error and hides overwrite", async () => {
		const view = renderWithKernel(<SyllabusDetail />);
		await screen.findByRole("heading", { level: 1, name: "Template Writing" });

		const input = view.container.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		fireEvent.change(input, {
			target: {
				files: [new NodeFile(["M1;d1;o1;m1"], "x.csv", { type: "text/csv" })],
			},
		});

		expect(
			await screen.findByText("Chỉ nhận file Excel (.xlsx)."),
		).toBeTruthy();
		expect(
			screen.queryByRole("button", { name: "Ghi đè nội dung" }),
		).toBeNull();
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
					files: [
						new NodeFile([sampleUploadBytes], "sample.xlsx", {
							type: SYLLABUS_SAMPLE_MIME,
						}),
					],
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
		expect(held.writes[0].path).toBe(
			"/api/syllabus-templates/sy-t/replace-content",
		);

		const importButton = screen.getByRole("button", {
			name: "Nhập từ Excel",
		}) as HTMLButtonElement;
		const sampleButton = screen.getByRole("button", {
			name: "Tải file mẫu",
		}) as HTMLButtonElement;
		expect(importButton.disabled).toBe(true);
		expect(sampleButton.disabled).toBe(false);

		land();
		await waitFor(() => expect(importButton.disabled).toBe(false));
		expect(
			screen.queryByRole("button", { name: "Ghi đè nội dung" }),
		).toBeNull();
	});
});
