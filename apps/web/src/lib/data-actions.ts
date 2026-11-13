import type {
	AssignmentPromptCreate,
	AssignmentPromptUpdate,
	AssignmentTestCreate,
	AssignmentTestPartsSet,
	AssignmentTestUpdate,
	ClassType,
	InvoicePaymentCreate,
	StudentCreateInput,
	SyllabusModuleContent,
} from "@teacher-os/api/contracts";
import type { Scores, SyllabusLesson } from "./mock-data";

/**
 * Phạm vi của một thao tác nội dung giáo trình (design D7, issue #394):
 * template dùng chung hoặc giáo trình riêng của một lớp. `repos/kernel.ts`
 * suy ra path từ target — caller không tự ghép path theo `classId`.
 */
export type CurriculumTarget =
	| { kind: "template"; syllabusId: string }
	| { kind: "class"; classId: string };

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
	| {
			type: "add-manual-session";
			classId: string;
			payload: {
				date: string;
				time: string;
				dur: number;
				topic: string;
				zoom?: string;
				/** #655 — tài liệu ngân hàng gắn ngay khi tạo buổi; chỉ gửi khi
				 * khác rỗng (server default [] khi thiếu key). */
				materialIds?: string[];
			};
	  }
	| {
			type: "delete-session-occurrence";
			classId: string;
			date: string;
	  }
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
				dueTime?: string;
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
			payload: StudentCreateInput;
	  }
	| {
			/** Issue #122 / #251 / #508 — enroll an EXISTING student into a viewed class.
			 * Package is derived by server from class attributes (D1 pattern). */
			type: "enroll-student";
			classId: string;
			studentId: string;
			activateNow?: boolean;
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
			/** #450 — manual tuition receipt on the debts ledger. The payload is
			 * the strict `InvoicePaymentCreate` contract posted verbatim; the
			 * server is idempotent on `payload.clientRequestId`. */
			type: "record-invoice-payment";
			invoiceId: string;
			payload: InvoicePaymentCreate;
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
				schedulingMode?: "auto" | "manual";
			};
	  }
	| {
			/** Cập nhật thông tin lớp học (#693); schedule/startDate/sessionsTotal omit khi lịch bị khóa hoặc giữ nguyên legacy. */
			type: "update-class";
			classId: string;
			payload: {
				name: string;
				type: ClassType;
				level: string;
				skills: string[];
				mode: string;
				tuitionFee?: number | null;
				schedule?: { days: number[]; start: string; end: string };
				startDate?: string;
				sessionsTotal?: number;
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
			type: "import-curriculum";
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
			target: CurriculumTarget;
			payload: { title: string; description: string };
	  }
	| {
			type: "edit-module";
			target: CurriculumTarget;
			moduleId: string;
			payload: { title: string; description: string };
	  }
	| {
			type: "add-lesson";
			target: CurriculumTarget;
			moduleId: string;
			payload: {
				title: string;
				objectives: string;
				materials: string;
				// Form mở từ màn hình lớp không gửi kind/status — server/reducer
				// tự default (add) và preserve (edit).
				kind?: SyllabusLesson["kind"];
				status?: SyllabusLesson["status"];
				/** #655 — tài liệu ngân hàng của bài; chỉ gửi khi khác rỗng
				 * (thiếu key = không gắn gì trên bài mới). */
				materialIds?: string[];
			};
	  }
	| {
			type: "edit-lesson";
			target: CurriculumTarget;
			moduleId: string;
			lessonId: string;
			payload: {
				title: string;
				objectives: string;
				materials: string;
				kind?: SyllabusLesson["kind"];
				status?: SyllabusLesson["status"];
				/** #655 — chỉ gửi khi người dùng TỤCH VÀO lựa chọn tài liệu;
				 * thiếu key = server giữ nguyên links hiện có của bài. */
				materialIds?: string[];
			};
	  }
	| {
			type: "delete-module";
			target: CurriculumTarget;
			moduleId: string;
	  }
	| {
			type: "delete-lesson";
			target: CurriculumTarget;
			moduleId: string;
			lessonId: string;
	  }
	| {
			type: "reorder-modules";
			target: CurriculumTarget;
			moduleIds: string[];
	  }
	| {
			type: "reorder-lessons";
			target: CurriculumTarget;
			moduleId: string;
			lessonIds: string[];
	  }
	| { type: "update-class-notes"; classId: string; notes: string }
	| {
			type: "update-class-tuition-fee";
			payload: { classId: string; tuitionFee: number | null };
	  }
	| { type: "activate-enrollment"; enrollmentId: string }
	| { type: "delete-enrollment"; enrollmentId: string }
	| {
			/** Full-test builder (phase-2): tạo full test mới (luôn draft) —
			 * parts ghép sau qua set-assignment-test-parts (replace-all). */
			type: "create-assignment-test";
			payload: AssignmentTestCreate;
	  }
	| {
			/** Meta/status update của test; skill immutable phía server. */
			type: "update-assignment-test";
			testId: string;
			payload: AssignmentTestUpdate;
	  }
	| { type: "delete-assignment-test"; testId: string }
	| {
			/** Replace TOÀN BỘ parts của test (PUT) — server chạy db.batch. */
			type: "set-assignment-test-parts";
			testId: string;
			parts: AssignmentTestPartsSet;
	  }
	| {
			/** Nút Apply (phase-5): sửa questions/title/note/status của prompt
			 * đã có — skill/part không patch được (legacy task/genre). */
			type: "update-assignment-prompt";
			promptId: string;
			payload: AssignmentPromptUpdate;
	  }
	| {
			/** Student Vocab SRS (#359, #363): tạo bộ từ vựng cho lớp hoặc độc lập (classId = null). */
			type: "create-vocab-deck";
			payload: { classId: string | null; title: string; lang?: string };
	  }
	| {
			/** Đổi tên (và ngôn ngữ) bộ từ vựng. */
			type: "rename-vocab-deck";
			payload: { deckId: string; title: string; lang?: string };
	  }
	| {
			/** Xoá bộ từ vựng (deck + words + cards trong 1 db.batch server-side). */
			type: "delete-vocab-deck";
			deckId: string;
	  }
	| {
			/** Tạo mới hoặc cập nhật một từ vựng trong deck (id optional). */
			type: "upsert-vocab-word";
			payload: {
				deckId: string;
				id?: string;
				word: string;
				ipa?: string | null;
				translation?: string;
				sortOrder?: number;
			};
	  }
	| {
			/** Xoá một từ vựng (cards của từ cũng bị xoá server-side). */
			type: "remove-vocab-word";
			wordId: string;
	  }
	| {
			/** Built-in Vocab Library (#361, #363): clone các bài từ thư viện về lớp hoặc hub (classId = null). */
			type: "clone-vocab-library-decks";
			payload: { classId: string | null; deckIds: string[] };
	  }
	| {
			/** Gợi ý bộ từ vựng cho học viên (#363, idempotent). */
			type: "suggest-vocab-deck";
			payload: {
				deckId: string;
				studentId: string;
				note?: string | null;
			};
	  }
	| {
			/** Thu hồi gợi ý bộ từ vựng (#363, soft flip dismissed). */
			type: "revoke-vocab-suggestion";
			suggestionId: string;
	  };

/** Backwards-compatible name for data-store consumers. */
export type Action = KernelAction;
