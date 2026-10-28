import type { StudentAssignment } from "@teacher-os/api/contracts";
import { describe, expect, it } from "vitest";
import {
	calculateIeltsBand,
	deriveAssignmentStatus,
} from "@/lib/assignment-status";

describe("calculateIeltsBand rounding rules", () => {
	it("returns null when scores are missing", () => {
		expect(calculateIeltsBand(null)).toBeNull();
	});

	it("rounds exact whole and half numbers correctly", () => {
		expect(
			calculateIeltsBand({
				task: 6,
				coherence: 6,
				lexical: 6,
				grammar: 6,
			}),
		).toBe(6);
		expect(
			calculateIeltsBand({
				task: 6.5,
				coherence: 6.5,
				lexical: 6.5,
				grammar: 6.5,
			}),
		).toBe(6.5);
	});

	it("rounds .25 fractional part up to .5", () => {
		// mean = (6 + 6 + 6.5 + 6.5) / 4 = 6.25 -> 6.5
		expect(
			calculateIeltsBand({
				task: 6,
				coherence: 6,
				lexical: 6.5,
				grammar: 6.5,
			}),
		).toBe(6.5);
	});

	it("rounds .125 fractional part down to .0", () => {
		// mean = (6 + 6 + 6 + 6.5) / 4 = 6.125 -> 6.0
		expect(
			calculateIeltsBand({
				task: 6,
				coherence: 6,
				lexical: 6,
				grammar: 6.5,
			}),
		).toBe(6);
	});

	it("rounds .75 fractional part up to next whole band", () => {
		// mean = (6.5 + 6.5 + 7 + 7) / 4 = 6.75 -> 7.0
		expect(
			calculateIeltsBand({
				task: 6.5,
				coherence: 6.5,
				lexical: 7,
				grammar: 7,
			}),
		).toBe(7);
	});

	it("rounds .625 fractional part down to .5", () => {
		// mean = (6.5 + 6.5 + 6.5 + 7) / 4 = 6.625 -> 6.5
		expect(
			calculateIeltsBand({
				task: 6.5,
				coherence: 6.5,
				lexical: 6.5,
				grammar: 7,
			}),
		).toBe(6.5);
	});
});

describe("deriveAssignmentStatus", () => {
	const today = "2026-09-23";

	it("handles overdue assignment", () => {
		const asg: StudentAssignment = {
			id: "1",
			title: "Task 1",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-20",
			submittedAt: null,
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("overdue");
		expect(derived.statusLabel).toBe("Quá hạn");
		expect(derived.dueText).toBe("Hạn: 20/09 · quá 3 ngày");
		expect(derived.sortOrder).toBe(0);
	});

	it("handles due soon (today)", () => {
		const asg: StudentAssignment = {
			id: "2",
			title: "Task 2",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-23",
			submittedAt: null,
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("due-soon");
		expect(derived.statusLabel).toBe("Sắp đến hạn");
		expect(derived.dueText).toBe("Hạn: 23/09 · hôm nay");
		expect(derived.sortOrder).toBe(1);
	});

	it("handles due soon (in 2 days)", () => {
		const asg: StudentAssignment = {
			id: "3",
			title: "Task 3",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-25",
			submittedAt: null,
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("due-soon");
		expect(derived.dueText).toBe("Hạn: 25/09 · còn 2 ngày");
	});

	it("handles not submitted (in 10 days)", () => {
		const asg: StudentAssignment = {
			id: "4",
			title: "Task 4",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-10-03",
			submittedAt: null,
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("not-submitted");
		expect(derived.statusLabel).toBe("Chưa nộp");
		expect(derived.dueText).toBe("Hạn: 03/10 · còn 10 ngày");
	});

	it("handles empty due date (NEVER overdue)", () => {
		const asg: StudentAssignment = {
			id: "5",
			title: "Task 5",
			source: "grading",
			classId: null,
			className: null,
			due: "",
			submittedAt: null,
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("not-submitted");
		expect(derived.statusLabel).toBe("Chưa nộp");
		expect(derived.dueText).toBe("Không có hạn");
	});

	it("handles submitted assignment", () => {
		const asg: StudentAssignment = {
			id: "6",
			title: "Task 6",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-20",
			submittedAt: "2026-09-19T10:00",
			scores: null,
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("submitted");
		// TOS-30 #478: bài tự chấm (không skill) giữ nhãn ngắn.
		expect(derived.statusLabel).toBe("Đã nộp");
	});

	it("handles submitted writing assignment with teacher-grading label", () => {
		const asg = {
			id: "a-writing",
			title: "Writing Task 2",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-20",
			submittedAt: "2026-09-19T10:00",
			scores: null,
			// TOS-30 #478: Writing/Speaking chờ giáo viên chấm tay → nhãn dài.
			skill: "writing",
		} as const;
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("submitted");
		expect(derived.statusLabel).toBe("Đã nộp — Đang chờ giáo viên chấm");
	});

	it("handles graded assignment with band score", () => {
		const asg: StudentAssignment = {
			id: "7",
			title: "Task 7",
			source: "grading",
			classId: null,
			className: null,
			due: "2026-09-20",
			submittedAt: null,
			scores: { task: 6.5, coherence: 6.0, lexical: 6.5, grammar: 6.0 },
		};
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("graded");
		expect(derived.statusLabel).toBe("Điểm: 6.5");
		expect(derived.bandScore).toBe(6.5);
	});
});
