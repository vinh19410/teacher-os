/**
 * Client demo store. No authz. Not a payment control.
 * Delete or rewrite these tests when the mock is replaced by an API.
 */
import { describe, expect, test } from "vitest";
import { seedData } from "../../test/fixtures/mock-data";
import { reducer } from "./data-store-reducer";
import { averageBand } from "./mock-data";

function cloneSeed() {
	return structuredClone(seedData);
}

function unpaidDebt(state: typeof seedData, sid: string): number {
	return state.invoices
		.filter(
			(i) => i.sid === sid && (i.status === "overdue" || i.status === "unpaid"),
		)
		.reduce((sum, i) => sum + i.amount, 0);
}

function lessonCount(syllabus: (typeof seedData.syllabi)[number]): number {
	return syllabus.modules.reduce((sum, m) => sum + m.lessons.length, 0);
}

describe("reducer", () => {
	test("exports a function", () => {
		expect(typeof reducer).toBe("function");
	});

	test("check-in l3 (upcoming) flips the lesson and writes no counters anywhere (Wave 4 derive-only)", () => {
		const before = cloneSeed();
		const next = reducer(before, { type: "check-in", lessonId: "l3" });
		const nextL3 = next.lessons.find((l) => l.id === "l3");
		expect(nextL3?.status).toBe("completed");
		// Invariant 6/7: the fixture reducer writes the lesson row only —
		// pkg.done/remaining and class counters always derive downstream.
		expect(next.students).toEqual(before.students);
		expect(next.classes).toEqual(before.classes);
		expect(next.invoices).toEqual(before.invoices);
	});

	test("check-in l1 (completed) returns the same state reference", () => {
		const before = cloneSeed();
		const next = reducer(before, { type: "check-in", lessonId: "l1" });
		expect(next).toBe(before);
	});

	test("check-in unknown id returns the same state reference", () => {
		const before = cloneSeed();
		const next = reducer(before, { type: "check-in", lessonId: "l-missing" });
		expect(next).toBe(before);
	});

	test("check-in l9 (cancelled) returns the same state reference — matrix mirrors the server", () => {
		// The app path rejects cancelled→completed server-side with 409
		// (kernel.test.ts); the fixture reducer enforces the same matrix.
		const before = cloneSeed();
		const next = reducer(before, { type: "check-in", lessonId: "l9" });
		expect(next).toBe(before);
	});

	test("mark-invoice-paid INV-084 sets paid and drops s4 unpaid debt", () => {
		const before = cloneSeed();
		expect(unpaidDebt(before, "s4")).toBe(1_000_000);
		const next = reducer(before, {
			type: "mark-invoice-paid",
			invoiceId: "INV-084",
			method: "CK",
		});
		const inv = next.invoices.find((i) => i.id === "INV-084");
		expect(inv?.status).toBe("paid");
		expect(inv?.method).toBe("CK");
		expect(unpaidDebt(next, "s4")).toBe(0);
		expect(next.students.find((s) => s.id === "s4")?.tags).toContain(
			"nợ học phí",
		);
		const other = next.invoices.find((i) => i.id === "INV-086");
		const prevOther = before.invoices.find((i) => i.id === "INV-086");
		expect(other).toEqual(prevOther);
	});

	test("mark-invoice-paid unknown id deep-equals contents but is a new object", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "mark-invoice-paid",
			invoiceId: "INV-missing",
			method: "CK",
		});
		expect(next).not.toBe(before);
		expect(next.invoices).toEqual(before.invoices);
	});

	test("mark-invoice-paid on already-paid overwrites method (current behavior)", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "mark-invoice-paid",
			invoiceId: "INV-081",
			method: "MoMo",
		});
		expect(next.invoices.find((i) => i.id === "INV-081")?.method).toBe("MoMo");
	});

	test("grade-assignment a1 stores raw scores and graded status", () => {
		const scores = { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 };
		const next = reducer(cloneSeed(), {
			type: "grade-assignment",
			assignmentId: "a1",
			scores,
		});
		const a1 = next.assignments.find((a) => a.id === "a1");
		expect(a1?.status).toBe("graded");
		expect(a1?.scores).toEqual(scores);
		expect(averageBand(scores)).toBe(6.3);
	});

	test("add-syllabus keeps payload totalLessons and empty modules", () => {
		const payload = {
			id: "sy-test01",
			name: "Temp",
			level: "5.0",
			skill: "Writing",
			description: "x",
			totalLessons: 10,
		};
		const next = reducer(cloneSeed(), { type: "add-syllabus", payload });
		const created = next.syllabi.find((s) => s.id === "sy-test01");
		expect(created?.id).toBe(payload.id);
		expect(created?.modules).toEqual([]);
		expect(created?.totalLessons).toBe(10);
	});

	test("add-module on seed sy1 keeps totalLessons at 12", () => {
		const before = cloneSeed();
		const sy1 = before.syllabi.find((s) => s.id === "sy1");
		expect(sy1?.totalLessons).toBe(12);
		const next = reducer(before, {
			type: "add-module",
			syllabusId: "sy1",
			payload: { title: "Extra", description: "x" },
		});
		expect(next.syllabi.find((s) => s.id === "sy1")?.totalLessons).toBe(12);
	});

	test("add-module after create recomputes totalLessons to 0", () => {
		const created = reducer(cloneSeed(), {
			type: "add-syllabus",
			payload: {
				id: "sy-new",
				name: "N",
				level: "5.0",
				skill: "Writing",
				description: "x",
				totalLessons: 10,
			},
		});
		const next = reducer(created, {
			type: "add-module",
			syllabusId: "sy-new",
			payload: { title: "M", description: "x" },
		});
		expect(next.syllabi.find((s) => s.id === "sy-new")?.totalLessons).toBe(0);
	});

	test("add-lesson recomputes totalLessons as lesson count", () => {
		const before = cloneSeed();
		const sy1 = before.syllabi.find((s) => s.id === "sy1");
		const expected = (sy1 ? lessonCount(sy1) : 0) + 1;
		const next = reducer(before, {
			type: "add-lesson",
			syllabusId: "sy1",
			moduleId: "sy1-m1",
			payload: {
				title: "New lesson",
				objectives: "o",
				materials: "m",
				status: "upcoming",
			},
		});
		const after = next.syllabi.find((s) => s.id === "sy1");
		expect(after?.totalLessons).toBe(expected);
		expect(after ? lessonCount(after) : 0).toBe(expected);
	});

	test("edit-lesson keeps totalLessons equal to lesson count", () => {
		const before = cloneSeed();
		const total = before.syllabi.find((s) => s.id === "sy1")?.totalLessons;
		const next = reducer(before, {
			type: "edit-lesson",
			syllabusId: "sy1",
			moduleId: "sy1-m1",
			lessonId: "sy1-l1",
			payload: {
				title: "Renamed lesson",
				objectives: "o",
				materials: "m",
				status: "done",
			},
		});
		const after = next.syllabi.find((s) => s.id === "sy1");
		const renamed = after?.modules
			.flatMap((m) => m.lessons)
			.find((l) => l.id === "sy1-l1");
		expect(renamed?.title).toBe("Renamed lesson");
		expect(after?.totalLessons).toBe(total);
		expect(after ? lessonCount(after) : 0).toBe(total);
	});

	test("edit-module does not change totalLessons", () => {
		const before = cloneSeed();
		const total = before.syllabi.find((s) => s.id === "sy1")?.totalLessons;
		const next = reducer(before, {
			type: "edit-module",
			syllabusId: "sy1",
			moduleId: "sy1-m1",
			payload: { title: "Renamed", description: "d" },
		});
		expect(next.syllabi.find((s) => s.id === "sy1")?.totalLessons).toBe(total);
	});

	test("assign-syllabus sets class.syllabusId only", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "assign-syllabus",
			classId: "c1",
			syllabusId: "sy2",
		});
		expect(next.classes.find((c) => c.id === "c1")?.syllabusId).toBe("sy2");
		expect(next.syllabi).toEqual(before.syllabi);
	});

	test("cancel-lesson does not change package counts", () => {
		const before = cloneSeed();
		const next = reducer(before, { type: "cancel-lesson", lessonId: "l3" });
		expect(next.lessons.find((l) => l.id === "l3")?.status).toBe("cancelled");
		expect(next.students.map((s) => s.pkg)).toEqual(
			before.students.map((s) => s.pkg),
		);
	});

	const newStudentPayload = {
		name: "Test Student",
		phone: "0900",
		parentName: "P",
		total: 8,
		price: 100,
		mode: "Online" as const,
	};

	test("add-student appends with pkg.done 0 and s- id", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "add-student",
			payload: newStudentPayload,
		});
		expect(next.students.length).toBe(before.students.length + 1);
		const added = next.students[next.students.length - 1];
		expect(added.pkg.done).toBe(0);
		expect(added.pkg.remaining).toBe(8);
		expect(added.id).toMatch(/^s-/);
		expect(next.classes).toEqual(before.classes);
	});

	test("add-student with unknown classId leaves classes unchanged", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "add-student",
			payload: { ...newStudentPayload, classId: "c-missing" },
		});
		expect(next.students.length).toBe(before.students.length + 1);
		expect(next.classes).toEqual(before.classes);
	});

	test("add-student with empty classId leaves classes unchanged", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "add-student",
			payload: { ...newStudentPayload, classId: "" },
		});
		expect(next.students.length).toBe(before.students.length + 1);
		expect(next.classes).toEqual(before.classes);
	});

	test("add-student with classId enrolls only that class", () => {
		const before = cloneSeed();
		const beforeC1 = before.classes.find((c) => c.id === "c1");
		expect(beforeC1).toBeDefined();
		const next = reducer(before, {
			type: "add-student",
			payload: { ...newStudentPayload, classId: "c1" },
		});
		const added = next.students[next.students.length - 1];
		expect(added.id).toMatch(/^s-/);
		expect(next.classes.find((c) => c.id === "c1")).toEqual({
			...beforeC1,
			studentIds: [...(beforeC1?.studentIds ?? []), added.id],
		});
		expect(next.classes.filter((c) => c.id !== "c1")).toEqual(
			before.classes.filter((c) => c.id !== "c1"),
		);
	});

	test("add-class appends with sessionsDone 0, c- id, and JSON-string schedule", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "add-class",
			payload: {
				name: "New class",
				type: "ielts",
				level: "6.0",
				skills: ["Writing", "Speaking"],
				mode: "Online",
				syllabusId: "sy1",
				schedule: { days: [1, 3], start: "19:00", end: "20:30" },
				sessionsTotal: 10,
				startDate: "01/09",
			},
		});
		const added = next.classes[next.classes.length - 1];
		expect(next.classes.length).toBe(before.classes.length + 1);
		expect(added.sessionsDone).toBe(0);
		expect(added.id).toMatch(/^c-/);
		expect(added.type).toBe("ielts");
		expect(added.skills).toEqual(["Writing", "Speaking"]);
		expect(typeof added.schedule).toBe("string");
		expect(JSON.parse(added.schedule)).toEqual({
			days: [1, 3],
			start: "19:00",
			end: "20:30",
		});
	});

	test("add-class communication row stores an empty skills array", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "add-class",
			payload: {
				name: "Giao tiếp mới",
				type: "communication",
				level: "",
				skills: [],
				mode: "Online",
				syllabusId: "",
				schedule: { days: [2], start: "09:00", end: "10:30" },
				sessionsTotal: 10,
				startDate: "",
			},
		});
		const added = next.classes[next.classes.length - 1];
		expect(added.type).toBe("communication");
		expect(added.skills).toEqual([]);
	});

	test("update-class-notes changes only that class", () => {
		const before = cloneSeed();
		const next = reducer(before, {
			type: "update-class-notes",
			classId: "c1",
			notes: "updated",
		});
		expect(next.classes.find((c) => c.id === "c1")?.notes).toBe("updated");
		expect(next.classes.find((c) => c.id === "c2")?.notes).toBe(
			before.classes.find((c) => c.id === "c2")?.notes,
		);
	});
});
