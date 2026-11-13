// @vitest-environment jsdom

import { CLASS_ERROR_CODES } from "@teacher-os/api/contracts";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
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
		).toBe(futureDate);
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
			target: { value: laterFutureDate },
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
			target: { value: "2021-05-10" },
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
			within(dialog).getByText("Đang đồng bộ theo giáo trình của lớp"),
		).toBeTruthy();

		fireEvent.change(within(dialog).getByLabelText(/Tên lớp/), {
			target: { value: "Lớp có giáo trình" },
		});
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Lưu thay đổi" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes[0].body).not.toHaveProperty("sessionsTotal");
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
			"Lớp đã có buổi học thực tế nên không sửa được lịch học, ngày khai giảng hoặc số buổi",
		);
		expect(onClose).not.toHaveBeenCalled();
	});
});
