import { describe, expect, test } from "vitest";
import {
	fmtDate,
	fmtDue,
	fmtWhen,
	promptStatus,
	rollupStatus,
	studentSubmissionStatus,
} from "./assignment-status";

describe("assignment-status (#208)", () => {
	const todayISO = "2026-09-18";

	describe("formatters", () => {
		test("fmtDue converts yyyy-mm-dd to dd/mm/yyyy", () => {
			expect(fmtDue("2026-09-25")).toBe("25/09/2026");
			expect(fmtDue("invalid")).toBe("invalid");
		});

		test("fmtDate formats ISO date/datetime in Vietnam timezone", () => {
			expect(fmtDate("2026-09-18T10:00:00.000Z")).toBe("18/09/2026");
			expect(fmtDate("2026-09-18")).toBe("18/09/2026");
			expect(fmtDate("")).toBe("");
		});

		test("fmtWhen formats datetime to dd/mm/yyyy · HH:mm", () => {
			// 2026-09-11 14:14:00 UTC is 21:14 in VN (UTC+7)
			expect(fmtWhen("2026-09-11T14:14:00.000Z")).toBe("11/09/2026 · 21:14");
			expect(fmtWhen("")).toBe("");
		});
	});

	describe("rollupStatus", () => {
		test("0-target guard returns 'Đang mở' (red-team F2)", () => {
			const res = rollupStatus({ due: "2026-09-10", targets: [] }, todayISO);
			expect(res).toEqual({ label: "Đang mở", tone: "neutral" });
		});

		test("all submitted returns 'Đã nộp hết'", () => {
			const res = rollupStatus(
				{
					due: "2026-09-10",
					targets: [
						{ submittedAt: "2026-09-09T10:00:00.000Z" },
						{ submittedAt: "2026-09-10T10:00:00.000Z" },
					],
				},
				todayISO,
			);
			expect(res).toEqual({ label: "Đã nộp hết", tone: "ok" });
		});

		test("not all submitted and due in the past returns 'Quá hạn'", () => {
			const res = rollupStatus(
				{
					due: "2026-09-12",
					targets: [
						{ submittedAt: "2026-09-11T10:00:00.000Z" },
						{ submittedAt: null },
					],
				},
				todayISO,
			);
			expect(res).toEqual({ label: "Quá hạn", tone: "danger" });
		});

		test("due equals today and not all submitted returns 'Đang mở' (boundary)", () => {
			const res = rollupStatus(
				{
					due: todayISO,
					targets: [{ submittedAt: null }],
				},
				todayISO,
			);
			expect(res).toEqual({ label: "Đang mở", tone: "neutral" });
		});

		test("due in the future and not all submitted returns 'Đang mở'", () => {
			const res = rollupStatus(
				{
					due: "2026-09-25",
					targets: [{ submittedAt: null }],
				},
				todayISO,
			);
			expect(res).toEqual({ label: "Đang mở", tone: "neutral" });
		});
	});

	describe("studentSubmissionStatus", () => {
		test("submitted on or before due returns 'Đã nộp'", () => {
			// Submitted on 2026-09-12 with due 2026-09-12 (boundary: same date = not late)
			const res = studentSubmissionStatus(
				{ submittedAt: "2026-09-12T10:00:00.000Z" },
				"2026-09-12",
				todayISO,
			);
			expect(res).toEqual({ label: "Đã nộp", tone: "ok" });
		});

		test("submitted after due date returns 'Đã nộp · trễ hạn'", () => {
			const res = studentSubmissionStatus(
				{ submittedAt: "2026-09-13T10:00:00.000Z" },
				"2026-09-12",
				todayISO,
			);
			expect(res).toEqual({ label: "Đã nộp · trễ hạn", tone: "warn" });
		});

		test("not submitted and due in past returns 'Chưa nộp · quá hạn'", () => {
			const res = studentSubmissionStatus(
				{ submittedAt: null },
				"2026-09-12",
				todayISO,
			);
			expect(res).toEqual({ label: "Chưa nộp · quá hạn", tone: "danger" });
		});

		test("not submitted and due is today returns 'Chưa nộp' (boundary: not yet overdue)", () => {
			const res = studentSubmissionStatus(
				{ submittedAt: null },
				todayISO,
				todayISO,
			);
			expect(res).toEqual({ label: "Chưa nộp", tone: "neutral" });
		});

		test("not submitted and due in future returns 'Chưa nộp'", () => {
			const res = studentSubmissionStatus(
				{ submittedAt: null },
				"2026-09-25",
				todayISO,
			);
			expect(res).toEqual({ label: "Chưa nộp", tone: "neutral" });
		});
	});

	describe("promptStatus", () => {
		test("draft status priority over used", () => {
			expect(promptStatus("draft", 2)).toEqual({
				label: "Bản nháp",
				tone: "draft",
			});
			expect(promptStatus("draft", 0)).toEqual({
				label: "Bản nháp",
				tone: "draft",
			});
		});

		test("used > 0 returns 'Đã dùng N lớp'", () => {
			expect(promptStatus("ready", 1)).toEqual({
				label: "Đã dùng 1 lớp",
				tone: "used",
			});
			expect(promptStatus("ready", 3)).toEqual({
				label: "Đã dùng 3 lớp",
				tone: "used",
			});
		});

		test("ready and unused returns 'Sẵn sàng'", () => {
			expect(promptStatus("ready", 0)).toEqual({
				label: "Sẵn sàng",
				tone: "ok",
			});
		});
	});
});
