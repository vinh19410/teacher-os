import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import { describe, expect, test } from "vitest";
import { audioFilename } from "./run-placement-grading";

describe("audioFilename", () => {
	test.each([
		"audio/aac",
		"audio/x-aac",
		"audio/aacp",
		"audio/adts",
		"audio/vnd.dlna.adts",
		"audio/x-hx-aac-adts",
		"AUDIO/AAC",
		"  audio/aac ; codecs=mp4a.40.2 ",
	])("ánh xạ %s sang speaking.aac", (mime) => {
		expect(audioFilename(mime)).toBe("speaking.aac");
	});

	test.each([
		["audio/webm", "speaking.webm"],
		["video/webm", "speaking.webm"],
		["audio/webm;codecs=opus", "speaking.webm"],
		["video/mp4", "speaking.mp4"],
		["video/mp4; codecs=avc1.42E01E", "speaking.mp4"],
		["audio/mp4", "speaking.m4a"],
		["audio/x-m4a", "speaking.m4a"],
		["audio/m4a", "speaking.m4a"],
		["audio/mp4a-latm", "speaking.m4a"],
		["audio/mpeg", "speaking.mp3"],
		["audio/mp3", "speaking.mp3"],
		["audio/x-mp3", "speaking.mp3"],
		["audio/x-mpeg", "speaking.mp3"],
		["audio/mpeg3", "speaking.mp3"],
		["audio/x-mpeg-3", "speaking.mp3"],
		["audio/ogg", "speaking.ogg"],
		["audio/ogg; codecs=opus", "speaking.ogg"],
		["audio/opus", "speaking.ogg"],
		["audio/x-opus+ogg", "speaking.ogg"],
		["audio/x-vorbis+ogg", "speaking.ogg"],
		["audio/x-speex+ogg", "speaking.ogg"],
		["video/ogg", "speaking.ogg"],
		["application/ogg", "speaking.ogg"],
		["audio/wav", "speaking.wav"],
		["audio/x-wav", "speaking.wav"],
		["audio/wave", "speaking.wav"],
		["audio/vnd.wave", "speaking.wav"],
	] as const)("ánh xạ %s sang %s", (mime, expected) => {
		expect(audioFilename(mime)).toBe(expected);
	});

	test("bao phủ toàn bộ LIBRARY_AUDIO_MIME không bỏ sót entry nào", () => {
		const expectedByLibraryMime: Record<string, string> = {
			"audio/mpeg": "speaking.mp3",
			"audio/mp4": "speaking.m4a",
			"audio/x-m4a": "speaking.m4a",
			"audio/aac": "speaking.aac",
			"audio/wav": "speaking.wav",
			"audio/x-wav": "speaking.wav",
			"audio/wave": "speaking.wav",
			"audio/webm": "speaking.webm",
			"audio/ogg": "speaking.ogg",
		};
		expect(Object.keys(LIBRARY_AUDIO_MIME).sort()).toEqual(
			Object.keys(expectedByLibraryMime).sort(),
		);
		for (const [mime, expected] of Object.entries(expectedByLibraryMime)) {
			expect(audioFilename(mime)).toBe(expected);
		}
	});

	test.each([
		"",
		"   ",
		"audio/flac",
		"application/octet-stream",
		"audio/x-mpegurl",
		"audio/wavpack",
		"text/html+aac",
		"audio/x-mp4-aac",
		"__proto__",
		"constructor",
		"toString",
	])(
		"fallback an toàn về speaking.webm cho MIME lạ hoặc nhiễu (%s)",
		(mime) => {
			expect(audioFilename(mime)).toBe("speaking.webm");
		},
	);
});
