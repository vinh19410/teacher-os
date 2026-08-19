import type { KernelAction } from "./data-actions";
import type {
	ClassGroup,
	MockData,
	Student,
	Syllabus,
	SyllabusModule,
} from "./mock-data";

function uid(prefix: string): string {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function recomputeTotalLessons(syllabus: Syllabus): void {
	syllabus.totalLessons = syllabus.modules.reduce(
		(sum, m) => sum + m.lessons.length,
		0,
	);
}

function mapSyllabus(
	s: Syllabus,
	syllabusId: string,
	fn: (sy: Syllabus) => Syllabus,
): Syllabus {
	return s.id === syllabusId ? fn(structuredClone(s)) : s;
}

function mapModule(
	m: SyllabusModule,
	moduleId: string,
	fn: (mod: SyllabusModule) => SyllabusModule,
): SyllabusModule {
	return m.id === moduleId ? fn(structuredClone(m)) : m;
}

/** Historical fixture reducer; runtime state lives in DataProvider. */
export function reducer(state: MockData, action: KernelAction): MockData {
	switch (action.type) {
		case "check-in": {
			const lesson = state.lessons.find((l) => l.id === action.lessonId);
			// Fixture-only path (app dispatches ride the kernel bus since Wave 4):
			// upcoming→completed mirrors the server matrix; pkg.done/remaining
			// always derive from completed lessons (invariant 6), never a write.
			if (lesson?.status !== "upcoming") return state;
			return {
				...state,
				lessons: state.lessons.map((l) =>
					l.id === action.lessonId ? { ...l, status: "completed" } : l,
				),
			};
		}
		case "cancel-lesson": {
			return {
				...state,
				lessons: state.lessons.map((l) =>
					l.id === action.lessonId ? { ...l, status: "cancelled" } : l,
				),
			};
		}
		case "mark-invoice-paid": {
			return {
				...state,
				invoices: state.invoices.map((inv) =>
					inv.id === action.invoiceId
						? { ...inv, status: "paid", method: action.method }
						: inv,
				),
			};
		}
		case "grade-assignment": {
			return {
				...state,
				assignments: state.assignments.map((a) =>
					a.id === action.assignmentId
						? { ...a, scores: action.scores, status: "graded" }
						: a,
				),
			};
		}
		case "add-comment-bank":
			// Runtime writes use the kernel bus; local reducer keeps fixture behavior inert.
			return state;
		case "add-student": {
			const { name, phone, parentName, total, price, mode, classId } =
				action.payload;
			const student: Student = {
				id: uid("s"),
				name,
				phone,
				zalo: phone.replace(/\s/g, ""),
				parent: { name: parentName, phone: "" },
				targetBand: "—",
				skills: [],
				examDate: "",
				pkg: {
					total,
					done: 0,
					remaining: total,
					price,
					mode,
					start: "19/08",
					expiry: "—",
				},
				tags: [],
				notes: "",
				avatar: name.substring(0, 2).toUpperCase(),
				atRisk: false,
			};
			const nextStudents = [...state.students, student];
			if (!classId) {
				return { ...state, students: nextStudents };
			}
			return {
				...state,
				students: nextStudents,
				classes: state.classes.map((c) => {
					if (c.id !== classId) return c;
					if (c.studentIds.includes(student.id)) return c;
					return { ...c, studentIds: [...c.studentIds, student.id] };
				}),
			};
		}
		case "add-class": {
			const cls: ClassGroup = {
				id: uid("c"),
				...action.payload,
				studentIds: [],
				sessionsDone: 0,
				status: "active",
				notes: "",
			};
			return { ...state, classes: [...state.classes, cls] };
		}
		case "add-syllabus": {
			const syllabus: Syllabus = {
				...action.payload,
				modules: [],
			};
			return { ...state, syllabi: [...state.syllabi, syllabus] };
		}
		case "assign-syllabus": {
			return {
				...state,
				classes: state.classes.map((c) =>
					c.id === action.classId ? { ...c, syllabusId: action.syllabusId } : c,
				),
			};
		}
		case "add-module": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = [
							...sy.modules,
							{
								id: uid("m"),
								title: action.payload.title,
								description: action.payload.description,
								lessons: [],
							},
						];
						recomputeTotalLessons(sy);
						return sy;
					}),
				),
			};
		}
		case "edit-module": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.map((m) =>
							m.id === action.moduleId
								? {
										...m,
										title: action.payload.title,
										description: action.payload.description,
									}
								: m,
						);
						return sy;
					}),
				),
			};
		}
		case "add-lesson": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.map((m) =>
							mapModule(m, action.moduleId, (mod) => {
								mod.lessons = [
									...mod.lessons,
									{
										id: uid("l"),
										title: action.payload.title,
										objectives: action.payload.objectives || "—",
										materials: action.payload.materials || "—",
										status: action.payload.status,
									},
								];
								return mod;
							}),
						);
						recomputeTotalLessons(sy);
						return sy;
					}),
				),
			};
		}
		case "edit-lesson": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.map((m) =>
							mapModule(m, action.moduleId, (mod) => {
								mod.lessons = mod.lessons.map((l) =>
									l.id === action.lessonId
										? {
												...l,
												title: action.payload.title,
												objectives: action.payload.objectives || "—",
												materials: action.payload.materials || "—",
												status: action.payload.status,
											}
										: l,
								);
								return mod;
							}),
						);
						recomputeTotalLessons(sy);
						return sy;
					}),
				),
			};
		}
		case "update-class-notes": {
			return {
				...state,
				classes: state.classes.map((c) =>
					c.id === action.classId ? { ...c, notes: action.notes } : c,
				),
			};
		}
		default:
			return state;
	}
}
