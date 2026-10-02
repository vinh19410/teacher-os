import { QUIZ_MEDIA_MAX_BYTES } from "@teacher-os/api/contracts";
import {
	formatMediaSize,
	isVideoMediaType,
	resolveQuizMediaType,
	sanitizeMediaFileName,
	validateQuizMediaFiles,
} from "@teacher-os/api/lib/quiz-media";
import { describe, expect, it } from "vitest";

function fileOfSize(name: string, type: string, size: number): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

describe("resolveQuizMediaType — chuẩn hoá MIME bài nói Speaking (#305)", () => {
	it("File.type rỗng thì tra theo đuôi file", () => {
		expect(resolveQuizMediaType("part2.m4a", "")).toBe("audio/mp4");
		expect(resolveQuizMediaType("answer.mp3", "")).toBe("audio/mpeg");
		expect(resolveQuizMediaType("clip.webm", "")).toBe("video/webm");
	});

	it("MIME trong allowlist được giữ nguyên (bỏ params, lowercase)", () => {
		expect(resolveQuizMediaType("memo.m4a", "audio/x-m4a")).toBe("audio/x-m4a");
		expect(resolveQuizMediaType("v.mov", "video/quicktime")).toBe(
			"video/quicktime",
		);
		expect(resolveQuizMediaType("a.ogg", "Audio/OGG; codecs=opus")).toBe(
			"audio/ogg",
		);
	});

	it("đuôi viết hoa vẫn nhận ra", () => {
		expect(resolveQuizMediaType("IMG_0001.MOV", "")).toBe("video/quicktime");
	});

	it("file không phải audio/video → null", () => {
		expect(resolveQuizMediaType("bai.pdf", "application/pdf")).toBeNull();
		expect(resolveQuizMediaType("noext", "")).toBeNull();
	});

	it("MIME lạ nhưng đuôi hợp lệ thì tên file thắng (server vẫn kiểm lại)", () => {
		expect(resolveQuizMediaType("answer.mp3", "text/html")).toBe("audio/mpeg");
	});
});

describe("isVideoMediaType", () => {
	it("phân biệt video với audio", () => {
		expect(isVideoMediaType("video/mp4")).toBe(true);
		expect(isVideoMediaType("video/quicktime")).toBe(true);
		expect(isVideoMediaType("audio/webm")).toBe(false);
	});
});

describe("formatMediaSize — dung lượng hiển thị theo vi-VN", () => {
	it("byte, KB, MB với dấu phẩy thập phân", () => {
		expect(formatMediaSize(0)).toBe("0 B");
		expect(formatMediaSize(1023)).toBe("1023 B");
		expect(formatMediaSize(820 * 1024)).toBe("820 KB");
		expect(formatMediaSize(1.5 * 1024 * 1024)).toBe("1,5 MB");
		expect(formatMediaSize(50 * 1024 * 1024)).toBe("50 MB");
	});
});

describe("sanitizeMediaFileName — tên file dùng chung server/client", () => {
	it("cắt đường dẫn kiểu Windows và POSIX", () => {
		expect(sanitizeMediaFileName("C:\\fakepath\\a.mp3")).toBe("a.mp3");
		expect(sanitizeMediaFileName("../../x.mp3")).toBe("x.mp3");
	});

	it("bỏ ký tự điều khiển và ký tự định dạng (bidi, zero-width)", () => {
		expect(sanitizeMediaFileName("bai\u0000noi.mp3")).toBe("bainoi.mp3");
		expect(sanitizeMediaFileName("bai-noi\u202E3pm.exe")).toBe(
			"bai-noi3pm.exe",
		);
		expect(sanitizeMediaFileName("a\u200Bb.mp3")).toBe("ab.mp3");
	});

	it("rỗng, toàn khoảng trắng hoặc quá 200 ký tự → null", () => {
		expect(sanitizeMediaFileName("")).toBeNull();
		expect(sanitizeMediaFileName("   ")).toBeNull();
		expect(sanitizeMediaFileName(`${"a".repeat(197)}.mp3`)).toBeNull();
		expect(sanitizeMediaFileName(`${"a".repeat(196)}.mp3`)).toBe(
			`${"a".repeat(196)}.mp3`,
		);
	});
});

describe("validateQuizMediaFiles — validate dùng chung dropzone và Thay file", () => {
	it("1 file hợp lệ → ok kèm MIME đã resolve", () => {
		const file = fileOfSize("part2.m4a", "", 1024);
		expect(validateQuizMediaFiles([file], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: true,
			file,
			type: "audio/mp4",
		});
	});

	it("nhiều file → multiple; thả không có file (chữ, link) → none", () => {
		const a = fileOfSize("a.mp3", "audio/mpeg", 10);
		expect(validateQuizMediaFiles([a, a], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "multiple",
		});
		expect(validateQuizMediaFiles([], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "none",
		});
	});

	it("sai định dạng → type; quá dung lượng → size kèm file", () => {
		const pdf = fileOfSize("bai.pdf", "application/pdf", 10);
		expect(validateQuizMediaFiles([pdf], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "type",
			file: pdf,
		});
		const big = fileOfSize("big.mp4", "video/mp4", QUIZ_MEDIA_MAX_BYTES + 1);
		expect(validateQuizMediaFiles([big], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "size",
			file: big,
		});
	});

	it("tên file quá 200 ký tự → name (server cũng từ chối)", () => {
		const long = fileOfSize(`${"a".repeat(201)}.mp3`, "audio/mpeg", 10);
		expect(validateQuizMediaFiles([long], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "name",
			file: long,
		});
	});

	it("file rỗng 0 byte → empty", () => {
		const empty = fileOfSize("a.mp3", "audio/mpeg", 0);
		expect(validateQuizMediaFiles([empty], QUIZ_MEDIA_MAX_BYTES)).toEqual({
			ok: false,
			reason: "empty",
			file: empty,
		});
	});
});
