import type {
	KernelEnrollmentRow,
	KernelSnapshot,
} from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import type { ClassGroup, KernelHydratedData } from "@/lib/mock-data";
import { classesByStudent, mapEnrollments } from "./enrollments";

function createClass(id: string, name: string): ClassGroup {
	return {
		id,
		name,
		level: "IELTS 6.5",
		type: "ielts",
		skills: ["Writing"],
		schedule: "T2-T4 18:00",
		startDate: "2026-09-01",
		status: "active",
		mode: "Online",
		syllabusId: "syl-1",
		studentIds: [],
		sessionsDone: 0,
		sessionsTotal: 24,
		tuitionFee: 200000,
		notes: "",
	};
}

describe("enrollments repo", () => {
	test("mapEnrollments returns snapshot enrollments", () => {
		const rawEnrollments: KernelEnrollmentRow[] = [
			{
				id: "en-1",
				classId: "cls-1",
				studentId: "st-1",
				createdAt: "2026-09-01T00:00:00.000Z",
			},
		];
		const snapshot = {
			enrollments: rawEnrollments,
		} as unknown as KernelSnapshot;

		expect(mapEnrollments(snapshot)).toBe(rawEnrollments);
	});

	describe("classesByStudent", () => {
		const cls1 = createClass("cls-1", "IELTS Reading 1");
		const cls2 = createClass("cls-2", "IELTS Writing 2");
		const cls3 = createClass("cls-3", "IELTS Speaking 3");

		const testData: Pick<KernelHydratedData, "classes" | "enrollments"> = {
			classes: [cls1, cls2, cls3],
			enrollments: [
				{
					id: "en-1",
					classId: "cls-1",
					studentId: "st-1",
					createdAt: "2026-09-01T00:00:00.000Z",
				},
				{
					id: "en-2",
					classId: "cls-2",
					studentId: "st-1",
					createdAt: "2026-09-02T00:00:00.000Z",
				},
				{
					id: "en-3",
					classId: "cls-2",
					studentId: "st-2",
					createdAt: "2026-09-02T00:00:00.000Z",
				},
				{
					id: "en-orphan",
					classId: "cls-non-existent",
					studentId: "st-orphan",
					createdAt: "2026-09-03T00:00:00.000Z",
				},
			],
		};

		test("student thuộc 1 lớp → trả đúng lớp đó", () => {
			const result = classesByStudent(testData, "st-2");
			expect(result).toEqual([cls2]);
		});

		test("student thuộc nhiều lớp → đủ và giữ thứ tự của data.classes", () => {
			const result = classesByStudent(testData, "st-1");
			expect(result).toEqual([cls1, cls2]);
		});

		test("student không enrollment → mảng rỗng", () => {
			const result = classesByStudent(testData, "st-no-enrollment");
			expect(result).toEqual([]);
		});

		test("enrollment trỏ classId không tồn tại → bị bỏ qua", () => {
			const result = classesByStudent(testData, "st-orphan");
			expect(result).toEqual([]);
		});
	});
});
