/**
 * Syllabus read repo (Wave 2) — pure mapping units.
 * The kernel snapshot is the only input; the provider wires transport.
 */
import type {
	KernelSnapshot,
	KernelSyllabusLessonRow,
} from "@teacher-os/api/contracts";
import { describe, expect, test } from "vitest";
import type { ClassCurriculum, SyllabusTemplate } from "@/lib/mock-data";
import { isCurriculumOutOfSync, mapSyllabi } from "./syllabus";

const snapshot: KernelSnapshot = {
	assignmentPrompts: [],
	classAssignments: [],
	assignmentTests: [],
	vocabDecks: [],
	students: [],
	classes: [],
	syllabi: [
		{
			id: "sy-1",
			name: "IELTS Writing",
			level: "Band 7.0",
			type: "ielts",
			classId: null,
			sourceTemplateId: null,
			skills: ["Writing"],
			description: "Giáo trình viết",
			totalLessons: 99, // stored form value — must be ignored
			modules: [
				{
					id: "mod-1",
					title: "Task 1",
					description: "",
					lessons: [
						{
							id: "les-1",
							title: "Line chart",
							objectives: "",
							materials: "Cam 15",
							kind: "lesson",
							status: "done",
						},
						{
							id: "les-2",
							title: "Map",
							objectives: "so sánh vị trí",
							materials: "",
							kind: "midterm",
							status: "current",
						},
					],
				},
				{
					id: "mod-2",
					title: "Task 2",
					description: "Essay",
					lessons: [],
				},
			],
		},
	],
	enrollments: [],
	packages: [],
	lessons: [],
	assignments: [],
	invoices: [],
	reports: [],
	notifs: [],
	commentBank: [],
};

