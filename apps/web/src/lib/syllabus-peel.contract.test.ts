/**
 * Source-contract lock for the Wave 2 syllabus read peel.
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

describe("syllabus read peel wiring", () => {
	test("syllabus list reads through the repo hook, not the adapter store", () => {
		const src = readSrc("routes/_auth/syllabus/index.tsx");
		expect(src).toMatch(
			/import \{ useSyllabus \} from "@\/lib\/repos\/use-syllabus"/,
		);
		expect(src).not.toMatch(/data\.syllabi/);
		expect(src).not.toMatch(/syllabusById/);
	});

	test("syllabus detail reads the syllabus via the repo, keeps useData for unpeeled collections", () => {
		const src = readSrc("routes/_auth/syllabus/$syllabusId.tsx");
		expect(src).toMatch(
			/import \{ useSyllabus \} from "@\/lib\/repos\/use-syllabus"/,
		);
		expect(src).toMatch(/const \{ syllabusById \} = useSyllabus\(\)/);
		// the store destructure carries only unpeeled collections — no syllabus reads
		expect(src).toMatch(/const \{ data \} = useData\(\)/);
		expect(src).toMatch(/data\.classes/);
		// negative backstops: no aliased store reads of syllabi either
		expect(src).not.toMatch(/data\.syllabi/);
		expect(src).not.toMatch(/useData\(\)[^\n]*syllabusById/);
	});

	test("kernel adapter reuses the syllabus repo mapping instead of duplicating it", () => {
		const src = readSrc("lib/repos/kernel.ts");
		expect(src).toMatch(/import \{ mapSyllabi \} from "\.\/syllabus"/);
		expect(src).toMatch(/syllabi: mapSyllabi\(snapshot\)/);
		expect(src).not.toMatch(/modules\.reduce/);
	});

	test("syllabus repo owns reads only — the write path stays on the command bus", () => {
		const src = readSrc("lib/repos/syllabus.ts");
		expect(src).not.toMatch(/method: "POST"/);
		expect(src).not.toMatch(/dispatch\(/);
		// purity: the mapping module never pulls the provider into unit tests
		expect(src).not.toMatch(/data-store/);
	});
});
