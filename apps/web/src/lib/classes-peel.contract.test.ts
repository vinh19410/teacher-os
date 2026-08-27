/**
 * Source-contract lock for the Wave 3 classes read peel.
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

describe("classes read peel wiring", () => {
	test("classes list reads through the repo hook, not the adapter store", () => {
		const src = readSrc("routes/_auth/classes/index.tsx");
		expect(src).toMatch(
			/import \{ useClasses \} from "@\/lib\/repos\/use-classes"/,
		);
		expect(src).not.toMatch(/data\.classes/);
		// syllabi stay on the store until the syllabus peel (wave 2)
		expect(src).toMatch(/data\.syllabi/);
	});

	test("class detail reads the class via the repo, keeps useData for unpeeled collections and writes", () => {
		const src = readSrc("routes/_auth/classes/$classId.tsx");
		expect(src).toMatch(
			/import \{ useClasses \} from "@\/lib\/repos\/use-classes"/,
		);
		expect(src).toMatch(/const \{ classById \} = useClasses\(\)/);
		// the store destructure carries only unpeeled reads + the command bus
		expect(src).toMatch(/const \{[^}]*\bdata\b[^}]*\} = useData\(\)/);
		expect(src).toMatch(/data\.lessons/);
		expect(src).toMatch(/update-class-notes/);
		// negative backstops: no class reads off the adapter store
		expect(src).not.toMatch(/data\.classes/);
		expect(src).not.toMatch(/useData\(\)[^\n]*classById/);
	});

	test("kernel adapter reuses the classes repo mapping instead of duplicating it", () => {
		const src = readSrc("lib/repos/kernel.ts");
		expect(src).toMatch(/import \{ mapClasses \} from "\.\/classes"/);
		expect(src).toMatch(/classes: mapClasses\(snapshot\)/);
		expect(src).not.toMatch(/enrollmentsByClass/);
	});

	test("classes repo owns reads only — the write path stays on the command bus", () => {
		const src = readSrc("lib/repos/classes.ts");
		expect(src).not.toMatch(/method: "POST"/);
		expect(src).not.toMatch(/dispatch\(/);
		// roster must derive from enrollments (invariant 4: no JSON student_ids)
		expect(src).toMatch(/snapshot\.enrollments/);
		// purity: the mapping module never pulls the provider into unit tests
		expect(src).not.toMatch(/data-store/);
	});

	test("import-syllabus modal reads classes via the repo, still writes on the bus", () => {
		const src = readSrc("components/modals/import-syllabus-modal.tsx");
		expect(src).toMatch(
			/import \{ useClasses \} from "@\/lib\/repos\/use-classes"/,
		);
		expect(src).not.toMatch(/data\.classes/);
		expect(src).toMatch(/type: "import-syllabus"/);
	});
});
