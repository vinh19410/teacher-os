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
		case "create-report":
		case "create-assignment-prompt":
		case "assign-class-prompt":
			return state;
		case "add-student": {
			const { name, phone, email, parentName, classId } = action.payload;
			const student: Student = {
				id: uid("s"),
				name,
				phone,
				email,
				hasPackage: false,
				zalo: phone,
				parent: { name: parentName, phone: "" },
				targetBand: "—",
				skills: [],
				examDate: "",
				pkg: {
					total: 0,
					done: 0,
					remaining: 0,
					price: 0,
					mode: "Online",
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
					if (c.invitedStudentIds.includes(student.id)) return c;
					return {
						...c,
						invitedStudentIds: [...c.invitedStudentIds, student.id],
					};
				}),
			};
		}
		case "enroll-student": {
			// Issue #122 / #251 / #253: attach an EXISTING student to class as invited.
			// No package fabricated — package is generated when accepted.
			const existing = state.students.find((s) => s.id === action.studentId);
			if (!existing) return state;
			let attached = false;
			const classes = state.classes.map((c) => {
				if (c.id !== action.classId) return c;
				if (
					c.studentIds.includes(existing.id) ||
					c.invitedStudentIds.includes(existing.id)
				)
					return c;
				attached = true;
				return {
					...c,
					invitedStudentIds: [...c.invitedStudentIds, existing.id],
				};
			});
			if (!attached) return state;
			return {
				...state,
				classes,
			};
		}
		case "add-class": {
			// Build the row explicitly: the payload's schedule is an object on
			// the wire, but ClassGroup.schedule stores the JSON string form.
			const cls: ClassGroup = {
				id: uid("c"),
				name: action.payload.name,
				level: action.payload.level,
				type: action.payload.type,
				skills: action.payload.type === "ielts" ? action.payload.skills : [],
				mode: action.payload.mode,
				syllabusId: action.payload.templateId || "",
				studentIds: [],
				invitedStudentIds: [],
				schedule: JSON.stringify({
					...action.payload.schedule,
					// Match the server's dedupe + sort before persist.
					days: [...new Set(action.payload.schedule.days)].sort(
						(a, b) => a - b,
					),
				}),
				sessionsDone: 0,
				sessionsTotal: action.payload.sessionsTotal,
				status: "active",
				startDate: action.payload.startDate,
				tuitionFee: action.payload.tuitionFee ?? null,
				notes: "",
			};
			return { ...state, classes: [...state.classes, cls] };
		}
		case "add-syllabus": {
			const syllabus: Syllabus = {
				id: action.payload.id,
				name: action.payload.name,
				type: action.payload.type,
				level: action.payload.level,
				skills: action.payload.skills,
				description: action.payload.description,
				totalLessons: action.payload.totalLessons,
				// Reducer is a dead fixture (kernel-runtime contract test): new
				// syllabi are always templates; copies only arrive via snapshot.
				classId: null,
				sourceTemplateId: null,
				modules: [],
			};
			return { ...state, syllabi: [...state.syllabi, syllabus] };
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
										// Mirror server: add không kind → default "lesson".
										kind: action.payload.kind ?? "lesson",
										// Mirror server: add không status → default "upcoming".
										status: action.payload.status ?? "upcoming",
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
												// Mirror server: edit không kind → giữ kind cũ.
												kind: action.payload.kind ?? l.kind,
												// Mirror server: edit không status → giữ status cũ
												// (không reset tiến độ của bản copy lớp).
												status: action.payload.status ?? l.status,
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
		case "delete-module": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.filter((m) => m.id !== action.moduleId);
						recomputeTotalLessons(sy);
						return sy;
					}),
				),
			};
		}
		case "delete-lesson": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.map((m) =>
							mapModule(m, action.moduleId, (mod) => {
								mod.lessons = mod.lessons.filter(
									(l) => l.id !== action.lessonId,
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
		case "reorder-modules": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						const byId = new Map(sy.modules.map((m) => [m.id, m]));
						sy.modules = action.moduleIds.flatMap((id) => {
							const mod = byId.get(id);
							return mod ? [mod] : [];
						});
						return sy;
					}),
				),
			};
		}
		case "reorder-lessons": {
			return {
				...state,
				syllabi: state.syllabi.map((s) =>
					mapSyllabus(s, action.syllabusId, (sy) => {
						sy.modules = sy.modules.map((m) =>
							mapModule(m, action.moduleId, (mod) => {
								const byId = new Map(mod.lessons.map((l) => [l.id, l]));
								mod.lessons = action.lessonIds.flatMap((id) => {
									const lesson = byId.get(id);
									return lesson ? [lesson] : [];
								});
								return mod;
							}),
						);
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
		case "update-class-tuition-fee": {
			return {
				...state,
				classes: state.classes.map((c) =>
					c.id === action.payload.classId
						? { ...c, tuitionFee: action.payload.tuitionFee }
						: c,
				),
			};
		}
		default:
			return state;
	}
}
