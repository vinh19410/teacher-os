import { describe, expect, test } from "vitest";

import { kernelCommand } from "./kernel";

/**
 * Issue #173: the report modal's write must map to POST /api/reports with
 * exactly the five fields reportCreateSchema accepts (.strict() — anything
 * extra 400s).
 */
describe("kernelCommand create-report", () => {
	test("maps to /api/reports with the five-field body", () => {
		const payload = {
			studentId: "s1",
			period: "08–14/09",
			content: "Tuần học tốt.",
			channel: "Zalo OA",
			status: "sent",
		} as const;
		const request = kernelCommand({
			type: "create-report",
			payload: { ...payload },
		});
		expect(request.path).toBe("/api/reports");
		expect(request.body).toEqual(payload);
	});
});
