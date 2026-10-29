// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type KernelServer,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";
import { OrgEventModal } from "./org-event-modal";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

let server: KernelServer;

beforeEach(() => {
	server = startKernelServer(snapshotFixture(), (req) => {
		if (req.method === "POST" && req.path === "/api/events") {
			const body = req.body as Record<string, string>;
			return {
				status: 201,
				body: {
					id: "ev-new",
					title: body.title,
					date: body.date,
					startTime: body.startTime,
					endTime: body.endTime,
					note: body.note ?? "",
				},
			};
		}
		return undefined;
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

function renderModal() {
	const client = new QueryClient();
	client.setQueryData(["kernel"], snapshotFixture());
	return render(
		<QueryClientProvider client={client}>
			<OrgEventModal open defaultDate="2026-10-12" onClose={() => {}} />
		</QueryClientProvider>,
	);
}

async function fillValidDraft() {
	fireEvent.change(screen.getByLabelText("Tên sự kiện *"), {
		target: { value: "Họp chuyên môn giáo viên" },
	});
	fireEvent.change(screen.getByLabelText("Từ giờ *"), {
		target: { value: "15:00" },
	});
	fireEvent.change(screen.getByLabelText("Đến giờ *"), {
		target: { value: "16:30" },
	});
}

describe("OrgEventModal — tạo sự kiện vận hành (TOS-14)", () => {
	it("blocks submit and shows inline errors for an invalid draft, then posts a valid one", async () => {
		renderModal();
		fireEvent.change(screen.getByLabelText("Tên sự kiện *"), {
			target: { value: "H" },
		});
		fireEvent.change(screen.getByLabelText("Từ giờ *"), {
			target: { value: "16:30" },
		});
		fireEvent.change(screen.getByLabelText("Đến giờ *"), {
			target: { value: "15:00" },
		});
		fireEvent.click(screen.getByTestId("org-event-submit"));

		expect(
			await screen.findByText("Tên sự kiện cần 2–100 ký tự."),
		).toBeTruthy();
		expect(
			screen.getByText("Giờ kết thúc phải sau giờ bắt đầu (HH:mm)."),
		).toBeTruthy();
		// Server không nhận request nào khi draft không hợp lệ.
		expect(server.writes).toHaveLength(0);

		await fillValidDraft();
		fireEvent.click(screen.getByTestId("org-event-submit"));
		// POST hoàn tất + toast thành công (createEvent cập nhật cache tại chỗ).
		await waitFor(() => {
			expect(toast.success).toHaveBeenCalledWith("Đã tạo sự kiện vận hành.");
		});
		expect(server.writes).toHaveLength(1);
		expect(server.writes[0]).toMatchObject({
			method: "POST",
			path: "/api/events",
		});
	});

	it("surfaces a 4xx as an inline error and keeps the form open", async () => {
		server.onWrite = () => ({ status: 400, body: { error: "invalid body" } });
		renderModal();
		await fillValidDraft();
		fireEvent.click(screen.getByTestId("org-event-submit"));
		expect(
			await screen.findByText("Dữ liệu chưa hợp lệ — kiểm tra lại các trường."),
		).toBeTruthy();
		expect(toast.error).not.toHaveBeenCalled();
	});
});
