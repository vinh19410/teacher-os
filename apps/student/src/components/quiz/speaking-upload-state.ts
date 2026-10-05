import { QUIZ_MEDIA_TYPES } from "@teacher-os/api/contracts";
import {
	formatMediaSize,
	type QuizMediaRejectReason,
} from "@teacher-os/api/lib/quiz-media";
import { isHttpError } from "@/lib/query-client";

/**
 * Logic thuần của panel nộp bài Speaking (#305) — tách khỏi component để
 * test không cần DOM.
 */

export type SpeakingUploadState =
	| { kind: "idle" }
	| { kind: "uploading"; file: File; type: string; progress: number }
	| { kind: "processing"; file: File; type: string }
	| {
			kind: "error";
			file: File;
			type: string;
			message: string;
			/** false = thử lại cùng file chắc chắn lỗi (413/415/400). */
			retryable: boolean;
	  };

/** Byte cuối đã rời trình duyệt → `processing`: server có thể đang commit,
 * nên không còn cho Hủy (hủy lúc này vẫn có thể lưu file). */
export function progressState(
	file: File,
	type: string,
	fraction: number,
): SpeakingUploadState {
	return fraction >= 1
		? { kind: "processing", file, type }
		: { kind: "uploading", file, type, progress: fraction };
}

export type UploadFailure =
	| { action: "show"; message: string; refetch: boolean; retryable: boolean }
	| { action: "notice"; message: string; refetch: true }
	| { action: "submitted" }
	| { action: "reauth" }
	| { action: "cancelled" };

/** Lỗi upload → hành động của panel. */
export function uploadFailure(error: unknown): UploadFailure {
	if (error instanceof DOMException && error.name === "AbortError") {
		return { action: "cancelled" };
	}
	if (!isHttpError(error)) {
		return {
			action: "show",
			message: "Không tải lên được file. Vui lòng thử lại.",
			refetch: true,
			retryable: true,
		};
	}
	if (error.status === 401) return { action: "reauth" };
	if (error.status === 409 && error.code === "ATTEMPT_SUBMITTED") {
		return { action: "submitted" };
	}
	if (error.status === 409) {
		return {
			action: "notice",
			message: "File vừa được thay ở tab khác — đã tải lại.",
			refetch: true,
		};
	}
	if (error.status === 413) {
		return {
			action: "show",
			message: "File vượt quá 50 MB.",
			refetch: false,
			retryable: false,
		};
	}
	if (error.status === 415) {
		return {
			action: "show",
			message: "Định dạng không hỗ trợ.",
			refetch: false,
			retryable: false,
		};
	}
	if (error.status === 0) {
		return {
			action: "show",
			message: "Không tải lên được — kiểm tra kết nối.",
			refetch: true,
			retryable: true,
		};
	}
	// 400 (tên/kích thước file không hợp lệ) — thử lại cùng file vô ích.
	if (error.status === 400) {
		return {
			action: "show",
			message: "File không hợp lệ. Hãy chọn file khác.",
			refetch: false,
			retryable: false,
		};
	}
	return {
		action: "show",
		message: "Không tải lên được file. Vui lòng thử lại.",
		refetch: true,
		retryable: true,
	};
}

/** Nhãn định dạng hiển thị, bỏ trùng theo thứ tự allowlist. */
export const SPEAKING_FORMAT_LABELS = [
	...new Set(Object.values(QUIZ_MEDIA_TYPES)),
].join(", ");

const FORMAT_LIST_SENTENCE = (() => {
	const labels = [...new Set(Object.values(QUIZ_MEDIA_TYPES))];
	const last = labels.pop();
	return `${labels.join(", ")} hoặc ${last}`;
})();

export function rejectMessage(
	reason: QuizMediaRejectReason,
	file?: File,
): string {
	switch (reason) {
		case "type":
			return `Định dạng không hỗ trợ. Hãy chọn file ${FORMAT_LIST_SENTENCE}.`;
		case "size":
			return `File ${formatMediaSize(file?.size ?? 0)} vượt quá 50 MB. Hãy cắt ngắn hoặc quay lại ở 720p.`;
		case "empty":
			return "File rỗng. Hãy chọn file khác.";
		case "multiple":
			return "Chỉ tải lên 1 file.";
		case "none":
			return "Không đọc được file. Hãy kéo thả hoặc chọn 1 file audio/video.";
		case "name":
			return "Tên file quá dài hoặc không hợp lệ. Hãy đổi tên file (tối đa 200 ký tự) rồi chọn lại.";
	}
}

const PART_GUIDES: Readonly<Record<string, string>> = {
	part1: "Trả lời lần lượt từng câu hỏi, mỗi câu khoảng 20–30 giây.",
	part2: "Bạn có 1 phút chuẩn bị, sau đó nói liên tục 1–2 phút theo cue card.",
	part3: "Trả lời mỗi câu khoảng 30–60 giây, nêu lý do và ví dụ.",
};

/** Hướng dẫn chuẩn IELTS theo part; part lạ → null (không hiện dòng). */
export function speakingPartGuide(part: string): string | null {
	return PART_GUIDES[part] ?? null;
}