describe("mapSyllabi", () => {
	const syllabi = mapSyllabi(snapshot);

	test("totalLessons recomputes from the tree, ignoring the stored value", () => {
		expect(syllabi[0]?.totalLessons).toBe(2);
	});

	test("maps type and skills from the kernel row", () => {
		expect(syllabi[0]?.type).toBe("ielts");
		expect(syllabi[0]?.skills).toEqual(["Writing"]);
	});

	test("empty module description maps to undefined like the seed shape", () => {
		expect(syllabi[0]?.modules[0]?.description).toBeUndefined();
		expect(syllabi[0]?.modules[1]?.description).toBe("Essay");
	});

	test("empty objectives/materials map to the em-dash placeholder", () => {
		const first = syllabi[0]?.modules[0]?.lessons[0];
		expect(first?.objectives).toBe("—");
		expect(first?.materials).toBe("Cam 15");
		const second = syllabi[0]?.modules[0]?.lessons[1];
		expect(second?.objectives).toBe("so sánh vị trí");
		expect(second?.materials).toBe("—");
	});

	test("classId/sourceTemplateId pass through (template vs copy)", () => {
		expect(syllabi[0]?.classId).toBeNull();
		expect(syllabi[0]?.sourceTemplateId).toBeNull();
		const template = snapshot.syllabi[0];
		const sparse: KernelSnapshot = {
			...snapshot,
			syllabi: [
				{
					...template,
					id: "sy-copy",
					classId: "cl-9",
					sourceTemplateId: "sy-1",
				},
			],
		};
		const mapped = mapSyllabi(sparse);
		expect(mapped[0]?.classId).toBe("cl-9");
		expect(mapped[0]?.sourceTemplateId).toBe("sy-1");
	});

	test("status keeps the lesson trio", () => {
		const statuses = syllabi[0]?.modules[0]?.lessons.map((l) => l.status);
		expect(statuses).toEqual(["done", "current"]);
	});

	test("kind passes through (issue #154)", () => {
		const kinds = syllabi[0]?.modules[0]?.lessons.map((l) => l.kind);
		expect(kinds).toEqual(["lesson", "midterm"]);
	});

	// kind là required trên KernelSyllabusLessonRow; alias này làm kind thành
	// optional để mô phỏng version-skew (snapshot từ server cũ chưa có cột).
	type SkewLesson = Omit<KernelSyllabusLessonRow, "kind"> & { kind?: string };
	type SkewRow = Omit<KernelSnapshot["syllabi"][number], "modules"> & {
		modules: Array<
			Omit<KernelSnapshot["syllabi"][number]["modules"][number], "lessons"> & {
				lessons: SkewLesson[];
			}
		>;
	};

	test("unknown kind normalizes to lesson — snapshot cũ/khác version không crash", () => {
		const stale = structuredClone(snapshot.syllabi[0]) as unknown as SkewRow;
		const skewed = stale.modules[0]?.lessons[1];
		if (!skewed) throw new Error("setup failed");
		skewed.kind = "exam";
		const mapped = mapSyllabi({
			...snapshot,
			syllabi: [stale as unknown as KernelSnapshot["syllabi"][number]],
		});
		expect(mapped[0]?.modules[0]?.lessons[1]?.kind).toBe("lesson");
	});

	test("missing kind normalizes to lesson (version-skew defense)", () => {
		const stale = structuredClone(snapshot.syllabi[0]) as unknown as SkewRow;
		const skewed = stale.modules[0]?.lessons[0];
		if (!skewed) throw new Error("setup failed");
		delete skewed.kind;
		const mapped = mapSyllabi({
			...snapshot,
			syllabi: [stale as unknown as KernelSnapshot["syllabi"][number]],
		});
		expect(mapped[0]?.modules[0]?.lessons[0]?.kind).toBe("lesson");
	});

	test("syllabus with modules but zero lessons derives totalLessons 0", () => {
		const sparse: KernelSnapshot = {
			...snapshot,
			syllabi: [
				{
					id: "sy-empty",
					name: "Cây trống",
					level: "Band 6.0",
					type: "ielts",
					classId: null,
					sourceTemplateId: null,
					skills: ["Speaking"],
					description: "",
					totalLessons: 12, // stored lie — the derive wins
					modules: [
						{ id: "mod-e1", title: "Trống 1", description: "", lessons: [] },
						{ id: "mod-e2", title: "Trống 2", description: "", lessons: [] },
					],
				},
			],
		};
		expect(mapSyllabi(sparse)[0]?.totalLessons).toBe(0);
	});

	test("empty org maps to an empty list, never seed", () => {
		const empty: KernelSnapshot = {
			assignmentPrompts: [],
			classAssignments: [],
			assignmentTests: [],
			vocabDecks: [],
			students: [],
			classes: [],
			syllabi: [],
			enrollments: [],
			packages: [],
			lessons: [],
			assignments: [],
			invoices: [],
			reports: [],
			notifs: [],
			commentBank: [],
		};
		expect(mapSyllabi(empty)).toEqual([]);
	});
});

