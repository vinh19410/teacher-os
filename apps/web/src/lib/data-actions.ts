import type { Scores, SyllabusLesson } from "./mock-data";

export type KernelAction =
	| { type: "check-in"; lessonId: string }
	| { type: "cancel-lesson"; lessonId: string }
	| { type: "mark-invoice-paid"; invoiceId: string; method: string }
	| { type: "grade-assignment"; assignmentId: string; scores: Scores }
	| { type: "add-comment-bank"; text: string; operationId: string }
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
	| { type: "update-class-notes"; classId: string; notes: string };

/** Backwards-compatible name for data-store consumers. */
export type Action = KernelAction;
