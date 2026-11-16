// @vitest-environment jsdom

import { File as NodeFile } from "node:buffer";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildSampleXlsxBytes,
	SYLLABUS_SAMPLE_MIME,
} from "@/lib/syllabus-import";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { startMaterialsBankServer } from "@/test/materials-harness";
import { AddLessonModal } from "./add-lesson-modal";
import { AddModuleModal } from "./add-module-modal";
import { AddSyllabusModal } from "./add-syllabus-modal";
import { EditLessonModal } from "./edit-lesson-modal";
import { EditModuleModal } from "./edit-module-modal";

const syllabus = () =>
	snapshotFixture({
		syllabi: [
			syllabusRow({
				id: "sy-1",
				name: "IELTS Writing 7.0",
				modules: [
					{
						id: "m-1",
						title: "Module 1",
						description: "Nền tảng",
						lessons: [
							{
								id: "l-1",
								title: "Line chart",
								objectives: "Mô tả xu hướng",
								materials: "Cam 15",
								kind: "midterm",
								status: "current",
							},
						],
					},
				],
			}),
		],
	});

function type(dialog: HTMLElement, label: RegExp | string, value: string) {
	fireEvent.change(within(dialog).getByLabelText(label), {
		target: { value },
	});
}

/**
 * Bài học có kèm tài liệu ngân hàng (#655). Tham chiếu biến (không literal
 * ngay tại chỗ) nên field thừa `bankMaterials` không dính excess-property
 * check của KernelSyllabusLessonRow — server sẽ trả field này khi bật.
 */
const lessonWithBank = {
	id: "l-1",
	title: "Line chart",
	objectives: "Mô tả xu hướng",
	materials: "Cam 15",
	kind: "midterm",
	status: "current",
	bankMaterials: [
		{
			id: "mat-1",
			title: "Reading pack",
			description: "Bài đọc kèm bài học",
			kind: "file" as const,
			url: null,
			mimeType: "application/pdf",
			sizeBytes: 1024,
			originalName: "reading.pdf",
			position: 0,
		},
	],
};

const syllabusWithBank = () =>
	snapshotFixture({
		syllabi: [
			syllabusRow({
				id: "sy-1",
				name: "IELTS Writing 7.0",
				modules: [
					{
						id: "m-1",
						title: "Module 1",
						description: "Nền tảng",
						lessons: [lessonWithBank],
					},
				],
			}),
		],
	});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("AddSyllabusModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => <AddSyllabusModal open onClose={onClose} />,
		fill: (dialog) => {
			type(dialog, /Tên syllabus/, "IELTS Speaking 6.5");
			fireEvent.click(within(dialog).getByRole("button", { name: "Speaking" }));
		},
		submit: "Tạo",
		expectedWrite: {
			path: "/api/syllabus-templates",
			body: { name: "IELTS Speaking 6.5", skills: ["Speaking"] },
		},
	});

	it('renders the Excel-only import label and restricts file input to ".xlsx"', async () => {
		startKernelServer(syllabus());
		renderWithKernel(<AddSyllabusModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");

		expect(
			within(dialog).getByText("Nhập nhanh từ Excel (tùy chọn)"),
		).toBeTruthy();
		const input = dialog.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		expect(input).not.toBeNull();
		expect(input.accept).toBe(".xlsx");
	});

	it('downloads "syllabus-template.xlsx" matching buildSampleXlsxBytes()', async () => {
		startKernelServer(syllabus());
		renderWithKernel(<AddSyllabusModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");

		let capturedBlob: Blob | null = null;
		let createdAnchor: HTMLAnchorElement | null = null;
		vi.spyOn(URL, "createObjectURL").mockImplementation(
			(obj: Blob | MediaSource) => {
				capturedBlob = obj as Blob;
				return "blob:add-syllabus-sample";
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

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tải file mẫu" }),
		);

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

	it("rejects .csv upload with an explicit error and disables submit", async () => {
		startKernelServer(syllabus());
		renderWithKernel(<AddSyllabusModal open onClose={() => {}} />);
		const dialog = await screen.findByRole("dialog");

		const input = dialog.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		fireEvent.change(input, {
			target: {
				files: [new NodeFile(["M1;d1;o1;m1"], "x.csv", { type: "text/csv" })],
			},
		});

		expect(
			await within(dialog).findByText("Chỉ nhận file Excel (.xlsx)."),
		).toBeTruthy();
		const submitBtn = within(dialog).getByRole("button", {
			name: "Tạo",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
	});
});

describe("AddModuleModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<AddModuleModal
				open
				onClose={onClose}
				target={{ kind: "template", syllabusId: "sy-1" }}
			/>
		),
		fill: (dialog) => type(dialog, /Tên module/, "  Module 2 — Mock test  "),
		submit: "Thêm module",
		expectedWrite: {
			path: "/api/syllabus-templates/sy-1/modules",
			body: { title: "Module 2 — Mock test" },
		},
	});

	it("requires a module name before writing", async () => {
		const server = startKernelServer(syllabus());
		renderWithKernel(
			<AddModuleModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Thêm module" }),
		);
		expect(await within(dialog).findAllByRole("alert")).not.toHaveLength(0);
		expect(server.writes).toEqual([]);
	});
});

describe("EditModuleModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<EditModuleModal
				open
				onClose={onClose}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
			/>
		),
		fill: (dialog) => type(dialog, /Tên module/, "Module 1 — Nền tảng"),
		submit: "Lưu thay đổi",
		expectedWrite: {
			path: "/api/syllabus-templates/sy-1/modules/m-1",
			body: { title: "Module 1 — Nền tảng" },
		},
	});

	it("opens prefilled with the module being edited", async () => {
		startKernelServer(syllabus());
		renderWithKernel(
			<EditModuleModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		expect(
			(within(dialog).getByLabelText(/Tên module/) as HTMLInputElement).value,
		).toBe("Module 1");
		expect(
			(within(dialog).getByLabelText("Mô tả ngắn") as HTMLTextAreaElement)
				.value,
		).toBe("Nền tảng");
	});
});

