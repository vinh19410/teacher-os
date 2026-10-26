import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { countPdfPages, sha256Hex } from "./fingerprint";

// Fixture PDF 2 trang tự sinh (không dùng tài liệu bản quyền) — verify
// heuristic đếm trang đúng trên file thật của e2e.
const FIXTURE_PATH = new URL(
	"../../../../../apps/e2e/fixtures/exam-import/cambridge-sample.pdf",
	import.meta.url,
).pathname;

describe("exam-import fingerprint (TOS-24 #470)", () => {
	test("countPdfPages đếm đúng 2 trang của fixture, /Pages không bị đếm nhầm", async () => {
		const buffer = await readFile(FIXTURE_PATH);
		const data = buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength,
		);
		expect(countPdfPages(data)).toBe(2);
	});

	test("countPdfPages trả null khi không phải PDF/không có trang", () => {
		expect(
			countPdfPages(
				new TextEncoder().encode("not a pdf").buffer as ArrayBuffer,
			),
		).toBeNull();
	});

	test("sha256Hex trả hex 64 ký tự khớp giá trị known-answer", async () => {
		const digest = await sha256Hex(
			new TextEncoder().encode("abc").buffer as ArrayBuffer,
		);
		// sha256("abc") — known answer từ FIPS 180-4.
		expect(digest).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});
});
