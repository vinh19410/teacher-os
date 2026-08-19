import type {
	ClassGroup,
	MockData,
	Scores,
	Student,
	Syllabus,
	SyllabusLesson,
	SyllabusModule,
} from "./mock-data";

function uid(prefix: string): string {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export type Action =
	| { type: "check-in"; lessonId: string }
	| { type: "cancel-lesson"; lessonId: string }
	| { type: "mark-invoice-paid"; invoiceId: string; method: string }
	| { type: "grade-assignment"; assignmentId: string; scores: Scores }
	| {
			type: "kernel-loaded";
			payload: Pick<MockData, "students" | "classes" | "syllabi" | "lessons">;
	  }
	| {
			type: "add-student";
			payload: {
				name: string;
				phone: string;
				parentName: string;
				total: number;
				price: number;
				mode: "Online" | "Offline";
				classId?: string;
			};
	  }
	| {
			type: "add-class";
			payload: {
				name: string;
				level: string;
				skill: string;
				mode: string;
				syllabusId: string;
				schedule: string;
				sessionsTotal: number;
				startDate: string;
			};
	  }
	| {
			type: "add-syllabus";
			payload: {
				id: string;
				name: string;
				level: string;
				skill: string;
				description: string;
				totalLessons: number;
			};
	  }
	| { type: "assign-syllabus"; classId: string; syllabusId: string }
	| {
			type: "add-module";
			syllabusId: string;
			payload: { title: string; description: string };
	  }
	| {
			type: "edit-module";
			syllabusId: string;
			moduleId: string;
			payload: { title: string; description: string };
	  }
	| {
			type: "add-lesson";
			syllabusId: string;
			moduleId: string;
			payload: {
				title: string;
				objectives: string;
				materials: string;
				status: SyllabusLesson["status"];
			};
	  }
	| {
			type: "edit-lesson";
			syllabusId: string;
			moduleId: string;
			lessonId: string;
			payload: {
				title: string;
				objectives: string;
				materials: string;
				status: SyllabusLesson["status"];
			};
	  }
	| {
			type: "update-class-notes";
			classId: string;
			notes: string;
	  };

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

/**
 * Runtime starts empty — the kernel snapshot hydrates via `kernel-loaded`
 * and seedData remains a test fixture only.
 */
export const emptyData: MockData = {
	students: [],
	lessons: [],
	invoices: [],
	assignments: [],
	reports: [],
	notifs: [],
	commentBank: [],
	classes: [],
	syllabi: [],
};

export function reducer(state: MockData, action: Action): MockData {
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
		case "kernel-loaded": {
			return { ...state, ...action.payload };
		}
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
