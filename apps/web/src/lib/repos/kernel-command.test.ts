import type { AssignmentPromptCreate } from "@teacher-os/api/contracts";
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
			status: "sent" as const,
		};
		const request = kernelCommand({
			type: "create-report",
			payload: { ...payload },
		});
		expect(request.path).toBe("/api/reports");
		expect(request.body).toEqual(payload);
	});
});

describe("kernelCommand create-assignment-prompt (#218)", () => {
	test("maps to /api/assignments/prompts with the exact v2 body", () => {
		const payload: AssignmentPromptCreate = {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Discuss both views",
			band: "7.0",
			source: "Cambridge 10, Test 2",
			prompt: "Some people think…",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [],
			optionBank: [],
			note: "",
			status: "ready",
		};
		const request = kernelCommand({
			type: "create-assignment-prompt",
			payload: { ...payload },
		});
		expect(request.path).toBe("/api/assignments/prompts");
		expect(request.body).toEqual(payload);
	});
});

describe("kernelCommand delete-syllabus (#211)", () => {
	test("maps to /api/syllabus-templates/:id/remove with an empty body", () => {
		const request = kernelCommand({
			type: "delete-syllabus",
			syllabusId: "sy-1",
		});
		expect(request.path).toBe("/api/syllabus-templates/sy-1/remove");
		expect(request.body).toEqual({});
	});
});
