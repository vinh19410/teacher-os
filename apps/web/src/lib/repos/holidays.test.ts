import { RECORDING_ERROR_CODES } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyHoliday, deleteHoliday } from "./holidays";

describe("holidays repo error code parsing", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("deleteHoliday prioritizes body.code over Vietnamese body.error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error:
								"Buổi học đang có video recording lưu trên hệ thống nên không thể hoàn tác.",
							code: RECORDING_ERROR_CODES.LOCKED,
						}),
						{
							status: 409,
							headers: { "content-type": "application/json" },
						},
					),
			),
		);

		await expect(
			deleteHoliday("hol-1", "http://api.test"),
		).rejects.toMatchObject({
			holidayErrorCode: RECORDING_ERROR_CODES.LOCKED,
			status: 409,
		});
	});

	it("applyHoliday prioritizes body.code over Vietnamese body.error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error:
								"Buổi học đang có video recording lưu trên hệ thống nên chưa thể áp dụng kỳ nghỉ.",
							code: RECORDING_ERROR_CODES.LOCKED,
						}),
						{
							status: 409,
							headers: { "content-type": "application/json" },
						},
					),
			),
		);

		await expect(
			applyHoliday(
				{
					name: "Nghỉ lễ",
					fromDate: "2027-01-20",
					toDate: "2027-01-20",
					scope: "org",
					mode: "shift",
					classIds: [],
					notify: true,
				},
				"hash-1",
				"http://api.test",
			),
		).rejects.toMatchObject({
			holidayErrorCode: RECORDING_ERROR_CODES.LOCKED,
			status: 409,
		});
	});
});
