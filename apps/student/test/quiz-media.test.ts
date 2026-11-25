import { QueryClient } from "@tanstack/react-query";
import {
	QUIZ_MEDIA_MAX_BYTES,
	type StudentQuizDetail,
} from "@teacher-os/api/contracts";
import {
	formatMediaSize,
	isVideoMediaType,
	resolveQuizMediaType,
	sanitizeMediaFileName,
	validateQuizMediaFiles,
} from "@teacher-os/api/lib/quiz-media";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getServerClockSkewMs,
	resetServerClockForTests,
} from "@/lib/attempt-format";
import {
	fetchStudentQuizDetail,
	quizDetailQueryOptions,
	setQuizDetailMedia,
} from "@/lib/repos/quiz";

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

	it("chặn MIME nguy hiểm/lệch đuôi, dotfile và chuẩn hoá .m4a + video/mp4 (#681)", () => {
		expect(resolveQuizMediaType("answer.mp3", "text/html")).toBeNull();
		expect(resolveQuizMediaType("payload.html", "audio/mpeg")).toBeNull();
		expect(resolveQuizMediaType(".mp3", "audio/mpeg")).toBeNull();
		expect(resolveQuizMediaType("voice.m4a", "video/mp4")).toBe("audio/mp4");
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

describe("repos/quiz — X-Server-Now sync & setQuizDetailMedia cache timestamp", () => {
	afterEach(() => {
		resetServerClockForTests();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("fetchStudentQuizDetail syncs server clock skew from X-Server-Now response header", async () => {
		resetServerClockForTests();
		const serverIso = "2026-11-24T10:00:00.000Z";
		const clientNowMs = Date.parse(serverIso) + 180_000;
		vi.spyOn(Date, "now").mockReturnValue(clientNowMs);

		const detailPayload: StudentQuizDetail = {
			assignmentId: "",
			title: "Reading Timed",
			due: "",
			dueAt: null,
			timeLimitSeconds: 1200,
			skill: "reading",
			part: "p1",
			type: "tfng",
			band: "7.0",
			intro: "",
			prompt: "",
			passage: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			questions: [],
			attempt: {
				id: "att-1",
				status: "in_progress",
				answers: {},
				startedAt: "2026-11-24T09:57:00.000Z",
			},
		};

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify(detailPayload), {
					status: 200,
					headers: {
						"Content-Type": "application/json",
						"X-Server-Now": serverIso,
					},
				}),
			),
		);

		const parsed = await fetchStudentQuizDetail({
			kind: "practice",
			testId: "test-1",
		});
		expect(parsed.timeLimitSeconds).toBe(1200);
		expect(getServerClockSkewMs()).toBe(180_000);
	});

	it("setQuizDetailMedia preserves existing dataUpdatedAt so Speaking media updates never drift timer cache metadata", async () => {
		const qc = new QueryClient();
		const source = { kind: "practice" as const, testId: "speak-1" };
		const { queryKey } = quizDetailQueryOptions(source);
		const initialUpdatedAt = 1_700_000_000_000;
		const initialDetail: StudentQuizDetail = {
			assignmentId: "",
			title: "Speaking Part 2",
			due: "",
			dueAt: null,
			timeLimitSeconds: 600,
			skill: "speaking",
			part: "part2",
			type: "cue",
			band: "7.0",
			intro: "",
			prompt: "",
			passage: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			questions: [],
			attempt: {
				id: "att-speak-1",
				status: "in_progress",
				answers: {},
				media: null,
				startedAt: "2026-11-24T10:00:00.000Z",
			},
		};
		qc.setQueryData(queryKey, initialDetail, { updatedAt: initialUpdatedAt });

		const uploadedMedia = {
			name: "answer.webm",
			type: "audio/webm",
			size: 12_345,
			uploadedAt: "2026-11-24T10:02:00.000Z",
		};
		await setQuizDetailMedia(qc, source, uploadedMedia);

		const state = qc.getQueryState<StudentQuizDetail>(queryKey);
		expect(state?.data?.attempt?.media).toEqual(uploadedMedia);
		expect(state?.dataUpdatedAt).toBe(initialUpdatedAt);
	});
});
