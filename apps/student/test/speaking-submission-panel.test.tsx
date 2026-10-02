import type { QuizAttemptMedia } from "@teacher-os/api/contracts";
import { QuizSpeakingFooter } from "@teacher-os/ui/components/quiz/quiz-speaking-footer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	SpeakingGuideCard,
	SpeakingSubmissionView,
} from "@/components/quiz/speaking-submission-panel";
import type { SpeakingUploadState } from "@/components/quiz/speaking-upload-state";

const noop = () => undefined;
const file = new File([new Uint8Array(1024)], "part2.m4a", {
	type: "audio/mp4",
});
const media: QuizAttemptMedia = {
	name: "part2.m4a",
	type: "audio/mp4",
	size: 13_002_342,
	uploadedAt: "2026-10-02T05:40:00.000Z",
};

function renderView(
	state: SpeakingUploadState,
	overrides: { media?: QuizAttemptMedia | null; notice?: string | null } = {},
) {
	return renderToStaticMarkup(
		<SpeakingSubmissionView
			attemptId="attempt-1"
			media={overrides.media ?? null}
			state={state}
			notice={overrides.notice ?? null}
			localUrl={null}
			disabled={false}
			onFile={noop}
			onReject={noop}
			onCancel={noop}
			onRetry={noop}
			onPickOther={noop}
			onReplace={noop}
			onDelete={noop}
		/>,
	);
}

describe("SpeakingGuideCard — hướng dẫn làm bài (#305)", () => {
	it("Part 2 có hướng dẫn chuẩn + cách nộp + định dạng", () => {
		const html = renderToStaticMarkup(<SpeakingGuideCard part="part2" />);
		expect(html).toContain("Hướng dẫn làm bài");
		expect(html).toContain("1 phút chuẩn bị");
		expect(html).toContain("<strong>1 file</strong>");
		expect(html).toContain("MP3, M4A, AAC, WAV, WEBM, OGG, MP4, MOV");
		expect(html).toContain("tối đa 50 MB");
	});

	it("part lạ không có dòng hướng dẫn chuẩn", () => {
		const html = renderToStaticMarkup(<SpeakingGuideCard part="custom" />);
		expect(html).not.toContain("1 phút chuẩn bị");
		expect(html).not.toContain("20–30 giây");
	});
});

describe("SpeakingSubmissionView — các trạng thái panel nộp bài", () => {
	it("chưa có file: dropzone kéo-thả có nhãn bàn phím", () => {
		const html = renderView({ kind: "idle" });
		expect(html).toContain("Bài nói của bạn");
		expect(html).toContain('role="button"');
		expect(html).toContain('aria-label="Kéo thả file vào đây hoặc chọn file"');
		expect(html).toContain("Audio hoặc video · tối đa 50 MB");
	});

	it("đang tải: tiến trình % và nút Hủy", () => {
		const html = renderView({
			kind: "uploading",
			file,
			type: "audio/mp4",
			progress: 0.5,
		});
		expect(html).toContain('role="progressbar"');
		expect(html).toContain('aria-valuenow="50"');
		expect(html).toContain("50% đã tải");
		expect(html).toContain("Hủy");
	});

	it("byte cuối đã gửi: đang xử lý, không còn nút Hủy", () => {
		const html = renderView({ kind: "processing", file, type: "audio/mp4" });
		expect(html).toContain("Đang xử lý…");
		expect(html).not.toContain(">Hủy<");
	});

	it("lỗi upload: thông điệp + Thử lại + Chọn file khác", () => {
		const html = renderView({
			kind: "error",
			file,
			type: "audio/mp4",
			message: "File vượt quá 50 MB.",
		});
		expect(html).toContain("File vượt quá 50 MB.");
		expect(html).toContain("Thử lại");
		expect(html).toContain("Chọn file khác");
	});

	it("đã có file: tên, dung lượng, Thay file, Xoá và nút nghe lại", () => {
		const html = renderView({ kind: "idle" }, { media });
		expect(html).toContain("part2.m4a");
		expect(html).toContain("12,4 MB");
		expect(html).toContain("Đã tải lên");
		expect(html).toContain("Thay file");
		expect(html).toContain("Xoá");
		expect(html).toContain("Nghe lại bài nói");
		expect(html).not.toContain('aria-label="Kéo thả file');
	});

	it("video đã tải: nút Xem lại", () => {
		const html = renderView(
			{ kind: "idle" },
			{ media: { ...media, name: "clip.mov", type: "video/quicktime" } },
		);
		expect(html).toContain("Xem lại bài nói");
	});

	it("thông báo từ chối hiện ở alert chung, file cũ vẫn giữ", () => {
		const html = renderView(
			{ kind: "idle" },
			{ media, notice: "Định dạng không hỗ trợ." },
		);
		expect(html).toContain('role="alert"');
		expect(html).toContain("Định dạng không hỗ trợ.");
		expect(html).toContain("part2.m4a");
	});
});

describe("QuizSpeakingFooter — giữ contract navigator-progress", () => {
	it("có testid cho helper e2e và trạng thái file", () => {
		expect(
			renderToStaticMarkup(<QuizSpeakingFooter hasMedia={false} />),
		).toContain('data-testid="navigator-progress"');
		expect(renderToStaticMarkup(<QuizSpeakingFooter hasMedia />)).toContain(
			"Đã tải file bài nói",
		);
	});
});
