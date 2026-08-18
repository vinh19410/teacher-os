/**
 * Kernel runtime contract — locks the Wave 0 wiring without rendering React.
 * Mirrors the source-parse style of add-student-enroll.contract.test.ts.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function readSrc(rel: string): string {
	return readFileSync(join(here, rel), "utf8");
}

const KERNEL_WRITE_MODALS = [
	"add-student-modal.tsx",
	"add-class-modal.tsx",
	"add-syllabus-modal.tsx",
	"assign-syllabus-modal.tsx",
	"add-module-modal.tsx",
	"edit-module-modal.tsx",
	"add-lesson-modal.tsx",
	"edit-lesson-modal.tsx",
] as const;

describe("kernel-backed store wiring", () => {
	test("data-store.tsx stays a shim re-exporting from data-provider", () => {
		const src = readSrc("data-store.tsx");
		expect(src).toMatch(
			/export \{ DataProvider, useData \} from "\.\/data-provider"/,
		);
		expect(src).not.toMatch(/useReducer/);
		expect(src).not.toMatch(/seedData/);
	});

	test("data-provider never mounts seedData and gates children on kernel load", () => {
		const src = readSrc("data-provider.tsx");
		expect(src).not.toMatch(/seedData/);
		expect(src).toMatch(/emptyData/);
		// Loading gate: children stay unmounted until the first snapshot settles.
		expect(src).toMatch(/if \(!kernelLoaded\)/);
		expect(src).toMatch(/return null/);
	});

	test("kernel writes POST with cookies included", () => {
		const src = readSrc("repos/kernel.ts");
		expect(src).toMatch(/credentials: "include"/);
	});

	test("kernel write modals await the dispatch before closing", () => {
		for (const file of KERNEL_WRITE_MODALS) {
			const src = readSrc(`../components/modals/${file}`);
			expect(src, file).toMatch(/async function submit/);
			expect(src, file).toMatch(/await dispatch\(/);
		}
	});

	test("add-syllabus navigates with the server id, not a client id", () => {
		const src = readSrc("../components/modals/add-syllabus-modal.tsx");
		expect(src).toMatch(/serverId = await dispatch\(/);
		expect(src).toMatch(/if \(serverId && onCreated\) onCreated\(serverId\)/);
		expect(src).not.toMatch(/onCreated\(id\)/);
	});
});

describe("reducer kernel-loaded hydration", () => {
	test("emptyData hydrates the kernel slice and keeps local collections", async () => {
		const { emptyData, reducer } = await import("./data-store-reducer");
		const payload = {
			students: [
				{
					id: "s1",
					name: "A",
					pkg: {
						total: 10,
						done: 0,
						remaining: 10,
						price: 1,
						mode: "Online" as const,
						start: "",
						expiry: "",
					},
					phone: "",
					zalo: "",
					parent: { name: "", phone: "" },
					targetBand: "—",
					skills: [],
					examDate: "",
					tags: [],
					notes: "",
					avatar: "A",
					atRisk: false,
				},
			],
			classes: [],
			syllabi: [],
		};
		const next = reducer(
			{
				...emptyData,
				notifs: [
					{
						id: "n1",
						text: "t",
						time: "",
						channel: "",
						dot: "accent" as const,
					},
				],
			},
			{ type: "kernel-loaded", payload },
		);
		expect(next.students).toHaveLength(1);
		expect(next.notifs).toHaveLength(1);
	});
});
