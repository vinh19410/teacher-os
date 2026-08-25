/**
 * Source-contract lock for class-detail enroll wiring.
 * Not a component test. Parses JSX so ImportSyllabusModal's key cannot false-green.
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

function payloadObject(src: string): string {
	const typeIdx = src.indexOf('type: "add-student"');
	if (typeIdx < 0) {
		throw new Error("missing add-student dispatch");
	}
	const payloadIdx = src.indexOf("payload:", typeIdx);
	if (payloadIdx < 0) {
		throw new Error("missing add-student payload");
	}
	const open = src.indexOf("{", payloadIdx);
	if (open < 0) {
		throw new Error("missing payload object");
	}
	let depth = 0;
	for (let i = open; i < src.length; i += 1) {
		if (src[i] === "{") depth += 1;
		if (src[i] === "}") {
			depth -= 1;
			if (depth === 0) return src.slice(open, i + 1);
		}
	}
	throw new Error("unclosed payload object");
}

describe("add-student enroll wiring", () => {
	test("class detail AddStudentModal block passes key and classId from cls.id", () => {
		const block = extractJsxBlock(
			readSrc("routes/_auth/classes/$classId.tsx"),
			"AddStudentModal",
		);
		expect(block).toMatch(/key=\{`add-student-\$\{cls\.id\}`\}/);
		expect(block).toMatch(/classId=\{cls\.id\}/);
		expect(block).not.toMatch(/<ImportSyllabusModal/);
	});

	test("AddStudentModal puts classId inside the dispatch payload", () => {
		const src = readSrc("components/modals/add-student-modal.tsx");
		const payload = payloadObject(src);
		expect(payload).toMatch(/\bclassId\b/);
	});

	test("students list AddStudentModal call omits classId", () => {
		const block = extractJsxBlock(
			readSrc("routes/_auth/students/index.tsx"),
			"AddStudentModal",
		);
		expect(block).not.toMatch(/classId=/);
	});
});
