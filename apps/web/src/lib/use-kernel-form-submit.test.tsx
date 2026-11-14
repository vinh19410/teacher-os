// @vitest-environment jsdom
import {
	ASSIGNMENT_PROMPT_ERROR_CODES,
	ASSIGNMENT_TEST_ERROR_CODES,
	CLASS_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dataFixture = {
	dispatch: vi.fn(),
	refresh: vi.fn(),
};
vi.mock("@/lib/data-store", () => ({
	useData: () => dataFixture,
}));

import type { KernelAction } from "@/lib/data-actions";
import { HttpError } from "@/lib/kernel-load-state";
import {
	type KernelFormSubmitState,
	useKernelFormSubmit,
} from "./use-kernel-form-submit";

const ACTION: KernelAction = { type: "check-in", lessonId: "lesson-1" };

const GENERIC_MESSAGE =
	"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.";
const CONTENT_LOCKED_MESSAGE =
	"Đề đã có học viên làm bài nên không sửa được nội dung. Bạn vẫn có thể đổi tiêu đề, band, nguồn và trạng thái. Muốn đổi nội dung, hãy tạo đề mới.";
const WRITING_LOCKED_MESSAGE =
	"Đề đã được giao hoặc đang dùng trong bộ đề nên không sửa được phần Writing. Hãy trả phần này về như cũ để lưu các thay đổi khác.";
const TEST_PARTS_LOCKED_MESSAGE =
	"Bộ đề đã có học viên làm bài nên không thể thay đổi hoặc gỡ part. Bạn vẫn có thể đổi tên, thời gian và trạng thái bộ đề. Muốn thay đổi đề, hãy tạo bộ đề mới.";

const latest: { current: KernelFormSubmitState | null } = { current: null };

function Harness() {
	const state = useKernelFormSubmit();
	latest.current = state;
	return <p data-testid="error">{state.error ?? ""}</p>;
}

function renderHarness() {
	render(<Harness />);
	return {
		async run() {
			await act(async () => {
				await latest.current?.run(ACTION);
			});
		},
	};
}

describe("useKernelFormSubmit — 409 lock messages (#630)", () => {
	beforeEach(() => {
		dataFixture.dispatch.mockReset();
		dataFixture.refresh.mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it("shows the dedicated content-lock message for PROMPT_CONTENT_LOCKED and keeps failureError.code", async () => {
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
			error: new HttpError(409, "locked", {
				code: ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED,
			}),
		});
		const { run } = renderHarness();

		await run();

		expect(screen.getByTestId("error").textContent).toBe(
			CONTENT_LOCKED_MESSAGE,
		);
		expect(latest.current?.error).toBe(CONTENT_LOCKED_MESSAGE);
		expect(latest.current?.failureError?.code).toBe("PROMPT_CONTENT_LOCKED");
	});

	it("shows the dedicated writing-lock message for WRITING_SECTION_LOCKED", async () => {
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
			error: new HttpError(409, "locked", {
				code: ASSIGNMENT_PROMPT_ERROR_CODES.WRITING_SECTION_LOCKED,
			}),
		});
		const { run } = renderHarness();

		await run();

		expect(screen.getByTestId("error").textContent).toBe(
			WRITING_LOCKED_MESSAGE,
		);
		expect(latest.current?.failureError?.code).toBe("WRITING_SECTION_LOCKED");
	});

	it("shows the dedicated test-parts-lock message for TEST_PARTS_LOCKED (#633)", async () => {
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
			error: new HttpError(409, "locked", {
				code: ASSIGNMENT_TEST_ERROR_CODES.PARTS_LOCKED,
			}),
		});
		const { run } = renderHarness();

		await run();

		expect(screen.getByTestId("error").textContent).toBe(
			TEST_PARTS_LOCKED_MESSAGE,
		);
		expect(latest.current?.error).toBe(TEST_PARTS_LOCKED_MESSAGE);
		expect(latest.current?.failureError?.code).toBe("TEST_PARTS_LOCKED");
	});

	it("keeps the generic message for a non-Http definite failure", async () => {
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 400,
			error: new Error("boom"),
		});
		const { run } = renderHarness();

		await run();

		expect(screen.getByTestId("error").textContent).toBe(GENERIC_MESSAGE);
		expect(latest.current?.failureError).toBeUndefined();
	});

	it("keeps the generic message for an HttpError without a lock code (500)", async () => {
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 500,
			error: new HttpError(500, "server exploded"),
		});
		const { run } = renderHarness();

		await run();

		expect(screen.getByTestId("error").textContent).toBe(GENERIC_MESSAGE);
		expect(latest.current?.failureError?.code).toBeUndefined();
	});

	it("clears the error on a refreshed result", async () => {
		dataFixture.dispatch
			.mockResolvedValueOnce({
				kind: "definite-failure",
				status: 409,
				error: new HttpError(409, "locked", {
					code: ASSIGNMENT_PROMPT_ERROR_CODES.CONTENT_LOCKED,
				}),
			})
			.mockResolvedValueOnce({ kind: "refreshed" });
		const { run } = renderHarness();

		await run();
		expect(latest.current?.error).toBe(CONTENT_LOCKED_MESSAGE);

		await run();
		expect(latest.current?.error).toBeUndefined();
		expect(latest.current?.failureError).toBeUndefined();
		expect(screen.getByTestId("error").textContent).toBe("");
	});

	it("maps CLASS_PAUSED (409) to Vietnamese copy and refreshes kernel snapshot (#694)", async () => {
		dataFixture.refresh.mockResolvedValue(true);
		dataFixture.dispatch.mockResolvedValue({
			kind: "definite-failure",
			status: 409,
			error: new HttpError(409, "paused", {
				code: CLASS_ERROR_CODES.CLASS_PAUSED,
			}),
		});
		const { run } = renderHarness();

		await run();

		expect(latest.current?.failureError?.code).toBe(
			CLASS_ERROR_CODES.CLASS_PAUSED,
		);
		expect(latest.current?.error).toContain("tạm dừng");
		expect(dataFixture.refresh).toHaveBeenCalledTimes(1);
	});
});
