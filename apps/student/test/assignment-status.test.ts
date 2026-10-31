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

	it("handles published speaking assignment (gradedAt, speaking scores shape)", () => {
		// TOS-30 #478: Speaking đã "Chốt trả bài" — grade_scores là bộ key
		// Speaking (không khớp IELTS Writing scores) → phải về "Đã chấm",
		// KHÔNG được dính nhãn chờ chấm.
		const asg = {
			id: "a-speaking",
			title: "Speaking Part 2",
			source: "class_assignment",
			classId: "c1",
			className: "Class A",
			due: "2026-09-20",
			submittedAt: "2026-09-19T10:00",
			scores: null,
			skill: "speaking",
			gradedAt: "2026-09-20T08:00:00.000Z",
		} as const;
		const derived = deriveAssignmentStatus(asg, today);
		expect(derived.status).toBe("graded");
		expect(derived.statusLabel).toBe("Đã chấm");
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

describe("deriveAssignmentStatus with dueAt (#526)", () => {
	const today = "2026-11-02";
	// 2026-11-02T17:00:00+07:00 = 2026-11-02T10:00:00.000Z
	const dueAtISO = "2026-11-02T10:00:00.000Z";

	it("shows due-soon before 17:00 (16:59:59 VN) on due day", () => {
		const asg = {
			id: "ssp-1",
			title: "Self Study Reading 1",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2026-11-02",
			dueAt: dueAtISO,
			submittedAt: null,
			scores: null,
			skill: "reading",
		} as StudentAssignment;
		const nowMs = Date.parse("2026-11-02T09:59:59.000Z");
		const derived = deriveAssignmentStatus(asg, today, nowMs);
		expect(derived.status).toBe("due-soon");
		expect(derived.statusLabel).toBe("Sắp đến hạn");
		expect(derived.dueText).toBe("Hạn: 17:00 02/11 · hôm nay");
		expect(derived.sortOrder).toBe(1);
	});

	it("shows overdue (Quá hạn) starting at exact 17:00:00 VN on the same day without 'quá 0 ngày'", () => {
		const asg = {
			id: "ssp-2",
			title: "Self Study Reading 2",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2026-11-02",
			dueAt: dueAtISO,
			submittedAt: null,
			scores: null,
			skill: "reading",
		} as StudentAssignment;
		const nowMs = Date.parse("2026-11-02T10:00:00.000Z");
		const derived = deriveAssignmentStatus(asg, today, nowMs);
		expect(derived.status).toBe("overdue");
		expect(derived.statusLabel).toBe("Quá hạn");
		expect(derived.dueText).toBe("Hạn: 17:00 02/11 · quá hạn");
		expect(derived.dueText).not.toContain("quá 0 ngày");
		expect(derived.sortOrder).toBe(0);
	});

	it("does not mark submission at exact 17:00:00 VN as late", () => {
		const readingAsg = {
			id: "ssp-3",
			title: "Self Study Reading 3",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2026-11-02",
			dueAt: dueAtISO,
			submittedAt: "2026-11-02T10:00:00.000Z",
			scores: null,
			skill: "reading",
		} as StudentAssignment;
		const derivedReading = deriveAssignmentStatus(readingAsg, today);
		expect(derivedReading.status).toBe("submitted");
		expect(derivedReading.isLate).toBe(false);
		expect(derivedReading.statusLabel).toBe("Đã nộp");
		expect(derivedReading.dueText).toBe("Hạn: 17:00 02/11");

		const writingAsg = {
			...readingAsg,
			id: "ssp-3w",
			skill: "writing",
		} as StudentAssignment;
		const derivedWriting = deriveAssignmentStatus(writingAsg, today);
		expect(derivedWriting.isLate).toBe(false);
		expect(derivedWriting.statusLabel).toBe("Đã nộp — Đang chờ giáo viên chấm");
	});

	it("marks submission after 17:00:00 VN (17:00:01 VN) as late", () => {
		const readingAsg = {
			id: "ssp-4",
			title: "Self Study Reading 4",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2026-11-02",
			dueAt: dueAtISO,
			submittedAt: "2026-11-02T10:00:01.000Z",
			scores: null,
			skill: "reading",
		} as StudentAssignment;
		const derivedReading = deriveAssignmentStatus(readingAsg, today);
		expect(derivedReading.status).toBe("submitted");
		expect(derivedReading.isLate).toBe(true);
		expect(derivedReading.statusLabel).toBe("Đã nộp · Trễ hạn");
		expect(derivedReading.badgeClass).toBe("bg-warn-soft text-warn");

		const writingAsg = {
			...readingAsg,
			id: "ssp-4w",
			skill: "writing",
		} as StudentAssignment;
		const derivedWriting = deriveAssignmentStatus(writingAsg, today);
		expect(derivedWriting.isLate).toBe(true);
		expect(derivedWriting.statusLabel).toBe(
			"Đã nộp trễ — Đang chờ giáo viên chấm",
		);
		expect(derivedWriting.badgeClass).toBe("bg-warn-soft text-warn");
	});

	it("preserves late indicator when graded after late submission", () => {
		const gradedAsg = {
			id: "ssp-5",
			title: "Self Study Writing 5",
			source: "class_assignment",
			classId: "c1",
			className: "IELTS 6.5",
			due: "2026-11-02",
			dueAt: dueAtISO,
			submittedAt: "2026-11-02T10:05:00.000Z",
			scores: { task: 7, coherence: 7, lexical: 7, grammar: 7 },
			skill: "writing",
			gradedAt: "2026-11-02T11:00:00.000Z",
		} as StudentAssignment;
		const derived = deriveAssignmentStatus(gradedAsg, today);
		expect(derived.status).toBe("graded");
		expect(derived.isLate).toBe(true);
		expect(derived.statusLabel).toBe("Điểm: 7 · Nộp trễ");
		expect(derived.dueText).toBe("Hạn: 17:00 02/11");
	});
});
