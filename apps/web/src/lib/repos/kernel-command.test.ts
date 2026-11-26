import type { AssignmentPromptCreate } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
	createKernelCommandBus,
	kernelCommand,
	postKernelCommand,
} from "./kernel";

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

	test("forwards optional hybrid writing section on auto-gradable prompt (#574)", () => {
		const payload: AssignmentPromptCreate = {
			skill: "grammar",
			part: "tenses",
			type: "mcq",
			title: "Grammar + Writing",
			band: "6.5",
			source: "",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{ stem: "She ___ home.", opts: ["go", "goes"], answer: "B", alts: "" },
			],
			optionBank: [],
			note: "",
			status: "ready",
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Discuss remote work.</p>",
			},
		};
		const request = kernelCommand({
			type: "create-assignment-prompt",
			payload: { ...payload },
		});
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

describe("kernelCommand update-class-status (#694)", () => {
	test("maps to POST /api/classes/:id/status with exact status body", () => {
		const pauseReq = kernelCommand({
			type: "update-class-status",
			classId: "cl-1/special",
			status: "paused",
		});
		expect(pauseReq.path).toBe("/api/classes/cl-1%2Fspecial/status");
		expect(pauseReq.method ?? "POST").toBe("POST");
		expect(pauseReq.body).toEqual({ status: "paused" });
	});
});

describe("kernelCommand assign-class-prompt & add-class-assignment-targets", () => {
	test("forwards optional targetScope on assign-class-prompt", () => {
		const withScope = kernelCommand({
			type: "assign-class-prompt",
			payload: {
				classId: "cl-1",
				promptId: "p-1",
				due: "2026-11-10",
				dueTime: "23:59",
				note: "",
				studentIds: ["st-1", "st-2"],
				targetScope: "class",
			},
		});
		expect(withScope.path).toBe("/api/classes/cl-1/assignments");
		expect(withScope.body).toEqual({
			promptId: "p-1",
			due: "2026-11-10",
			dueTime: "23:59",
			note: "",
			studentIds: ["st-1", "st-2"],
			targetScope: "class",
		});

		const withoutScope = kernelCommand({
			type: "assign-class-prompt",
			payload: {
				classId: "cl-1",
				promptId: "p-1",
				due: "2026-11-10",
				note: "",
				studentIds: ["st-1"],
			},
		});
		expect(withoutScope.body).not.toHaveProperty("targetScope");
	});

	test("maps add-class-assignment-targets to encoded POST .../targets with studentIds", () => {
		const req = kernelCommand({
			type: "add-class-assignment-targets",
			classId: "cl-1/a",
			assignmentId: "ca-1/b",
			studentIds: ["st-2", "st-3"],
		});
		expect(req.path).toBe("/api/classes/cl-1%2Fa/assignments/ca-1%2Fb/targets");
		expect(req.method ?? "POST").toBe("POST");
		expect(req.body).toEqual({ studentIds: ["st-2", "st-3"] });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	test("preserves added count from POST .../targets response through postKernelCommand and command bus", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ id: "ca-1", added: 2 }), {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			),
		);

		const bus = createKernelCommandBus({
			postCommand: (action) =>
				postKernelCommand("http://localhost:8000", action),
			refetch: async () => {},
			onAuthLost: () => {},
		});

		const result = await bus.run({
			type: "add-class-assignment-targets",
			classId: "cl-1",
			assignmentId: "ca-1",
			studentIds: ["st-2", "st-3"],
		});

		expect(result).toEqual({
			kind: "refreshed",
			id: "ca-1",
			added: 2,
			updated: undefined,
			skipped: undefined,
			duplicates: undefined,
		});
	});
});
