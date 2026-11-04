import {
	ASSIGNMENT_BANDS,
	type AssignmentBand,
} from "@teacher-os/api/contracts";

export * from "@teacher-os/ui/components/assignments/editor/assignment-presets";

/**
 * Trích xuất AssignmentBand từ thông tin trình độ lớp học (class.level).
 * Trả về null nếu không phải lớp IELTS hoặc chuỗi không chứa band IELTS hợp lệ.
 */
export function bandFromClassLevel(
	level: string | null | undefined,
	classType?: string,
): AssignmentBand | null {
	if (classType && classType !== "ielts") return null;
	if (!level || typeof level !== "string") return null;

	// Loại trừ các lớp TOEIC rõ ràng
	if (/toeic/i.test(level)) return null;

	const normalize = (val: string): AssignmentBand | null => {
		const num = val.includes(".") ? val : `${val}.0`;
		return (ASSIGNMENT_BANDS as readonly string[]).includes(num)
			? (num as AssignmentBand)
			: null;
	};

	// 1. Dải điểm (ví dụ: "IELTS 5.0–6.0", "5.5 - 6.5", "Band 6.5-7.5") -> lấy mốc mục tiêu (mốc sau)
	const rangeMatch = level.match(
		/(?:band|ielts)?\s*([4-9](?:\.[05])?)\s*[-–—]\s*([4-9](?:\.[05])?)\b(?!\d)/i,
	);
	if (rangeMatch) {
		const target = normalize(rangeMatch[2]);
		if (target) return target;
	}

	// 2. Chứa từ khóa rõ ràng "Band X.X" hoặc "IELTS X.X" (kèm "+" tuỳ chọn)
	const keywordMatch = level.match(
		/(?:band|ielts)\s*([4-9](?:\.[05])?)\+?\b(?!\d)/i,
	);
	if (keywordMatch) {
		const band = normalize(keywordMatch[1]);
		if (band) return band;
	}

	// 3. Nếu không có từ khóa "band/ielts", tránh số nhà, số phòng (3+ chữ số) hoặc số khối lớp ("Lớp 6", "Grade 7", "Khối 8")
	if (/\b\d{3,}\b/.test(level) || /\b(?:lớp|grade|khối)\s*\d+\b/i.test(level))
		return null;
	// 4. Số đơn lẻ có word boundary và trong dải điểm hợp lệ (ví dụ: "5.5", "6.0")
	const standaloneMatch = level.match(/\b([5-8](?:\.[05])?)\+?\b(?!\d)/);
	if (standaloneMatch) {
		const band = normalize(standaloneMatch[1]);
		if (band) return band;
	}

	return null;
}
