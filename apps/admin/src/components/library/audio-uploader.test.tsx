// @vitest-environment jsdom
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AudioUploader, audioRejectMessage } from "./audio-uploader";

const audio = {
	name: "section-1.mp3",
	type: "audio/mpeg",
	size: 10 * 1024 * 1024,
	uploadedAt: "2026-10-02T00:00:00.000Z",
};

function renderUploader(props: Partial<Parameters<typeof AudioUploader>[0]>) {
	return renderToStaticMarkup(
		<AudioUploader
			testId="t1"
			slot="s1"
			audio={null}
			locked={false}
			onChanged={vi.fn()}
			{...props}
		/>,
	);
}

describe("audioRejectMessage", () => {
	it("MIME ngoài allowlist → nhắc các định dạng được nhận", () => {
		const message = audioRejectMessage(
			new File(["x"], "clip.mp4", { type: "video/mp4" }),
		);
		expect(message).toMatch(/không hỗ trợ/);
		expect(message).toMatch(/MP3/);
	});

	it("file quá 50MB → nhắc nén", () => {
		const file = new File([new Uint8Array(2)], "big.wav", {
			type: "audio/wav",
		});
		Object.defineProperty(file, "size", { value: 51 * 1024 * 1024 });
		expect(audioRejectMessage(file)).toMatch(/nén/);
	});

	it("allowlist không chứa video", () => {
		expect("video/mp4" in LIBRARY_AUDIO_MIME).toBe(false);
		expect("audio/mpeg" in LIBRARY_AUDIO_MIME).toBe(true);
	});

	it("chặn đuôi lệch payload.html, MIME nguy hiểm text/html, file 0 byte; nhận .m4a rỗng và .webm (#681)", () => {
		expect(
			audioRejectMessage(
				new File(["x"], "payload.html", { type: "audio/mpeg" }),
			),
		).toMatch(/không hỗ trợ/);
		expect(
			audioRejectMessage(
				new File(["x"], "section-1.mp3", { type: "text/html" }),
			),
		).toMatch(/không hỗ trợ/);
		expect(
			audioRejectMessage(new File([""], "empty.mp3", { type: "audio/mpeg" })),
		).toMatch(/rỗng/);
		expect(
			audioRejectMessage(new File(["x"], "section-1.m4a", { type: "" })),
		).toBe("File không hợp lệ.");
		expect(
			audioRejectMessage(
				new File(["x"], "section-1.webm", { type: "video/webm" }),
			),
		).toBe("File không hợp lệ.");
	});
});

describe("AudioUploader (render tĩnh)", () => {
	it("chưa có audio → dropzone với hướng dẫn tiếng Việt", () => {
		const html = renderUploader({});
		expect(html).toContain("library-audio-dropzone");
		expect(html).toContain("Kéo thả file audio vào đây");
		expect(html).toContain("MP3, M4A, WAV, AAC, OGG, WEBM");
		expect(html).toContain("tối đa");
		expect(html).not.toContain("Đề đã xuất bản");
	});

	it("locked (đề ready) → khóa vùng tải kèm giải thích", () => {
		const html = renderUploader({ locked: true });
		expect(html).toContain("aria-disabled");
		expect(html).toContain("hãy hạ về nháp để tải audio");
	});

	it("đã có audio → tên, dung lượng, trình phát và nút thay/xóa", () => {
		const html = renderUploader({ audio });
		expect(html).toContain("section-1.mp3");
		expect(html).toContain("10 MB");
		expect(html).toContain("<audio");
		expect(html).toContain("Thay file");
		expect(html).toContain("Xóa audio");
		expect(html).toContain("/api/admin/library/tests/t1/parts/s1/audio");
	});

	it("đã có audio + locked → nút thay/xóa khóa kèm lý do", () => {
		const html = renderUploader({ audio, locked: true });
		expect(html).toContain("hãy hạ về nháp để thay audio");
		expect(html).toContain("hãy hạ về nháp để xóa audio");
		expect((html.match(/disabled/g) ?? []).length).toBeGreaterThanOrEqual(2);
	});
});
