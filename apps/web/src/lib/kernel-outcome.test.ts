/**
 * Decision table for direct-action outcomes: every KernelCommandResult maps
 * to a truthful toast + reconcile policy. Pure — no toast import needed here.
 */
import { describe, expect, test } from "vitest";
import { HttpError } from "./kernel-load-state";
import { planDirectOutcome } from "./kernel-outcome";

describe("planDirectOutcome", () => {
	test("refreshed reports success and settles", () => {
		expect(
			planDirectOutcome({ kind: "refreshed", id: "l-1" }, "Đã điểm danh."),
		).toEqual({
			toastKind: "success",
			message: "Đã điểm danh.",
			reconcile: "none",
		});
	});

	test("committed is info — saved server-side, snapshot refresh failed", () => {
		expect(planDirectOutcome({ kind: "committed" }, "x")).toEqual({
			toastKind: "info",
			message: "Đã lưu trên máy chủ nhưng chưa tải lại được dữ liệu.",
			reconcile: "none",
		});
	});

	test("a plain 4xx definite failure is an error that settles", () => {
		const plan = planDirectOutcome(
			{ kind: "definite-failure", status: 400, error: new Error("bad") },
			"x",
		);
		expect(plan.toastKind).toBe("error");
		expect(plan.message).toBe(
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ.",
		);
		expect(plan.reconcile).toBe("none");
	});

	test("409 is the duplicate-guard: info + heal, never a false write failure", () => {
		const plan = planDirectOutcome(
			{
				kind: "definite-failure",
				status: 409,
				error: new HttpError(409, "POST /api/lessons/l1/check-in failed: 409"),
			},
			"Đã điểm danh.",
		);
		expect(plan.toastKind).toBe("info");
		expect(plan.message).toMatch(/được cập nhật trước đó/);
		expect(plan.reconcile).toBe("heal-409");
	});

	test("409 on reorder/delete uses set-mismatch copy, not duplicate-guard", () => {
		const plan = planDirectOutcome(
			{
				kind: "definite-failure",
				status: 409,
				error: new HttpError(409, "POST reorder failed: 409"),
			},
			"Đã đổi thứ tự module.",
			"reorder-modules",
		);
		expect(plan.message).toMatch(/Thứ tự đã đổi/);
		expect(plan.message).not.toMatch(/được cập nhật trước đó/);
		expect(plan.reconcile).toBe("heal-409");
	});

	test("outcome-unknown warns and reconciles — never claims unsaved", () => {
		const plan = planDirectOutcome(
			{ kind: "outcome-unknown", error: new TypeError("fetch failed") },
			"x",
		);
		expect(plan.toastKind).toBe("warning");
		expect(plan.message).toMatch(/có thể đã lưu/);
		expect(plan.message).not.toMatch(/chưa được ghi/);
		expect(plan.reconcile).toBe("check");
	});
});
