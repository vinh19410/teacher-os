import type { ClassType } from "@teacher-os/api/contracts";
import type { Scores, SyllabusLesson } from "./mock-data";

export type KernelAction =
	| { type: "check-in"; lessonId: string }
	| { type: "cancel-lesson"; lessonId: string }
	| {
			/** Scheduled-lesson edit (issue #56) — full-replace 5 fields, so the
			 * payload always carries all five (omitted optionals reset to "").
			 * Named "lesson-edit" because "edit-lesson" is the syllabus lesson. */
			type: "lesson-edit";
			lessonId: string;
			payload: {
				day: number;
				time: string;
				dur: number;
				topic: string;
				zoom: string;
			};
	  }
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
				type: ClassType;
				level: string;
				skills: string[];
				mode: string;
				templateId: string;
				schedule: { days: number[]; start: string; end: string };
				sessionsTotal: number;
				startDate: string;
			};
	  }
	| {
			type: "add-syllabus";
			payload: {
				id: string;
				name: string;
				type: ClassType;
				level: string;
				skills: string[];
				description: string;
				totalLessons: number;
			};
	  }
	| {
			/** Deep-copy a syllabus template into the class's own curriculum (issue #79). */
			type: "import-syllabus";
			classId: string;
			templateId: string;
	  }
	| {
			/** Delete the class's imported curriculum copy and null the pointer. */
			type: "remove-curriculum";
			classId: string;
	  }
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
			type: "delete-module";
			syllabusId: string;
			moduleId: string;
	  }
	| {
			type: "delete-lesson";
			syllabusId: string;
			moduleId: string;
			lessonId: string;
	  }
	| {
			type: "reorder-modules";
			syllabusId: string;
			moduleIds: string[];
	  }
	| {
			type: "reorder-lessons";
			syllabusId: string;
			moduleId: string;
			lessonIds: string[];
	  }
	| { type: "update-class-notes"; classId: string; notes: string };

/** Backwards-compatible name for data-store consumers. */
export type Action = KernelAction;
