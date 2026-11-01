// @vitest-environment jsdom

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { itFollowsTheKernelFormContract } from "@/test/kernel-form-contract";
import {
	classRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { EnrollStudentModal } from "./enroll-student-modal";

// Picking, eligibility and per-class reset are covered on the class detail
// route ($classId.test.tsx); this pins the shared write-modal contract.
describe("EnrollStudentModal", () => {
	beforeEach(() => {
		toast.success.mockReset();
		toast.error.mockReset();
	});

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
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(toast.success).toHaveBeenCalledWith(
			"Đã thêm Trần Minh Khôi vào lớp",
		);
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
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(toast.success).toHaveBeenCalledWith("Đã thêm Học viên Hai vào lớp");
	});

	it("highlights the selected student option with border-primary, ring-primary, and a check icon while keeping unselected options border-transparent without dead bg-line-soft", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [
					studentRow({ id: "st-1", name: "Học viên Một" }),
					studentRow({ id: "st-2", name: "Học viên Hai" }),
				],
			}),
		);
		renderWithKernel(
			<EnrollStudentModal open onClose={vi.fn()} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		const optMot = within(dialog).getByRole("option", { name: /Học viên Một/ });
		const optHai = within(dialog).getByRole("option", { name: /Học viên Hai/ });

		fireEvent.click(optHai);

		expect(optHai.getAttribute("aria-selected")).toBe("true");
		expect(optHai.classList.contains("border-primary")).toBe(true);
		expect(optHai.classList.contains("bg-muted")).toBe(true);
		expect(optHai.classList.contains("ring-1")).toBe(true);
		expect(optHai.classList.contains("ring-primary")).toBe(true);
		expect(optHai.classList.contains("focus-visible:ring-[3px]")).toBe(true);
		expect(optHai.classList.contains("focus-visible:ring-ring/50")).toBe(true);
		expect(optHai.classList.contains("border-transparent")).toBe(false);
		expect(optHai.querySelector('svg[aria-hidden="true"]')).not.toBeNull();

		expect(optMot.getAttribute("aria-selected")).toBe("false");
		expect(optMot.classList.contains("border-transparent")).toBe(true);
		expect(optMot.classList.contains("hover:bg-accent")).toBe(true);
		expect(optMot.classList.contains("hover:bg-line-soft")).toBe(false);
		expect(optMot.classList.contains("border-primary")).toBe(false);
		expect(optMot.querySelector("svg")).toBeNull();
	});

	it("falls back to 'Đã thêm học viên vào lớp' when an existing student's name is whitespace (#522)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [
					studentRow({ id: "st-2", name: "   ", phone: "0909123456" }),
				],
			}),
		);
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(within(dialog).getByRole("option", { name: /0909123456/ }));
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(toast.success).toHaveBeenCalledWith("Đã thêm học viên vào lớp");
	});

	it("does not call toast.success when the server rejects the enrollment with 422 (#522)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
			() => ({ status: 422, body: {} }),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		expect(await within(dialog).findByRole("alert")).toBeTruthy();
		expect(toast.success).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
	});

	it("withholds toast.success on a committed write when snapshot refresh 503s, then toasts once after reconcile succeeds (#522)", async () => {
		const server = startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
			(_req, srv) => {
				srv.snapshotReply = () => ({ status: 503, body: {} });
				return undefined;
			},
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		const reload = await within(dialog).findByRole("button", {
			name: "Tải lại",
		});
		expect(toast.success).not.toHaveBeenCalled();

		server.snapshotReply = undefined;
		fireEvent.click(reload);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(toast.success).toHaveBeenCalledTimes(1);
		expect(toast.success).toHaveBeenCalledWith("Đã thêm Học viên Hai vào lớp");
	});

	it("does not call toast.success when reconciling an outcome-unknown write (#522)", async () => {
		startKernelServer(
			snapshotFixture({
				classes: [classRow({ id: "cl-1" })],
				students: [studentRow({ id: "st-2", name: "Học viên Hai" })],
			}),
			() => ({ status: 503, body: {} }),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const onClose = vi.fn();
		renderWithKernel(
			<EnrollStudentModal open onClose={onClose} classId="cl-1" />,
		);
		const dialog = await screen.findByRole("dialog");
		fireEvent.click(
			within(dialog).getByRole("option", { name: /Học viên Hai/ }),
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Lưu" }));

		const reload = await within(dialog).findByRole("button", {
			name: "Tải lại & kiểm tra",
		});
		expect(toast.success).not.toHaveBeenCalled();

		fireEvent.click(reload);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(toast.success).not.toHaveBeenCalled();
	});
});
