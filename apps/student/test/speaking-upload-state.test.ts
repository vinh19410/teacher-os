import { describe, expect, it } from "vitest";
import {
	progressState,
	rejectMessage,
	SPEAKING_FORMAT_LABELS,
	speakingPartGuide,
	uploadFailure,
} from "@/components/quiz/speaking-upload-state";
import { HttpError } from "@/lib/query-client";

const file = new File(["x"], "part2.m4a", { type: "audio/mp4" });

describe("progressState — thanh tiến trình upload bài nói (#305)", () => {
	it("dưới 100% là uploading với phần trăm", () => {
		expect(progressState(file, "audio/mp4", 0.5)).toEqual({
			kind: "uploading",
			file,
			type: "audio/mp4",
			progress: 0.5,
		});
	});

	it("byte cuối đã gửi → processing (ẩn nút Hủy vì server có thể đang commit)", () => {
		expect(progressState(file, "audio/mp4", 1)).toEqual({
			kind: "processing",
			file,
			type: "audio/mp4",
		});
	});
});

describe("uploadFailure — lỗi upload → thông điệp + hành động", () => {
	it("413/415 hiện lỗi, cho thử lại", () => {
		expect(uploadFailure(new HttpError(413, "x"))).toEqual({
			action: "show",
			message: "File vượt quá 50 MB.",
			refetch: false,
		});
		expect(uploadFailure(new HttpError(415, "x"))).toMatchObject({
			action: "show",
			message: "Định dạng không hỗ trợ.",
		});
	});

	it("lỗi mạng: hiện lỗi và refetch vì server có thể đã commit", () => {
		expect(uploadFailure(new HttpError(0, "x"))).toEqual({
			action: "show",
			message: "Không tải lên được — kiểm tra kết nối.",
			refetch: true,
		});
	});

	it("409 MEDIA_CONFLICT: thông báo + refetch, về dropzone", () => {
		expect(
			uploadFailure(new HttpError(409, "x", { code: "MEDIA_CONFLICT" })),
		).toEqual({
			action: "notice",
			message: "File vừa được thay ở tab khác — đã tải lại.",
			refetch: true,
		});
	});

	it("409 ATTEMPT_SUBMITTED → summary; 401 → đăng nhập lại", () => {
		expect(
			uploadFailure(new HttpError(409, "x", { code: "ATTEMPT_SUBMITTED" })),
		).toEqual({ action: "submitted" });
		expect(uploadFailure(new HttpError(401, "x"))).toEqual({
			action: "reauth",
		});
	});

	it("hủy upload → về dropzone và refetch", () => {
		expect(
			uploadFailure(new DOMException("Upload aborted", "AbortError")),
		).toEqual({ action: "cancelled" });
	});

	it("lỗi khác → thông điệp chung", () => {
		expect(uploadFailure(new HttpError(500, "x"))).toMatchObject({
			action: "show",
			message: "Không tải lên được file. Vui lòng thử lại.",
		});
	});
});

describe("rejectMessage — từ chối ngay ở client", () => {
	it("định dạng, dung lượng, file rỗng, nhiều file", () => {
		expect(rejectMessage("type")).toBe(
			"Định dạng không hỗ trợ. Hãy chọn file MP3, M4A, AAC, WAV, WEBM, OGG, MP4 hoặc MOV.",
		);
		const big = new File(["x"], "big.mp4");
		Object.defineProperty(big, "size", { value: 60 * 1024 * 1024 });
		expect(rejectMessage("size", big)).toBe(
			"File 60 MB vượt quá 50 MB. Hãy cắt ngắn hoặc quay lại ở 720p.",
		);
		expect(rejectMessage("empty")).toBe("File rỗng. Hãy chọn file khác.");
		expect(rejectMessage("multiple")).toBe("Chỉ tải lên 1 file.");
	});
});

describe("hướng dẫn làm bài theo part", () => {
	it("part chuẩn có câu hướng dẫn, part lạ thì không", () => {
		expect(speakingPartGuide("part1")).toContain("20–30 giây");
		expect(speakingPartGuide("part2")).toContain("1 phút chuẩn bị");
		expect(speakingPartGuide("part3")).toContain("30–60 giây");
		expect(speakingPartGuide("custom")).toBeNull();
	});

	it("nhãn định dạng bỏ trùng theo thứ tự allowlist", () => {
		expect(SPEAKING_FORMAT_LABELS).toBe(
			"MP3, M4A, AAC, WAV, WEBM, OGG, MP4, MOV",
		);
	});
});
