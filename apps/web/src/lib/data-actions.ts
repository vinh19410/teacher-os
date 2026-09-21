import type {
	AssignmentPromptCreate,
	ClassType,
	SyllabusModuleContent,
} from "@teacher-os/api/contracts";
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
	| {
			/** Whole-occurrence edit (#98): moveDate/time/dur/topic/zoom, >=1 field. */
			type: "session-edit";
			classId: string;
			date: string;
			payload: {
				moveDate?: string;
				time?: string;
				dur?: number;
				topic?: string;
				zoom?: string;
			};
	  }
	| { type: "session-check-in"; classId: string; date: string }
	| { type: "session-cancel"; classId: string; date: string }
	| { type: "mark-invoice-paid"; invoiceId: string; method: string }
	| { type: "grade-assignment"; assignmentId: string; scores: Scores }
	| { type: "add-comment-bank"; text: string; operationId: string }
	| {
			/** Assignment-prompt bank (#202): 8 fields — exactly the strict
			 * contract; the command bus posts them verbatim. */
			type: "create-assignment-prompt";
			payload: AssignmentPromptCreate;
	  }
	| {
			/** Giao đề ngân hàng cho lớp (#208) */
			type: "assign-class-prompt";
			payload: {
				classId: string;
				promptId: string;
				due: string;
				note?: string;
				studentIds: string[];
			};
	  }
	| {
			/** Weekly parent report (#173): "sent" requires content server-side;
			 * drafts persist as-is with an empty `sent` stamp. */
			type: "create-report";
			payload: {
				studentId: string;
				period: string;
				content: string;
				channel: string;
				status: "draft" | "sent";
			};
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
			/** Issue #122 — enroll an EXISTING student into a viewed class. */
			type: "enroll-student";
			classId: string;
			studentId: string;
			payload: {
				total: number;
				price: number;
				mode: "Online" | "Offline";
			};
	  }
	| {
			/** Issue #61 — create an invoice for an existing enrollment.
			 * `note` is optional: the wire body always carries it ("" default). */
			type: "add-invoice";
			payload: {
				enrollmentId: string;
				amount: number;
				due: string;
				note?: string;
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
				tuitionFee?: number | null;
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
				/** Bulk content from Excel/CSV import (issue #144); omitted = old flow. */
				modules?: SyllabusModuleContent[];
			};
	  }
	| {
			/** Ghi đè toàn bộ cây module/buổi học từ import Excel/CSV ở màn hình detail (issue #152). */
			type: "replace-syllabus-content";
			syllabusId: string;
			modules: SyllabusModuleContent[];
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
			/** Xóa một syllabus template (hard delete cây module/lesson). Các lớp
			 * đã import KHÔNG bị ảnh hưởng (giữ nguyên bản copy của mình); lớp mới
			 * không thể chọn template này nữa. */
			type: "delete-syllabus";
			syllabusId: string;
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
				// Form mở từ màn hình lớp không gửi kind/status — server/reducer
				// tự default (add) và preserve (edit).
				kind?: SyllabusLesson["kind"];
				status?: SyllabusLesson["status"];
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
				kind?: SyllabusLesson["kind"];
				status?: SyllabusLesson["status"];
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
	| { type: "update-class-notes"; classId: string; notes: string }
	| {
			type: "update-class-tuition-fee";
			payload: { classId: string; tuitionFee: number | null };
	  };

/** Backwards-compatible name for data-store consumers. */
export type Action = KernelAction;
