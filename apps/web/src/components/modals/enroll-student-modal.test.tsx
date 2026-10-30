// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { EnrollStudentModal } from "./enroll-student-modal";

// Picking, eligibility and per-class reset are covered on the class detail
// route ($classId.test.tsx); this pins the shared write-modal contract.
describe("EnrollStudentModal", () => {
	itFollowsTheKernelFormContract({
		snapshot: () =>
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
		render: (onClose) => (
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />
		),
		fill: (dialog) => {
			fireEvent.click(
				within(dialog).getByRole("option", { name: /Học viên Hai/ }),
			);
		},
		submit: "Lưu",
		expectedWrite: {
			path: "/api/classes/cl-1/enroll",
			body: { studentId: "st-2", activateNow: false },
		},
	});

	it("defaults to create-new mode when org has 0 students and submits POST /api/students with classId and activateNow=true", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [],
			}),
		);
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.change(within(dialog).getByLabelText(/Họ tên học viên/), {
			target: { value: "Trần Minh Khôi" },
		});
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/students",
				body: {
					name: "Trần Minh Khôi",
					phone: "",
					email: "",
					parentName: "",
					parentPhone: "",
					classId: "cl-1",
					activateNow: true,
				},
			},
		]);
	});

	it("sends activateNow=true in existing mode when teacher checks the activation box", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
		);
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(
			within(dialog).getByLabelText(/Kích hoạt trạng thái Đang học ngay/),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/enroll",
				body: { studentId: "st-2", activateNow: true },
			},
		]);
	});
});
