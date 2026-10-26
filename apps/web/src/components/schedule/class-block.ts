import type { ClassColorIndex } from "@/lib/class-color";
import { classColorIndex } from "@/lib/class-color";

/**
 * Màu block ca học THEO LỚP (TOS-14, D2): hash ổn định `class.id` → 1..8,
 * token `--class-N` / `--class-N-soft`. Loại buổi (1:1, trial…) không còn
 * quyết định màu — nó thành badge nhỏ trong block.
 *
 * Class names PHẢI dạng chuỗi tĩnh để Tailwind quét được.
 */
const BLOCK_CLASSES: Record<ClassColorIndex, string> = {
	1: "border-l-class-1 bg-class-1-soft",
	2: "border-l-class-2 bg-class-2-soft",
	3: "border-l-class-3 bg-class-3-soft",
	4: "border-l-class-4 bg-class-4-soft",
	5: "border-l-class-5 bg-class-5-soft",
	6: "border-l-class-6 bg-class-6-soft",
	7: "border-l-class-7 bg-class-7-soft",
	8: "border-l-class-8 bg-class-8-soft",
};

const DOT_CLASSES: Record<ClassColorIndex, string> = {
	1: "bg-class-1",
	2: "bg-class-2",
	3: "bg-class-3",
	4: "bg-class-4",
	5: "bg-class-5",
	6: "bg-class-6",
	7: "bg-class-7",
	8: "bg-class-8",
};

export function classBlockClass(classId: string): string {
	return BLOCK_CLASSES[classColorIndex(classId)];
}

/** Chấm màu thuần (view Tháng ở 375px) — cùng hash với block. */
export function classDotClass(classId: string): string {
	return DOT_CLASSES[classColorIndex(classId)];
}
