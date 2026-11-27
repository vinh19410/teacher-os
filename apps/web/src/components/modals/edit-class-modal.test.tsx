// @vitest-environment jsdom

import {
	CLASS_ERROR_CODES,
	RECORDING_ERROR_CODES,
} from "@teacher-os/api/contracts";
import {
	addDaysISO,
	formatViDateDisplay,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClassGroup } from "@/lib/mock-data";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	syllabusRow,
} from "@/test/kernel-harness";
import { EditClassModal } from "./edit-class-modal";

const futureDate = addDaysISO(vietnamTodayISO(), 14);
const laterFutureDate = addDaysISO(vietnamTodayISO(), 21);

function makeClassGroup(overrides: Partial<ClassGroup> = {}): ClassGroup {
	return {
		id: "cl-1",
		name: "IELTS Writing 7.0",
		level: "Band 7.0",
		type: "ielts",
		skills: ["Writing", "Speaking"],
		mode: "Online",
		syllabusId: "",
		studentIds: [],
		invitedStudentIds: [],
		schedule: '{"days":[0,2],"start":"19:00","end":"20:30"}',
		sessionsDone: 0,
		sessionsTotal: 12,
		status: "active",
		startDate: futureDate,
		tuitionFee: 3_500_000,
		notes: "",
		schedulingMode: "auto",
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("EditClassModal", () => {
	const contractCls = makeClassGroup();

	itFollowsTheKernelFormContract({
		snapshot: () =>
			snapshotFixture({
				classes: [
					classRow({
						id: "cl-1",
						name: contractCls.name,
						level: contractCls.level,
						type: contractCls.type,
						skills: contractCls.skills,
						mode: contractCls.mode,
						schedule: contractCls.schedule,
						sessionsTotal: contractCls.sessionsTotal,
						startDate: contractCls.startDate,
						tuitionFee: contractCls.tuitionFee,
					}),
				],
			}),
		render: (onClose) => (
			<EditClassModal
				open
				onClose={onClose}
				cls={contractCls}
				hasRealSessions={false}
				existingClasses={[contractCls]}
			/>
		),
		fill: (dialog) => {
			fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
				target: { value: "  IELTS Writing 7.5  " },
			});
		},
		submit: "Lưu thay đổi",
		expectedWrite: {
			method: "PATCH",
			path: "/api/classes/cl-1",
			body: {
				name: "IELTS Writing 7.5",
				type: "ielts",
				level: "Band 7.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				tuitionFee: 3_500_000,
				schedule: { days: [0, 2], start: "19:00", end: "20:30" },
				sessionsTotal: 12,
			},
		},
	});

	it("prefills all class fields from cls", async () => {
		const cls = makeClassGroup();
		startKernelServer(snapshotFixture());
		renderWithKernel(
			<EditClassModal
				open
				onClose={() => undefined}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Chỉnh sửa lớp học",
		});

		expect(
			(within(dialog).getByLabelText(/Tên lớp/) as HTMLInputElement).value,
		).toBe("IELTS Writing 7.0");
		expect(
			(within(dialog).getByLabelText("Trình độ") as HTMLSelectElement).value,
		).toBe("Band 7.0");
		expect(
			(within(dialog).getByLabelText("Hình thức") as HTMLSelectElement).value,
		).toBe("Online");
		expect(
			within(dialog)
				.getByRole("button", { name: "Writing" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			within(dialog)
				.getByRole("button", { name: "Speaking" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			within(dialog)
				.getByRole("button", { name: "Reading" })
				.getAttribute("aria-pressed"),
		).toBe("false");
		expect(
			within(dialog)
				.getByRole("button", { name: "T2" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			within(dialog)
				.getByRole("button", { name: "T4" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			(within(dialog).getByLabelText("Giờ bắt đầu") as HTMLInputElement).value,
		).toBe("19:00");
		expect(
			(within(dialog).getByLabelText("Giờ kết thúc") as HTMLInputElement).value,
		).toBe("20:30");
		expect(
			(within(dialog).getByLabelText("Tổng số buổi") as HTMLInputElement).value,
		).toBe("12");
		expect(
			(within(dialog).getByLabelText("Ngày khai giảng") as HTMLInputElement)
				.value,
		).toBe(formatViDateDisplay(futureDate));
	});

	it("allows editing general info and schedule when hasRealSessions is false", async () => {
		const cls = makeClassGroup();
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "IELTS Intensive" },
		});
		fireEvent.change(within(dialog).getByLabelText("Hình thức"), {
			target: { value: "Offline" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "T4" }));
		fireEvent.click(within(dialog).getByRole("button", { name: "T6" }));
		fireEvent.change(within(dialog).getByLabelText("Giờ bắt đầu"), {
			target: { value: "18:00" },
		});
		fireEvent.change(within(dialog).getByLabelText("Giờ kết thúc"), {
			target: { value: "19:30" },
		});
		fireEvent.change(within(dialog).getByLabelText("Tổng số buổi"), {
			target: { value: "20" },
		});
		fireEvent.change(within(dialog).getByLabelText("Ngày khai giảng"), {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "PATCH",
				path: "/api/classes/cl-1",
				body: {
					name: "IELTS Intensive",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing", "Speaking"],
					mode: "Offline",
					tuitionFee: 3_500_000,
					schedule: { days: [0, 4], start: "18:00", end: "19:30" },
					startDate: laterFutureDate,
					sessionsTotal: 20,
				},
			},
		]);
	});

	it("disables schedule controls when hasRealSessions is true and omits schedule fields from PATCH", async () => {
		const cls = makeClassGroup({ startDate: "2020-01-01" });
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		expect(within(dialog).getByTestId("schedule-locked-note")).toBeTruthy();
		expect(
			(within(dialog).getByRole("button", { name: "T2" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Giờ bắt đầu") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Giờ kết thúc") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Tổng số buổi") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Ngày khai giảng") as HTMLInputElement)
				.disabled,
		).toBe(true);

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Tên lớp mới" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "PATCH",
				path: "/api/classes/cl-1",
				body: {
					name: "Tên lớp mới",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					tuitionFee: 3_500_000,
				},
			},
		]);
		expect(server.writes[0].body).not.toHaveProperty("schedule");
		expect(server.writes[0].body).not.toHaveProperty("startDate");
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");
	});

	it("clears and disables skills when switching type to communication", async () => {
		const cls = makeClassGroup();
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		fireEvent.click(within(dialog).getByRole("button", { name: "Giao tiếp" }));

		const writingBtn = within(dialog).getByRole("button", {
			name: "Writing",
		}) as HTMLButtonElement;
		expect(writingBtn.getAttribute("aria-pressed")).toBe("false");
		expect(writingBtn.disabled).toBe(true);

		// Switching back to IELTS keeps skills cleared
		fireEvent.click(within(dialog).getByRole("button", { name: "IELTS" }));
		expect(writingBtn.getAttribute("aria-pressed")).toBe("false");
		expect(writingBtn.disabled).toBe(false);

		// Switch back to communication and save
		fireEvent.click(within(dialog).getByRole("button", { name: "Giao tiếp" }));
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).toMatchObject({
			type: "communication",
			skills: [],
		});
	});

	it("validates startDate >= today only when startDate is changed", async () => {
		const cls = makeClassGroup({ startDate: "2020-01-01" });
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		// Unchanged past startDate saves general info without error and omits startDate
		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp giữ ngày cũ" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).not.toHaveProperty("startDate");

		// Changing startDate to a different past date is rejected before fetch
		cleanup();
		const server2 = startKernelServer(snapshotFixture());
		renderWithKernel(
			<EditClassModal
				open
				onClose={() => undefined}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog2 = await screen.findByRole("dialog");
		fireEvent.change(within(dialog2).getByLabelText("Ngày khai giảng"), {
			target: { value: "10/05/2021" },
		});
		fireEvent.click(
			within(dialog2).getByRole("button", { name: "Lưu thay đổi" }),
		);
		expect((await within(dialog2).findByRole("alert")).textContent).toBe(
			"Ngày khai giảng mới phải từ hôm nay trở đi.",
		);
		expect(server2.writes).toEqual([]);
	});

	it("still saves general info for legacy free-text schedule and legacy startDate", async () => {
		const cls = makeClassGroup({
			schedule: "T3 19:00",
			startDate: "01/08",
			sessionsTotal: 0,
		});
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		expect(within(dialog).getByText(/T3 19:00/)).toBeTruthy();
		expect(within(dialog).getByText(/01\/08/)).toBeTruthy();

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp legacy đã cập nhật" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "PATCH",
				path: "/api/classes/cl-1",
				body: {
					name: "Lớp legacy đã cập nhật",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					tuitionFee: 3_500_000,
				},
			},
		]);
	});

	it("locks sessionsTotal when class has an attached curriculum with lessons", async () => {
		const cls = makeClassGroup({
			syllabusId: "sy-copy",
			sessionsTotal: 3,
		});
		const server = startKernelServer(
			snapshotFixture({
				syllabi: [
					syllabusRow({
						id: "sy-copy",
						classId: "cl-1",
						totalLessons: 3,
						modules: [
							{
								id: "m-1",
								title: "Module 1",
								description: "",
								lessons: [
									{
										id: "l-1",
										title: "B1",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
									{
										id: "l-2",
										title: "B2",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
									{
										id: "l-3",
										title: "B3",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
								],
							},
						],
					}),
				],
			}),
		);
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		await waitFor(() => {
			expect(
				(within(dialog).getByLabelText("Tổng số buổi") as HTMLInputElement)
					.disabled,
			).toBe(true);
		});
		expect(
			within(dialog).getAllByText("Đang đồng bộ theo giáo trình của lớp")
				.length,
		).toBeGreaterThanOrEqual(1);

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp có giáo trình" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");
	});

	it("locks type and skills when curriculum specifies skills, and locks sessionsTotal in manual mode", async () => {
		const clsWithCurriculumSkills = makeClassGroup({
			id: "cl-cur",
			syllabusId: "sy-cur",
			type: "ielts",
			skills: ["Reading"],
			sessionsTotal: 2,
		});
		const server = startKernelServer(
			snapshotFixture({
				syllabi: [
					syllabusRow({
						id: "sy-cur",
						classId: "cl-cur",
						skills: ["Reading"],
						totalLessons: 2,
						modules: [
							{
								id: "m-1",
								title: "Module 1",
								description: "",
								lessons: [
									{
										id: "l-1",
										title: "B1",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
									{
										id: "l-2",
										title: "B2",
										objectives: "",
										materials: "",
										kind: "lesson",
										status: "upcoming",
									},
								],
							},
						],
					}),
				],
			}),
		);
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={clsWithCurriculumSkills}
				hasRealSessions={false}
				existingClasses={[clsWithCurriculumSkills]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		await waitFor(() => {
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Giao tiếp",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Writing",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp khóa kỹ năng theo giáo trình" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).toMatchObject({
			type: "ielts",
			skills: ["Reading"],
		});
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");

		cleanup();
		const manualCls = makeClassGroup({
			id: "cl-manual",
			syllabusId: "",
			schedulingMode: "manual",
			sessionsTotal: 0,
		});
		const serverManual = startKernelServer(snapshotFixture());
		const onCloseManual = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onCloseManual}
				cls={manualCls}
				hasRealSessions={false}
				existingClasses={[manualCls]}
			/>,
		);
		const manualDialog = await screen.findByRole("dialog");
		const totalInput = within(manualDialog).getByLabelText(
			"Tổng số buổi",
		) as HTMLInputElement;
		expect(totalInput.disabled).toBe(true);
		expect(totalInput.value).toBe("0");
		expect(
			within(manualDialog).getByText(
				"Lớp thủ công tự cập nhật theo từng buổi học thêm vào",
			),
		).toBeTruthy();

		fireEvent.change(within(manualDialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp thủ công đã sửa" },
		});
		fireEvent.click(
			within(manualDialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onCloseManual).toHaveBeenCalledTimes(1));
		expect(serverManual.writes[0].body).not.toHaveProperty("sessionsTotal");
	});

	it("never shows self-conflict warning, but warns when matching another class", async () => {
		const cls = makeClassGroup({
			id: "cl-1",
			name: "Lớp hiện tại",
			schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
			startDate: futureDate,
			sessionsTotal: 12,
		});
		const other = makeClassGroup({
			id: "cl-2",
			name: "Lớp Speaking T6",
			schedule: '{"days":[4],"start":"19:00","end":"20:30"}',
			startDate: futureDate,
			sessionsTotal: 12,
		});

		startKernelServer(snapshotFixture());
		renderWithKernel(
			<EditClassModal
				open
				onClose={() => undefined}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls, other]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		// No self-conflict on initial schedule [0]
		expect(
			within(dialog).queryByTestId("schedule-conflict-warning"),
		).toBeNull();

		// Select T6 (day 4) which overlaps `other`
		fireEvent.click(within(dialog).getByRole("button", { name: "T6" }));
		const warning = within(dialog).getByTestId("schedule-conflict-warning");
		expect(warning.textContent).toContain("Lớp Speaking T6");
		expect(warning.textContent).not.toContain("Lớp hiện tại");
	});

	it("maps 409 CLASS_SCHEDULE_LOCKED to dedicated Vietnamese message", async () => {
		const cls = makeClassGroup();
		startKernelServer(snapshotFixture(), () => ({
			status: 409,
			body: {
				error: "Class schedule is locked",
				code: CLASS_ERROR_CODES.SCHEDULE_LOCKED,
			},
		}));
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions={false}
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain(
			"Lớp đã có buổi học thực tế nên không sửa được lịch học hoặc số buổi",
		);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("unlocks startDate on unstarted auto class with real sessions, warns on schedule conflicts, blocks clearing startDate, reminds when already confirmed, and submits startDate only", async () => {
		const shiftedFutureDate = addDaysISO(futureDate, 28);
		const cls = makeClassGroup({
			id: "cl-1",
			name: "Lớp chưa khai giảng",
			schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
			startDate: futureDate,
			sessionsTotal: 2,
			openingAnnouncementVersion: 1,
			openingConfirmedAt: "2026-11-20T02:30:00.000Z",
		});
		const other = makeClassGroup({
			id: "cl-2",
			name: "Lớp T2 tháng sau",
			schedule: '{"days":[0],"start":"19:00","end":"20:30"}',
			startDate: shiftedFutureDate,
			sessionsTotal: 4,
		});
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				canEditStartDate
				existingClasses={[cls, other]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		expect(
			within(dialog).getByTestId("schedule-locked-note").textContent,
		).toContain("Bạn vẫn có thể đổi ngày khai giảng khi lớp chưa bắt đầu");
		expect(
			(within(dialog).getByRole("button", { name: "T2" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Giờ bắt đầu") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Giờ kết thúc") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			(within(dialog).getByLabelText("Tổng số buổi") as HTMLInputElement)
				.disabled,
		).toBe(true);
		const startDateInput = within(dialog).getByLabelText(
			"Ngày khai giảng",
		) as HTMLInputElement;
		expect(startDateInput.disabled).toBe(false);

		// Clearing startDate on an auto class with real sessions is blocked client-side.
		fireEvent.change(startDateInput, { target: { value: "" } });
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Lớp đã có buổi học nên không thể xóa trống ngày khai giảng.",
		);
		expect(server.writes).toEqual([]);

		// Shifting startDate into another class's window triggers conflict warning and opening reminder.
		expect(
			within(dialog).queryByTestId("schedule-conflict-warning"),
		).toBeNull();
		fireEvent.change(startDateInput, {
			target: { value: formatViDateDisplay(shiftedFutureDate) },
		});
		const warning = within(dialog).getByTestId("schedule-conflict-warning");
		expect(warning.textContent).toContain("Lớp T2 tháng sau");
		expect(within(dialog).getByRole("note").textContent).toContain(
			"Thông báo khai giảng",
		);

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "PATCH",
				path: "/api/classes/cl-1",
				body: {
					name: "Lớp chưa khai giảng",
					type: "ielts",
					level: "Band 7.0",
					skills: ["Writing", "Speaking"],
					mode: "Online",
					tuitionFee: 3_500_000,
					startDate: shiftedFutureDate,
				},
			},
		]);
		expect(server.writes[0].body).not.toHaveProperty("schedule");
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");
	});

	it("shows manual-class copy and unlocks startDate when isManual is true even on legacy auto schedulingMode without false conflict warnings", async () => {
		const cls = makeClassGroup({
			schedulingMode: "auto",
			startDate: futureDate,
			sessionsTotal: 2,
		});
		const overlappingOther = makeClassGroup({
			id: "cl-other",
			name: "Lớp trùng giờ T2/T4",
			schedule: cls.schedule,
			startDate: laterFutureDate,
			sessionsTotal: 4,
		});
		const server = startKernelServer(snapshotFixture());
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions
				isManual
				startDateLocked={false}
				startDateLockReason={null}
				canEditStartDate
				existingClasses={[cls, overlappingOther]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");

		expect(
			within(dialog).getByTestId("schedule-locked-note").textContent,
		).toContain("các buổi thủ công đã thêm giữ nguyên ngày");
		const startDateInput = within(dialog).getByLabelText(
			"Ngày khai giảng",
		) as HTMLInputElement;
		expect(startDateInput.disabled).toBe(false);

		fireEvent.change(startDateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		expect(
			within(dialog).queryByTestId("schedule-conflict-warning"),
		).toBeNull();
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).toMatchObject({
			startDate: laterFutureDate,
		});
		expect(server.writes[0].body).not.toHaveProperty("schedule");
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");
	});

	it("locks startDate with exact reason copy for started/legacy classes and for TA role", async () => {
		const cls = makeClassGroup({ startDate: futureDate });
		startKernelServer(snapshotFixture());
		renderWithKernel(
			<EditClassModal
				open
				onClose={() => undefined}
				cls={cls}
				hasRealSessions
				isManual={false}
				startDateLocked
				startDateLockReason="legacy-undated"
				canEditStartDate
				existingClasses={[cls]}
			/>,
		);
		const legacyDialog = await screen.findByRole("dialog");
		expect(
			(
				within(legacyDialog).getByLabelText(
					"Ngày khai giảng",
				) as HTMLInputElement
			).disabled,
		).toBe(true);
		expect(
			within(legacyDialog).getByTestId("schedule-locked-note").textContent,
		).toContain("định dạng cũ hoặc đã điều chỉnh buổi lẻ");

		cleanup();
		const serverTa = startKernelServer(snapshotFixture());
		const onCloseTa = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onCloseTa}
				cls={cls}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				canEditStartDate={false}
				existingClasses={[cls]}
			/>,
		);
		const taDialog = await screen.findByRole("dialog");
		expect(
			(within(taDialog).getByLabelText("Ngày khai giảng") as HTMLInputElement)
				.disabled,
		).toBe(true);
		expect(
			within(taDialog).getByText(
				"Chỉ giáo viên phụ trách hoặc quản trị viên mới có thể thay đổi ngày khai giảng.",
			),
		).toBeTruthy();

		fireEvent.change(within(taDialog).getByLabelText(/Tên lớp/), {
			target: { value: "TA cập nhật tên lớp" },
		});
		fireEvent.click(
			within(taDialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => expect(onCloseTa).toHaveBeenCalledTimes(1));
		expect(serverTa.writes[0].body).not.toHaveProperty("startDate");
	});

	it("maps 409 CLASS_START_DATE_LOCKED to dedicated message, refreshes snapshot, and resets draft date once locked", async () => {
		const cls = makeClassGroup({ startDate: futureDate });
		const server = startKernelServer(snapshotFixture(), () => ({
			status: 409,
			body: {
				error: "Class already started",
				code: CLASS_ERROR_CODES.START_DATE_LOCKED,
			},
		}));
		const onClose = vi.fn();
		function Harness() {
			const [locked, setLocked] = useState(false);
			return (
				<>
					<button type="button" onClick={() => setLocked(true)}>
						lock-start-date
					</button>
					<EditClassModal
						open
						onClose={onClose}
						cls={cls}
						hasRealSessions
						isManual={false}
						startDateLocked={locked}
						startDateLockReason={locked ? "class-started" : null}
						canEditStartDate
						existingClasses={[cls]}
					/>
				</>
			);
		}
		renderWithKernel(<Harness />);
		const dialog = await screen.findByRole("dialog");
		expect(server.snapshotLoads).toBe(1);

		const startDateInput = within(dialog).getByLabelText(
			"Ngày khai giảng",
		) as HTMLInputElement;
		fireEvent.change(startDateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		expect(startDateInput.value).toBe(formatViDateDisplay(laterFutureDate));

		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain(
			"Lớp đã bắt đầu học hoặc lịch không hỗ trợ dời tự động nên không sửa được ngày khai giảng. Dữ liệu lớp đã được tải lại.",
		);
		await waitFor(() => expect(server.snapshotLoads).toBeGreaterThanOrEqual(2));
		expect(onClose).not.toHaveBeenCalled();

		// Once refreshed parent props flip startDateLocked -> true, the disabled input resets to cls.startDate.
		fireEvent.click(screen.getByRole("button", { name: "lock-start-date" }));
		await waitFor(() => {
			expect(startDateInput.disabled).toBe(true);
			expect(startDateInput.value).toBe(formatViDateDisplay(futureDate));
		});
	});

	it("maps 409 RECORDING_LOCKED to dedicated message and refreshes snapshot", async () => {
		const cls = makeClassGroup({ startDate: futureDate });
		const server = startKernelServer(snapshotFixture(), () => ({
			status: 409,
			body: {
				error: "Buổi học đang có video ghi hình",
				code: RECORDING_ERROR_CODES.LOCKED,
				reason: "recording-locked",
			},
		}));
		const onClose = vi.fn();
		renderWithKernel(
			<EditClassModal
				open
				onClose={onClose}
				cls={cls}
				hasRealSessions
				isManual={false}
				startDateLocked={false}
				startDateLockReason={null}
				canEditStartDate
				existingClasses={[cls]}
			/>,
		);
		const dialog = await screen.findByRole("dialog");
		expect(server.snapshotLoads).toBe(1);

		const startDateInput = within(dialog).getByLabelText(
			"Ngày khai giảng",
		) as HTMLInputElement;
		fireEvent.change(startDateInput, {
			target: { value: formatViDateDisplay(laterFutureDate) },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		const alert = await within(dialog).findByRole("alert");
		expect(alert.textContent).toContain("video recording");
		await waitFor(() => expect(server.snapshotLoads).toBeGreaterThanOrEqual(2));
		expect(onClose).not.toHaveBeenCalled();
	});

	it("resets submitBlocked/notice when reopened on the same class after 5xx error and validates invalid time/date & empty legacy mode", async () => {
		const cls = makeClassGroup({ mode: "" });
		let shouldFail = true;
		startKernelServer(snapshotFixture(), () =>
			shouldFail ? { status: 500, body: { error: "boom" } } : undefined,
		);
		const onClose = vi.fn();
		function Harness() {
			const [open, setOpen] = useState(true);
			return (
				<>
					<button type="button" onClick={() => setOpen(false)}>
						test-close
					</button>
					<button type="button" onClick={() => setOpen(true)}>
						test-reopen
					</button>
					<EditClassModal
						open={open}
						onClose={() => {
							onClose();
							setOpen(false);
						}}
						cls={cls}
						hasRealSessions={false}
						existingClasses={[cls]}
					/>
				</>
			);
		}
		renderWithKernel(<Harness />);
		let dialog = await screen.findByRole("dialog");

		// Empty legacy mode keeps state="" rather than silently coercing to Online
		const modeSelect = within(dialog).getByLabelText(
			"Hình thức",
		) as HTMLSelectElement;
		expect(modeSelect.value).toBe("");
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Vui lòng chọn hình thức.",
		);

		fireEvent.change(modeSelect, { target: { value: "Online" } });

		// Invalid time / date typed partially in 24h / dd-mm-yyyy controls are caught
		fireEvent.change(within(dialog).getByLabelText("Giờ bắt đầu"), {
			target: { value: "99:99" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Giờ học phải đúng định dạng HH:mm.",
		);
		fireEvent.change(within(dialog).getByLabelText("Giờ bắt đầu"), {
			target: { value: "19:00" },
		});

		// Trigger 500 -> notice blocks submit button
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);
		await waitFor(() => {
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Lưu thay đổi",
					}) as HTMLButtonElement
				).disabled,
			).toBe(true);
		});

		// Close & reopen same class -> submitBlocked & notice are reset cleanly
		shouldFail = false;
		fireEvent.click(screen.getByRole("button", { name: "test-close" }));
		fireEvent.click(screen.getByRole("button", { name: "test-reopen" }));
		dialog = await screen.findByRole("dialog");
		const reopenedModeSelect = within(dialog).getByLabelText(
			"Hình thức",
		) as HTMLSelectElement;
		expect(reopenedModeSelect.value).toBe("");
		fireEvent.change(reopenedModeSelect, { target: { value: "Online" } });
		const saveBtn = within(dialog).getByRole("button", {
			name: "Lưu thay đổi",
		}) as HTMLButtonElement;
		expect(saveBtn.disabled).toBe(false);
		fireEvent.click(saveBtn);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});
});
