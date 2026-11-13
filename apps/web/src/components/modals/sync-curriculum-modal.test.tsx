// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { SyncCurriculumModal } from "./sync-curriculum-modal";

const makeLesson = (id: string, title: string) => ({
	id,
	title,
	objectives: "",
	materials: "",
	kind: "lesson" as const,
	status: "upcoming" as const,
});

const outOfSyncSnapshot = (opts?: {
	sessionsTotal?: number;
	templateLessonCount?: number;
}) => {
	const templateLessonCount = opts?.templateLessonCount ?? 2;
	const tplLessons = Array.from({ length: templateLessonCount }, (_, i) =>
		makeLesson(`tl-${i + 1}`, `Template Lesson ${i + 1}`),
	);
	return snapshotFixture({
		classes: [
			classRow({
				id: "cl-1",
				name: "IELTS Writing",
				syllabusId: "sy-copy",
				sessionsTotal: opts?.sessionsTotal ?? 1,
			}),
		],
		syllabi: [
			syllabusRow({
				id: "sy-tpl",
				name: "Template Gốc",
				totalLessons: templateLessonCount,
				modules: [
					{
						id: "m-t1",
						title: "Module 1",
						description: "",
						lessons: tplLessons,
					},
				],
			}),
			syllabusRow({
				id: "sy-copy",
				name: "Template Gốc",
				classId: "cl-1",
				sourceTemplateId: "sy-tpl",
				totalLessons: 1,
				modules: [
					{
						id: "m-c1",
						title: "Module 1",
						description: "",
						lessons: [makeLesson("cl-l1", "Old Copy Lesson")],
					},
				],
			}),
		],
	});
};

