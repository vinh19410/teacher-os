/**
 * Source-contract lock for class-detail enroll wiring.
 * Not a component test. Parses JSX so EnrollStudentModal's key cannot false-green.
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

function extractJsxBlock(src: string, tag: string): string {
	const start = src.indexOf(`<${tag}`);
	if (start < 0) {
		throw new Error(`missing <${tag}`);
	}
	const endTag = `</${tag}>`;
	const paired = src.indexOf(endTag, start);
	if (paired >= 0) {
		return src.slice(start, paired + endTag.length);
	}
	const selfClose = src.indexOf("/>", start);
	if (selfClose < 0) {
		throw new Error(`unclosed <${tag}`);
	}
	return src.slice(start, selfClose + 2);
}

describe("enroll-student wiring", () => {
	test("class detail EnrollStudentModal block passes key and classId from cls.id", () => {
		const block = extractJsxBlock(
			readSrc("routes/_auth/classes/$classId.tsx"),
			"EnrollStudentModal",
		);
		expect(block).toMatch(/key=\{`enroll-student-\$\{cls\.id\}`\}/);
		expect(block).toMatch(/classId=\{cls\.id\}/);
		expect(block).not.toMatch(/<ImportSyllabusModal/);
	});

	test("EnrollStudentModal dispatches enroll-student with studentId and classId", () => {
		const src = readSrc("components/modals/enroll-student-modal.tsx");
		expect(src).toContain('type: "enroll-student"');
		expect(src).toContain("studentId: selectedStudentId");
		expect(src).toContain("classId");
	});

	test("students list no longer mounts student modal", () => {
		const src = readSrc("routes/_auth/students/index.tsx");
		expect(src).not.toContain("AddStudentModal");
		expect(src).not.toContain("EnrollStudentModal");
	});
});