describe("isCurriculumOutOfSync", () => {
	const makeBankRef = (id: string) => ({
		id,
		title: `Material ${id}`,
		description: "",
		kind: "file" as const,
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 1024,
		originalName: `${id}.pdf`,
		position: 0,
	});

	const baseTemplate = (): SyllabusTemplate => ({
		id: "sy-tpl",
		name: "IELTS Writing 7.0",
		level: "Band 7.0",
		type: "ielts",
		classId: null,
		sourceTemplateId: null,
		skills: ["Writing", "Reading"],
		totalLessons: 2,
		description: "Giáo trình viết học thuật",
		modules: [
			{
				id: "m-tpl-1",
				title: "Module 1",
				description: undefined,
				lessons: [
					{
						id: "l-tpl-1",
						title: "Line chart",
						objectives: "—",
						materials: "Cam 15",
						bankMaterials: [makeBankRef("mat-1"), makeBankRef("mat-2")],
						kind: "lesson",
						status: "upcoming",
					},
					{
						id: "l-tpl-2",
						title: "Midterm",
						objectives: "Kiểm tra",
						materials: "—",
						kind: "midterm",
						status: "upcoming",
					},
				],
			},
		],
	});

	const matchingCopy = (): ClassCurriculum => ({
		id: "sy-copy",
		name: "IELTS Writing 7.0",
		level: "Band 7.0",
		type: "ielts",
		classId: "cl-1",
		sourceTemplateId: "sy-tpl",
		skills: ["Writing", "Reading"],
		totalLessons: 2,
		description: "Giáo trình viết học thuật",
		modules: [
			{
				id: "m-copy-1",
				title: "Module 1",
				description: "",
				lessons: [
					{
						id: "l-copy-1",
						title: "Line chart",
						objectives: "—",
						materials: "Cam 15",
						bankMaterials: [makeBankRef("mat-1"), makeBankRef("mat-2")],
						kind: "lesson",
						status: "done",
					},
					{
						id: "l-copy-2",
						title: "Midterm",
						objectives: "Kiểm tra",
						materials: "—",
						bankMaterials: [],
						kind: "midterm",
						status: "current",
					},
				],
			},
		],
	});

	test("returns false when tree matches despite different IDs, statuses, empty description, and empty bankMaterials", () => {
		expect(isCurriculumOutOfSync(matchingCopy(), baseTemplate())).toBe(false);
	});

	test("returns true when syllabus metadata (name, level, type, description, skills) differs", () => {
		const tpl = baseTemplate();
		expect(
			isCurriculumOutOfSync({ ...matchingCopy(), name: "New Name" }, tpl),
		).toBe(true);
		expect(
			isCurriculumOutOfSync({ ...matchingCopy(), level: "Band 7.5" }, tpl),
		).toBe(true);
		expect(
			isCurriculumOutOfSync({ ...matchingCopy(), type: "communication" }, tpl),
		).toBe(true);
		expect(
			isCurriculumOutOfSync({ ...matchingCopy(), description: "Khác" }, tpl),
		).toBe(true);
		expect(
			isCurriculumOutOfSync({ ...matchingCopy(), skills: ["Writing"] }, tpl),
		).toBe(true);
		expect(
			isCurriculumOutOfSync(
				{ ...matchingCopy(), skills: ["Reading", "Writing"] },
				tpl,
			),
		).toBe(true);
	});

	test("returns true when module count, title, description, or lesson count differs", () => {
		const tpl = baseTemplate();
		const extraMod = matchingCopy();
		extraMod.modules.push({ id: "m-2", title: "Module 2", lessons: [] });
		expect(isCurriculumOutOfSync(extraMod, tpl)).toBe(true);

		const renamedMod = matchingCopy();
		renamedMod.modules[0].title = "Module 1 updated";
		expect(isCurriculumOutOfSync(renamedMod, tpl)).toBe(true);

		const descMod = matchingCopy();
		descMod.modules[0].description = "Mô tả mới";
		expect(isCurriculumOutOfSync(descMod, tpl)).toBe(true);

		const fewerLessons = matchingCopy();
		fewerLessons.modules[0].lessons.pop();
		expect(isCurriculumOutOfSync(fewerLessons, tpl)).toBe(true);
	});

	test("returns true when lesson title, objectives, materials, kind, or bankMaterials differ", () => {
		const tpl = baseTemplate();

		const diffTitle = matchingCopy();
		diffTitle.modules[0].lessons[0].title = "Bar chart";
		expect(isCurriculumOutOfSync(diffTitle, tpl)).toBe(true);

		const diffObj = matchingCopy();
		diffObj.modules[0].lessons[0].objectives = "Phân tích biểu đồ";
		expect(isCurriculumOutOfSync(diffObj, tpl)).toBe(true);

		const diffMat = matchingCopy();
		diffMat.modules[0].lessons[0].materials = "Cam 18";
		expect(isCurriculumOutOfSync(diffMat, tpl)).toBe(true);

		const diffKind = matchingCopy();
		diffKind.modules[0].lessons[1].kind = "final";
		expect(isCurriculumOutOfSync(diffKind, tpl)).toBe(true);

		const reorderedBank = matchingCopy();
		reorderedBank.modules[0].lessons[0].bankMaterials = [
			makeBankRef("mat-2"),
			makeBankRef("mat-1"),
		];
		expect(isCurriculumOutOfSync(reorderedBank, tpl)).toBe(true);

		const missingBank = matchingCopy();
		missingBank.modules[0].lessons[0].bankMaterials = [makeBankRef("mat-1")];
		expect(isCurriculumOutOfSync(missingBank, tpl)).toBe(true);
	});
});