const missingSourceSnapshot = () =>
	snapshotFixture({
		classes: [
			classRow({
				id: "cl-1",
				name: "IELTS Writing",
				syllabusId: "sy-copy",
				sessionsTotal: 1,
			}),
		],
		syllabi: [
			syllabusRow({
				id: "sy-a",
				name: "Template A",
				totalLessons: 2,
				modules: [
					{
						id: "m-a1",
						title: "Module A",
						description: "",
						lessons: [makeLesson("la-1", "A1"), makeLesson("la-2", "A2")],
					},
				],
			}),
			syllabusRow({
				id: "sy-b",
				name: "Template B",
				totalLessons: 1,
				modules: [
					{
						id: "m-b1",
						title: "Module B",
						description: "",
						lessons: [makeLesson("lb-1", "B1")],
					},
				],
			}),
			syllabusRow({
				id: "sy-copy",
				name: "Orphan Copy",
				classId: "cl-1",
				sourceTemplateId: "sy-deleted",
				totalLessons: 1,
				modules: [
					{
						id: "m-c1",
						title: "Module 1",
						description: "",
						lessons: [makeLesson("lc-1", "Old Lesson")],
					},
				],
			}),
		],
	});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("SyncCurriculumModal", () => {
	describe("linked source template contract", () => {
		itFollowsTheKernelFormContract({
			snapshot: outOfSyncSnapshot,
			render: (onClose) => (
				<SyncCurriculumModal open onClose={onClose} classId="cl-1" />
			),
			submit: "Đồng bộ lại",
			expectedWrite: {
				path: "/api/classes/cl-1/curriculum/sync",
				body: {},
			},
		});
	});

	describe("missing source template contract", () => {
		itFollowsTheKernelFormContract({
			snapshot: missingSourceSnapshot,
			render: (onClose) => (
				<SyncCurriculumModal open onClose={onClose} classId="cl-1" />
			),
			submit: "Đồng bộ giáo trình",
			expectedWrite: {
				path: "/api/classes/cl-1/curriculum/sync",
				body: { templateId: "sy-a" },
			},
		});
	});

	it("renders out-of-sync summary with lesson count transition and updates projected sessionsTotal bullet when no real sessions", async () => {
		startKernelServer(
			outOfSyncSnapshot({ sessionsTotal: 1, templateLessonCount: 2 }),
		);
		renderWithKernel(
			<SyncCurriculumModal
				open
				onClose={() => {}}
				classId="cl-1"
				hasRealSessions={false}
			/>,
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		expect(dialog.textContent).toContain(
			'Lớp "IELTS Writing" sẽ đồng bộ lại theo template "Template Gốc" (1 buổi → 2 buổi).',
		);
		expect(dialog.textContent).toContain(
			"Tiến độ bài học (Đã học / Đang học / Sắp tới) được giữ nguyên theo thứ tự buổi 1..N.",
		);
		expect(dialog.textContent).toContain(
			"Tổng số buổi dự kiến của lớp sẽ cập nhật thành 2 buổi.",
		);
		expect(dialog.textContent).not.toContain("Lớp đã có lịch buổi học thực tế");
	});

	it("shows hasRealSessions warning instead of sessionsTotal update when class already has real sessions", async () => {
		startKernelServer(
			outOfSyncSnapshot({ sessionsTotal: 1, templateLessonCount: 2 }),
		);
		renderWithKernel(
			<SyncCurriculumModal
				open
				onClose={() => {}}
				classId="cl-1"
				hasRealSessions
			/>,
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Đồng bộ lại giáo trình?",
		});
		expect(dialog.textContent).toContain(
			"Lưu ý: Lớp đã có lịch buổi học thực tế (1 buổi) — lịch điểm danh và gói buổi của học viên vẫn giữ nguyên.",
		);
		expect(dialog.textContent).not.toContain(
			"Tổng số buổi dự kiến của lớp sẽ cập nhật",
		);
	});

	it("omits arrow in lesson count when copy and template have the same lesson count", async () => {
		startKernelServer(
			outOfSyncSnapshot({ sessionsTotal: 1, templateLessonCount: 1 }),
		);
		renderWithKernel(
			<SyncCurriculumModal open onClose={() => {}} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain(
			'Lớp "IELTS Writing" sẽ đồng bộ lại theo template "Template Gốc" (1 buổi).',
		);
		expect(dialog.textContent).not.toContain("→");
		expect(dialog.textContent).not.toContain(
			"Tổng số buổi dự kiến của lớp sẽ cập nhật",
		);
	});

	it("picks a replacement template when source template was deleted and shows toast on success", async () => {
		const server = startKernelServer(missingSourceSnapshot());
		const toastSpy = vi.spyOn(toast, "success");
		const onClose = vi.fn();
		renderWithKernel(
			<SyncCurriculumModal open onClose={onClose} classId="cl-1" />,
		);

		const dialog = await screen.findByRole("dialog", {
			name: "Đồng bộ giáo trình từ template khác",
		});
		expect(dialog.textContent).toContain(
			'Template gốc của lớp "IELTS Writing" đã bị xóa',
		);
		expect(
			within(dialog)
				.getAllByRole("option")
				.map((o) => o.textContent),
		).toEqual(["Template A · 2 buổi", "Template B · 1 buổi"]);

		fireEvent.change(within(dialog).getByRole("combobox"), {
			target: { value: "sy-b" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng bộ giáo trình" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/curriculum/sync",
				body: { templateId: "sy-b" },
			},
		]);
		expect(toastSpy).toHaveBeenCalledWith("Đã đồng bộ giáo trình.");
	});

	it("disables submit in missing-source mode when no templates exist", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1", syllabusId: "sy-copy" })],
				syllabi: [
					syllabusRow({
						id: "sy-copy",
						name: "Orphan Copy",
						classId: "cl-1",
						sourceTemplateId: null,
					}),
				],
			}),
		);
		renderWithKernel(
			<SyncCurriculumModal open onClose={() => {}} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		const submitBtn = within(dialog).getByRole("button", {
			name: "Đồng bộ giáo trình",
		}) as HTMLButtonElement;
		expect(submitBtn.disabled).toBe(true);
	});

	it("maps all allowlisted sync error codes to Vietnamese alerts", async () => {
		const cases: Array<[string, string]> = [
			[
				"MANUAL_SESSIONS_EXIST",
				"Lớp đã có buổi học thủ công. Vui lòng xóa các buổi chưa học trước khi đồng bộ giáo trình.",
			],
			[
				"CURRICULUM_EMPTY_TEMPLATE",
				"Template chưa có bài học nào. Vui lòng thêm ít nhất 1 bài học trước khi đồng bộ.",
			],
			[
				"CURRICULUM_TOO_MANY_LESSONS",
				"Template vượt quá giới hạn 52 buổi học của lớp.",
			],
			["CURRICULUM_TEMPLATE_TOO_LARGE", "Template quá lớn để đồng bộ."],
			[
				"CURRICULUM_MATERIAL_NOT_FOUND",
				"Một số tài liệu gắn trong template không còn tồn tại trong ngân hàng tài liệu.",
			],
			["CURRICULUM_NOT_FOUND", "Lớp chưa có giáo trình để đồng bộ."],
			[
				"CURRICULUM_SOURCE_TEMPLATE_MISSING",
				"Template gốc đã bị xóa. Vui lòng chọn template khác để đồng bộ.",
			],
		];

		let nextCode = cases[0][0];
		startKernelServer(outOfSyncSnapshot(), () => ({
			status: 422,
			body: { code: nextCode },
		}));
		renderWithKernel(
			<SyncCurriculumModal open onClose={() => {}} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		const submitBtn = within(dialog).getByRole("button", {
			name: "Đồng bộ lại",
		});

		for (const [code, expectedMessage] of cases) {
			nextCode = code;
			fireEvent.click(submitBtn);
			const alert = await within(dialog).findByRole("alert");
			await waitFor(() => expect(alert.textContent).toBe(expectedMessage));
		}
	});

	it("clears alert error on reopen without wiping reconcile notice / submitBlocked", async () => {
		function Harness() {
			const [open, setOpen] = useState(true);
			return (
				<div>
					<button type="button" onClick={() => setOpen((v) => !v)}>
						Toggle
					</button>
					<SyncCurriculumModal
						open={open}
						onClose={() => setOpen(false)}
						classId="cl-1"
					/>
				</div>
			);
		}

		let failWrite = true;
		startKernelServer(outOfSyncSnapshot(), (_req, srv) => {
			if (failWrite) {
				return {
					status: 409,
					body: {
						code: "MANUAL_SESSIONS_EXIST",
					},
				};
			}
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		renderWithKernel(<Harness />);
		let dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng bộ lại" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toContain(
			"Lớp đã có buổi học thủ công",
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		dialog = await screen.findByRole("dialog");
		expect(within(dialog).queryByRole("alert")).toBeNull();

		failWrite = false;
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Đồng bộ lại" }),
		);
		await waitFor(() =>
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Đồng bộ lại",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true),
		);

		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
		dialog = await screen.findByRole("dialog");
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Đồng bộ lại",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});
});
