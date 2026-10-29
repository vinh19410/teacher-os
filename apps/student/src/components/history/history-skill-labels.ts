import type { HistorySkill } from "@teacher-os/api/contracts";

/** Nhãn kỹ năng trên trang Lịch sử — 4 skill giữ tên tiếng Anh như catalog
 * luyện tập, Từ vựng là tiếng Việt (design-v2 COLS). */
export const HISTORY_SKILL_LABELS: Record<HistorySkill, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
	vocabulary: "Từ vựng",
};