describe("AddLessonModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<AddLessonModal
				open
				onClose={onClose}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
			/>
		),
		fill: (dialog) => {
			type(dialog, /Tên buổi học/, "Bar chart");
			type(dialog, "Mục tiêu", "So sánh");
			type(dialog, "Tài liệu", "Cam 16");
		},
		submit: "Thêm buổi",
		expectedWrite: {
			path: "/api/syllabus-templates/sy-1/modules/m-1/lessons",
			body: { title: "Bar chart", objectives: "So sánh", materials: "Cam 16" },
		},
	});

	async function addLesson(showKind: boolean) {
		const server = startKernelServer(syllabus());
		renderWithKernel(
			<AddLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				showKind={showKind}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		type(dialog, /Tên buổi học/, "Mock test");
		return { server, dialog };
	}

	it("lets the syllabus screen pick the session kind and sends it", async () => {
		const { server, dialog } = await addLesson(true);
		fireEvent.change(within(dialog).getByLabelText("Loại buổi học"), {
			target: { value: "final" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Thêm buổi" }));
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).toMatchObject({ kind: "final" });
	});

	it("never sends a kind from the class screen, so the server keeps its default", async () => {
		const { server, dialog } = await addLesson(false);
		expect(within(dialog).queryByLabelText("Loại buổi học")).toBeNull();
		fireEvent.click(within(dialog).getByRole("button", { name: "Thêm buổi" }));
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).not.toHaveProperty("kind");
	});

	it("sends materialIds of picked bank materials (#655)", async () => {
		const server = startMaterialsBankServer();
		renderWithKernel(
			<AddLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		type(dialog, /Tên buổi học/, "Bar chart");
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		const pickerDialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		fireEvent.click(
			await within(pickerDialog).findByRole("button", {
				name: "Gắn Reading pack",
			}),
		);
		const chips = await within(dialog).findByRole("list", {
			name: "Tài liệu đã chọn",
		});
		expect(within(chips).getByText("Reading pack")).toBeTruthy();

		fireEvent.click(within(dialog).getByRole("button", { name: "Thêm buổi" }));
		const write = await waitFor(() => {
			const found = server.writes.find(
				(req) =>
					req.method === "POST" &&
					req.path === "/api/syllabus-templates/sy-1/modules/m-1/lessons",
			);
			expect(found).toBeTruthy();
			return found;
		});
		expect(write?.path).toBe(
			"/api/syllabus-templates/sy-1/modules/m-1/lessons",
		);
		expect(write?.body).toMatchObject({
			title: "Bar chart",
			materialIds: ["mat-1"],
		});
	});

	it("omits materialIds when nothing is picked (#655)", async () => {
		const { server, dialog } = await addLesson(false);
		fireEvent.click(within(dialog).getByRole("button", { name: "Thêm buổi" }));
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).not.toHaveProperty("materialIds");
	});
});

describe("EditLessonModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<EditLessonModal
				open
				onClose={onClose}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
			/>
		),
		submit: "Lưu thay đổi",
		expectedWrite: {
			path: "/api/syllabus-templates/sy-1/modules/m-1/lessons/l-1",
			body: { title: "Line chart" },
		},
	});

	it("opens prefilled with the lesson being edited", async () => {
		startKernelServer(syllabus());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
				showKind
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		const value = (label: RegExp | string) =>
			(within(dialog).getByLabelText(label) as HTMLInputElement).value;
		expect(value(/Tên buổi học/)).toBe("Line chart");
		expect(value("Mục tiêu")).toBe("Mô tả xu hướng");
		expect(value("Tài liệu")).toBe("Cam 15");
		expect(value("Loại buổi học")).toBe("midterm");
	});

	it("keeps an exam session's kind when edited from the class screen", async () => {
		const server = startKernelServer(syllabus());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).queryByLabelText("Loại buổi học")).toBeNull();
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).not.toHaveProperty("kind");
		expect(server.writes[0].body).not.toHaveProperty("status");
	});

	it("preloads bank material chips from lesson.bankMaterials (#655)", async () => {
		startKernelServer(syllabusWithBank());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		const chips = await within(dialog).findByRole("list", {
			name: "Tài liệu đã chọn",
		});
		expect(within(chips).getByText("Reading pack")).toBeTruthy();
	});

	it("omits materialIds until the user touches the selection (#655)", async () => {
		const server = startKernelServer(syllabusWithBank());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		// Chỉ lưu text — không đụng chips: server giữ nguyên links hiện có.
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0].body).not.toHaveProperty("materialIds");
	});

	it("sends the replacement materialIds once a chip is removed (#655)", async () => {
		const server = startKernelServer(syllabusWithBank());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				target={{ kind: "template", syllabusId: "sy-1" }}
				moduleId="m-1"
				lessonId="l-1"
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Gỡ Reading pack" }),
		);
		await waitFor(() =>
			expect(
				within(dialog).queryByRole("list", { name: "Tài liệu đã chọn" }),
			).toBeNull(),
		);
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		// Touched → thay thế toàn bộ: gỡ hết = mảng rỗng.
		expect(server.writes[0].body).toMatchObject({ materialIds: [] });
	});
});
