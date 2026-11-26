import { describe, expect, test } from "vitest";
import {
	classAssignmentCreateSchema,
	studentClassDetailSchema,
	studentSessionDetailResponseSchema,
} from "./contracts";
import { lessonMaterialLinkCreateSchema } from "./material-contracts";

describe("classAssignmentCreateSchema sessionDate", () => {
	test("accepts absent, null, or yyyy-mm-dd sessionDate", () => {
		const base = {
			promptId: "prompt-1",
			due: "2026-12-10",
			studentIds: ["stu-1"],
		};
		expect(classAssignmentCreateSchema.parse(base).sessionDate).toBeUndefined();
		expect(
			classAssignmentCreateSchema.parse({ ...base, sessionDate: null })
				.sessionDate,
		).toBeNull();
		expect(
			classAssignmentCreateSchema.parse({ ...base, sessionDate: "2026-12-01" })
				.sessionDate,
		).toBe("2026-12-01");
	});

	test("rejects malformed sessionDate", () => {
		const base = {
			promptId: "prompt-1",
			due: "2026-12-10",
			studentIds: ["stu-1"],
		};
		expect(
			classAssignmentCreateSchema.safeParse({
				...base,
				sessionDate: "01/12/2026",
			}).success,
		).toBe(false);
		expect(
			classAssignmentCreateSchema.safeParse({ ...base, sessionDate: "" })
				.success,
		).toBe(false);
	});
});

describe("studentClassDetailSchema & studentSessionDetailResponseSchema", () => {
	const baseClass = {
		id: "cls-1",
		name: "IELTS Intensive",
		level: "IELTS 6.5",
		mode: "Online",
		schedule: "T2 & T5 · 19:00–20:30",
		sessionsDone: 1,
		sessionsTotal: 8,
		status: "active" as const,
		nextSession: null,
		enrollmentId: "enr-1",
		enrollmentStatus: "active" as const,
		teacher: { name: "Thầy Minh", email: "minh@test.local", image: null },
		startDate: "2026-11-01",
	};

	test("stays backward-compatible with legacy payload lacking syllabus and counts", () => {
		const parsed = studentClassDetailSchema.parse({
			class: baseClass,
			lessons: [
				{
					id: "l-1",
					date: "2026-11-10",
					day: 2,
					time: "19:00",
					dur: 90,
					status: "completed",
					topic: "Task 2 Intro",
				},
			],
			assignments: [],
		});
		expect(parsed.syllabus).toBeUndefined();
		expect(parsed.lessons[0]?.lectureCount).toBeUndefined();
	});

	test("parses enriched class detail and session detail response", () => {
		const detail = studentClassDetailSchema.parse({
			class: baseClass,
			syllabus: {
				name: "IELTS Writing 6.5",
				description: "Lộ trình 8 buổi",
				modules: [{ id: "m-1", title: "Module 1", description: "" }],
			},
			lessons: [
				{
					id: "l-1",
					date: "2026-11-10",
					day: 2,
					time: "19:00",
					dur: 90,
					status: "completed",
					topic: "Task 2 Intro",
					moduleId: "m-1",
					moduleTitle: "Module 1",
					syllabusTitle: "Bài 1: Cấu trúc bài luận",
					objectives: "Nắm bố cục 4 đoạn",
					lessonKind: "lesson",
					lectureCount: 2,
					homeworkCount: 1,
					assignmentCount: 1,
				},
			],
			assignments: [
				{
					id: "ca-1",
					title: "Essay Practice 1",
					source: "class_assignment",
					classId: "cls-1",
					className: "IELTS Intensive",
					due: "2026-11-15",
					submittedAt: null,
					scores: null,
					sessionDate: "2026-11-10",
				},
			],
		});
		expect(detail.syllabus?.modules).toHaveLength(1);
		expect(detail.lessons[0]?.lectureCount).toBe(2);

		const sessionDetail = studentSessionDetailResponseSchema.parse({
			class: {
				id: "cls-1",
				name: "IELTS Intensive",
				level: "IELTS 6.5",
				mode: "Online",
				status: "active",
				teacher: { name: "Thầy Minh", email: "minh@test.local", image: null },
			},
			session: {
				id: "l-1",
				date: "2026-11-10",
				day: 2,
				time: "19:00",
				dur: 90,
				status: "completed",
				topic: "Task 2 Intro",
				sessionNumber: 1,
				totalTeachingSessions: 8,
			},
			curriculum: {
				syllabusName: "IELTS Writing 6.5",
				moduleId: "m-1",
				moduleTitle: "Module 1",
				title: "Bài 1: Cấu trúc bài luận",
				objectives: "Nắm bố cục 4 đoạn",
				kind: "lesson",
			},
			lectures: [
				{
					id: "mat-1",
					title: "Buổi 1 - Task 2 (tr. 1–12)",
					description: "",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 120_000,
					originalName: "buoi-1.pdf",
					position: 0,
					category: "lecture",
					sourceTitle: "IELTS Writing Book.pdf",
					sourcePageStart: 1,
					sourcePageEnd: 12,
				},
			],
			homeworkMaterials: [
				{
					id: "mat-2",
					title: "Worksheet buổi 1",
					description: "Nộp trước buổi sau",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 50_000,
					originalName: "worksheet-1.pdf",
					position: 1,
					category: "homework",
				},
			],
			assignments: detail.assignments,
			prevSessionDate: null,
			nextSessionDate: "2026-11-13",
		});
		expect(sessionDetail.lectures[0]?.sourcePageEnd).toBe(12);
		expect(sessionDetail.homeworkMaterials[0]?.category).toBe("homework");
		expect(sessionDetail.nextSessionDate).toBe("2026-11-13");
	});

	test("lessonMaterialLinkCreateSchema rejects control/bidi characters in title", () => {
		expect(
			lessonMaterialLinkCreateSchema.safeParse({
				title: "Bài tập\u202e buổi 1",
				url: "https://docs.google.com/document/d/123",
				category: "homework",
			}).success,
		).toBe(false);
		expect(
			lessonMaterialLinkCreateSchema.safeParse({
				title: "Bài tập buổi 1",
				url: "https://docs.google.com/document/d/123",
				category: "homework",
			}).success,
		).toBe(true);
	});
});
