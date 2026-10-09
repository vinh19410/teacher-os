// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
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

afterEach(() => {
	cleanup();
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
			path: "/api/syllabi",
			body: { name: "IELTS Speaking 6.5", skills: ["Speaking"] },
		},
	});
});

describe("AddModuleModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<AddModuleModal open onClose={onClose} syllabusId="sy-1" />
		),
		fill: (dialog) => type(dialog, /Tên module/, "  Module 2 — Mock test  "),
		submit: "Thêm module",
		expectedWrite: {
			path: "/api/syllabi/sy-1/modules",
			body: { title: "Module 2 — Mock test" },
		},
	});

	it("requires a module name before writing", async () => {
		const server = startKernelServer(syllabus());
		renderWithKernel(
			<AddModuleModal open onClose={() => {}} syllabusId="sy-1" />,
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
				syllabusId="sy-1"
				moduleId="m-1"
			/>
		),
		fill: (dialog) => type(dialog, /Tên module/, "Module 1 — Nền tảng"),
		submit: "Lưu thay đổi",
		expectedWrite: {
			path: "/api/syllabi/sy-1/modules/m-1",
			body: { title: "Module 1 — Nền tảng" },
		},
	});

	it("opens prefilled with the module being edited", async () => {
		startKernelServer(syllabus());
		renderWithKernel(
			<EditModuleModal
				open
				onClose={() => {}}
				syllabusId="sy-1"
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
			<AddLessonModal open onClose={onClose} syllabusId="sy-1" moduleId="m-1" />
		),
		fill: (dialog) => {
			type(dialog, /Tên buổi học/, "Bar chart");
			type(dialog, "Mục tiêu", "So sánh");
			type(dialog, "Tài liệu", "Cam 16");
		},
		submit: "Thêm buổi",
		expectedWrite: {
			path: "/api/syllabi/sy-1/modules/m-1/lessons",
			body: { title: "Bar chart", objectives: "So sánh", materials: "Cam 16" },
		},
	});

	async function addLesson(showKind: boolean) {
		const server = startKernelServer(syllabus());
		renderWithKernel(
			<AddLessonModal
				open
				onClose={() => {}}
				syllabusId="sy-1"
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
});

describe("EditLessonModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: syllabus,
		render: (onClose) => (
			<EditLessonModal
				open
				onClose={onClose}
				syllabusId="sy-1"
				moduleId="m-1"
				lessonId="l-1"
			/>
		),
		submit: "Lưu thay đổi",
		expectedWrite: {
			path: "/api/syllabi/sy-1/modules/m-1/lessons/l-1",
			body: { title: "Line chart" },
		},
	});

	it("opens prefilled with the lesson being edited", async () => {
		startKernelServer(syllabus());
		renderWithKernel(
			<EditLessonModal
				open
				onClose={() => {}}
				syllabusId="sy-1"
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
				syllabusId="sy-1"
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
});
