// @vitest-environment jsdom
import { QUIZ_MEDIA_MAX_BYTES } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import { prepareVocabAudioUpload } from "./vocab-deck-editor";
import { vocabAudioRejectMessage } from "./vocab-word-row";

function fileOfSize(name: string, type: string, size: number): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

describe("prepareVocabAudioUpload (#681)", () => {
	it("chuẩn hoá Content-Type và encodeURIComponent X-File-Name cho file audio hợp lệ", () => {
		expect(
			prepareVocabAudioUpload(fileOfSize("resilient (1).mp3", "", 120)),
		).toEqual({
			ok: true,
			contentType: "audio/mpeg",
			encodedFileName: "resilient%20(1).mp3",
		});
		expect(
			prepareVocabAudioUpload(fileOfSize("word.m4a", "video/mp4", 120)),
		).toEqual({
			ok: true,
			contentType: "audio/mp4",
			encodedFileName: "word.m4a",
		});
		expect(
			prepareVocabAudioUpload(fileOfSize("word.webm", "video/webm", 120)),
		).toEqual({
			ok: true,
			contentType: "audio/webm",
			encodedFileName: "word.webm",
		});
		expect(
			prepareVocabAudioUpload(fileOfSize("word.opus", "audio/opus", 120)),
		).toEqual({
			ok: true,
			contentType: "audio/ogg",
			encodedFileName: "word.opus",
		});
	});

	it("từ chối payload.html, text/html, video/mp4, file 0 B và vượt 50 MB", () => {
		expect(
			prepareVocabAudioUpload(fileOfSize("payload.html", "audio/mpeg", 50)).ok,
		).toBe(false);
		expect(
			prepareVocabAudioUpload(fileOfSize("word.mp3", "text/html", 50)).ok,
		).toBe(false);
		expect(
			prepareVocabAudioUpload(fileOfSize("clip.mp4", "video/mp4", 50)).ok,
		).toBe(false);
		expect(
			prepareVocabAudioUpload(fileOfSize("empty.mp3", "audio/mpeg", 0)).ok,
		).toBe(false);
		expect(
			prepareVocabAudioUpload(
				fileOfSize("huge.mp3", "audio/mpeg", QUIZ_MEDIA_MAX_BYTES + 1),
			).ok,
		).toBe(false);
	});
});

describe("vocabAudioRejectMessage (#681 RT#6)", () => {
	it("bỏ qua reason 'none' và phân nhánh đúng thông báo theo từng lý do", () => {
		expect(vocabAudioRejectMessage("none")).toBeNull();
		expect(vocabAudioRejectMessage("multiple")).toMatch(/1 file/);
		expect(vocabAudioRejectMessage("size")).toMatch(/50 MB/);
		expect(vocabAudioRejectMessage("empty")).toMatch(/rỗng/);
		expect(vocabAudioRejectMessage("name")).toMatch(/200/);
		expect(vocabAudioRejectMessage("type")).toMatch(/MP3/);
	});
});
