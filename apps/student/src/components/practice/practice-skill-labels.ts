import type { PracticeSkill } from "@teacher-os/api/contracts";

/** Nhãn kỹ năng tự luyện dùng chung giữa catalog và màn giới thiệu (thuần hằng số, không kéo env/repo). */
export const PRACTICE_SKILL_LABELS: Record<PracticeSkill, string> = {
	reading: "Reading",
	listening: "Listening",
	writing: "Writing",
	speaking: "Speaking",
};
