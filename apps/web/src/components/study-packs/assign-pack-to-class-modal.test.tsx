// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ClassStudyPacksResponse } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssignPackToClassModal } from "./assign-pack-to-class-modal";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

const mockFetchClassStudyPacks =
	vi.fn<(classId: string) => Promise<ClassStudyPacksResponse>>();
const mockAssignStudyPackToClass =
	vi.fn<
		(
			classId: string,
			input: {
				packId: string;
				startDate: string;
				releaseTime: string;
				dueTime: string;
			},
		) => Promise<ClassStudyPacksResponse>
	>();

vi.mock("@/lib/repos/study-pack", () => ({
	fetchClassStudyPacks: (classId: string) => mockFetchClassStudyPacks(classId),
	assignStudyPackToClass: (
		classId: string,
		input: {
			packId: string;
			startDate: string;
			releaseTime: string;
			dueTime: string;
		},
	) => mockAssignStudyPackToClass(classId, input),
}));

const mockDataState = {
	classes: [
		{
			id: "cl-active",
			name: "IELTS Intensive A",
			level: "6.5+",
			type: "ielts",
			skills: ["Reading"],
			mode: "Online",
			syllabusId: null,
			schedule: "T2-T4",
			sessionsTotal: 20,
			sessionsDone: 4,
			status: "active",
		},
		{
			id: "cl-paused",
			name: "IELTS Paused B",
			level: "5.5",
			type: "ielts",
			skills: ["Reading"],
			mode: "Offline",
			syllabusId: null,
			schedule: "T3-T5",
			sessionsTotal: 16,
			sessionsDone: 16,
			status: "paused",
		},
	],
	holidays: [],
};

vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: mockDataState }),
}));

function renderModal(ui: ReactNode) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>{ui}</QueryClientProvider>,
	);
}

const samplePack = {
	id: "pack-1",
	title: "Bộ đề 2 ngày Reading & Grammar",
	dayCount: 2,
	itemCount: 2,
	status: "ready" as const,
};

beforeEach(() => {
	mockFetchClassStudyPacks.mockReset();
	mockAssignStudyPackToClass.mockReset();
	mockFetchClassStudyPacks.mockResolvedValue({
		packs: [],
		holidays: [{ date: "2026-11-11", name: "Ngày nghỉ lễ" }],
	});
});

afterEach(() => {
	cleanup();
});

describe("AssignPackToClassModal", () => {
	it("filters only active classes and renders holiday-aware schedule preview with DatePickerInput/TimeInput24h", async () => {
		renderModal(
			<AssignPackToClassModal
				open={true}
				onClose={vi.fn()}
				pack={samplePack}
			/>,
		);

		const select = (await screen.findByLabelText(
			/Chọn lớp học/,
		)) as HTMLSelectElement;
		const optionTexts = Array.from(select.options).map((o) => o.textContent);
		expect(optionTexts.some((t) => t?.includes("IELTS Intensive A"))).toBe(
			true,
		);
		expect(optionTexts.some((t) => t?.includes("IELTS Paused B"))).toBe(false);

		const dateInput = document.getElementById(
			"assign-pack-start-date",
		) as HTMLInputElement;
		fireEvent.change(dateInput, { target: { value: "10/11/2026" } });

		expect(
			await screen.findByText(/Tự động bỏ qua ngày nghỉ: 11\/11\/2026/),
		).toBeTruthy();
		expect(
			screen.getByText(/Ngày 1 → 10\/11\/2026 \(06:00 – 17:00\)/),
		).toBeTruthy();
		expect(
			screen.getByText(/Ngày 2 → 12\/11\/2026 \(06:00 – 17:00\)/),
		).toBeTruthy();
	});

	it("submits assignment, shows toast/confirmation link to class page, and calls onAssigned", async () => {
		mockAssignStudyPackToClass.mockResolvedValue({
			packs: [],
			holidays: [],
		});
		const onAssigned = vi.fn();

		renderModal(
			<AssignPackToClassModal
				open={true}
				onClose={vi.fn()}
				pack={samplePack}
				onAssigned={onAssigned}
			/>,
		);

		const dateInput = document.getElementById(
			"assign-pack-start-date",
		) as HTMLInputElement;
		fireEvent.change(dateInput, { target: { value: "10/11/2026" } });

		fireEvent.click(screen.getByRole("button", { name: "Xác nhận gán bộ đề" }));

		await waitFor(() => {
			expect(mockAssignStudyPackToClass).toHaveBeenCalledWith("cl-active", {
				packId: "pack-1",
				startDate: "2026-11-10",
				releaseTime: "06:00",
				dueTime: "17:00",
			});
		});

		const classLink = (await screen.findByRole("link", {
			name: /Mở trang lớp học/,
		})) as HTMLAnchorElement;
		expect(classLink.getAttribute("href")).toBe("/classes/cl-active");
		expect(onAssigned).toHaveBeenCalledWith("cl-active");
	});

	it("handles 409 conflict errors gracefully without navigating", async () => {
		mockAssignStudyPackToClass.mockRejectedValue(
			Object.assign(new Error("conflict"), { status: 409 }),
		);

		renderModal(
			<AssignPackToClassModal
				open={true}
				onClose={vi.fn()}
				pack={samplePack}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Xác nhận gán bộ đề" }));

		expect(
			await screen.findByText("Bộ đề này đang chạy trên lớp với lịch khác."),
		).toBeTruthy();
	});
});
