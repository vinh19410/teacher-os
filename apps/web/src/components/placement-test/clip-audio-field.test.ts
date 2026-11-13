// @vitest-environment jsdom
import { PLACEMENT_AUDIO_MAX_BYTES } from "@teacher-os/api/placement-test-contracts";
import { describe, expect, it } from "vitest";
import { PlacementHttpError } from "@/lib/repos/placement-test";
import {
	placementAudioErrorMessage,
	preparePlacementAudioFile,
} from "./clip-audio-field";

function fileOfSize(name: string, type: string, size: number): File {
	const file = new File(["x"], name, { type });
	Object.defineProperty(file, "size", { value: size });
	return file;
}

describe("preparePlacementAudioFile (#681)", () => {
	it("nhận .m4a MIME rỗng / video/mp4 và .webm video/webm từ ổ đĩa", () => {
		expect(
			preparePlacementAudioFile(fileOfSize("clip-1.m4a", "", 1024)),
		).toEqual({ ok: true, mimeType: "audio/mp4" });
		expect(
			preparePlacementAudioFile(fileOfSize("clip-1.m4a", "video/mp4", 1024)),
		).toEqual({ ok: true, mimeType: "audio/mp4" });
		expect(
			preparePlacementAudioFile(fileOfSize("clip-1.webm", "video/webm", 1024)),
		).toEqual({ ok: true, mimeType: "audio/webm" });
	});

	it("chặn đuôi lệch payload.html, MIME nguy hiểm text/html, file 0 B và vượt 20 MB", () => {
		expect(
			preparePlacementAudioFile(fileOfSize("payload.html", "audio/mpeg", 100)),
		).toEqual({
			ok: false,
			message: "Định dạng file âm thanh không được hỗ trợ.",
		});
		expect(
			preparePlacementAudioFile(fileOfSize("clip.mp3", "text/html", 100)),
		).toEqual({
			ok: false,
			message: "Định dạng file âm thanh không được hỗ trợ.",
		});
		expect(
			preparePlacementAudioFile(fileOfSize("empty.mp3", "audio/mpeg", 0)),
		).toEqual({
			ok: false,
			message: "File âm thanh rỗng.",
		});
		expect(
			preparePlacementAudioFile(
				fileOfSize("big.mp3", "audio/mpeg", PLACEMENT_AUDIO_MAX_BYTES + 1),
			),
		).toEqual({
			ok: false,
			message: "Dung lượng file âm thanh không được vượt quá 20 MB.",
		});
	});
});

describe("placementAudioErrorMessage (#681)", () => {
	it("ánh xạ mã lỗi server sang thông báo tiếng Việt thân thiện", () => {
		expect(
			placementAudioErrorMessage(
				new PlacementHttpError(415, "HTTP 415", {
					code: "UNSUPPORTED_AUDIO_TYPE",
				}),
			),
		).toMatch(/không được hỗ trợ/);
		expect(
			placementAudioErrorMessage(
				new PlacementHttpError(413, "HTTP 413", { code: "AUDIO_TOO_LARGE" }),
			),
		).toMatch(/20 MB/);
		expect(
			placementAudioErrorMessage(
				new PlacementHttpError(400, "HTTP 400", { code: "INVALID_AUDIO" }),
			),
		).toMatch(/không hợp lệ/);
	});
});
