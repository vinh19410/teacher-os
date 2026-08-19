/**
 * Source-contract lock for the Wave 1 students read peel.
 * Not a component test. Parses JSX so a reverted import cannot false-green.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = join(here, "..");

function readSrc(rel: string): string {
	return readFileSync(join(webSrc, rel), "utf8");
}

describe("students read peel wiring", () => {
	test("students list reads through the repo hook, not the adapter store", () => {
		const src = readSrc("routes/_auth/students/index.tsx");
		expect(src).toMatch(
			/import \{ useStudents \} from "@\/lib\/repos\/use-students"/,
		);
		expect(src).not.toMatch(/data\.students/);
		expect(src).not.toMatch(/studentById/);
	});

	test("student detail reads the student via the repo, keeps useData for unpeeled collections", () => {
		const src = readSrc("routes/_auth/students/$studentId.tsx");
		expect(src).toMatch(
			/import \{ useStudents \} from "@\/lib\/repos\/use-students"/,
		);
		expect(src).toMatch(/const \{ studentById \} = useStudents\(\)/);
		// the store destructure carries only unpeeled collections — no student reads
		expect(src).toMatch(/const \{ data \} = useData\(\)/);
		expect(src).toMatch(/data\.lessons/);
		// negative backstops: no aliased store reads of students either
		expect(src).not.toMatch(/data\.students/);
		expect(src).not.toMatch(/useData\(\)[^\n]*studentById/);
	});

	test("kernel adapter reuses the students repo mapping instead of duplicating it", () => {
		const src = readSrc("lib/repos/kernel.ts");
		expect(src).toMatch(/import \{ mapStudents \} from "\.\/students"/);
		expect(src).toMatch(/students: mapStudents\(snapshot\)/);
		expect(src).not.toMatch(/packagesByStudent/);
	});

	test("students repo owns reads only — the write path stays on the command bus", () => {
		const src = readSrc("lib/repos/students.ts");
		expect(src).not.toMatch(/method: "POST"/);
		expect(src).not.toMatch(/dispatch\(/);
		// purity: the mapping module never pulls the provider into unit tests
		expect(src).not.toMatch(/data-store/);
	});
});
