import { z } from "zod";

/**
 * Kernel API contracts — Wave 0.
 * Writes are POST-only with JSON bodies; ids are assigned by the server.
 * Every request is org-scoped from the session membership (no tenant header).
 */

export const studentCreateSchema = z.object({
	name: z.string().min(1),
	phone: z.string().default(""),
	parentName: z.string().default(""),
	// Issue #115: a 0-session package is meaningless — min(1), while price
	// keeps min(0) because a free package is legitimate.
	total: z.number().int().min(1).default(10),
	price: z.number().int().min(0).default(400000),
	mode: z.enum(["Online", "Offline"]).default("Online"),
	classId: z.string().min(1).optional(),
});
export type StudentCreate = z.infer<typeof studentCreateSchema>;

/**
 * Issue #122 — enroll an EXISTING student into a class. Package fields mirror
 * studentCreateSchema defaults so an enrolled-existing student owns the same
 * active-package shape the create-new branch produces.
 */
export const enrollStudentSchema = z.object({
	studentId: z.string().min(1),
	total: z.number().int().min(1).default(10),
	price: z.number().int().min(0).default(400000),
	mode: z.enum(["Online", "Offline"]).default("Online"),
});
export type EnrollStudent = z.infer<typeof enrollStudentSchema>;

export const CLASS_TYPES = ["ielts", "communication"] as const;
export type ClassType = (typeof CLASS_TYPES)[number];

export const IELTS_SKILLS = [
	"Writing",
	"Speaking",
	"Reading",
	"Listening",
] as const;

/** Strict HH:MM (00:00–23:59) — shared by the contract and web parsing. */
export const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const classCreateSchema = z
	.object({
		name: z.string().min(1),
		type: z.enum(CLASS_TYPES).default("ielts"),
		level: z.string().default(""),
		skills: z
			.array(z.enum(IELTS_SKILLS))
			.max(IELTS_SKILLS.length)
			.refine((skills) => new Set(skills).size === skills.length)
			.default([]),
		mode: z.string().default("Online"),
		/** Template to import a per-class curriculum copy from; "" = empty class. */
		templateId: z.string().default(""),
		schedule: z.object({
			/** 0 = Monday … 6 = Sunday (dayNames index convention). */
			days: z
				.array(z.number().int().min(0).max(6))
				.min(1)
				.max(7)
				.refine((days) => new Set(days).size === days.length),
			start: z.string().regex(TIME_REGEX),
			end: z.string().regex(TIME_REGEX),
		}),
		/** Capped: each enrollment generates this many lesson rows in one D1 batch — an uncapped value could brick the class (no class-edit endpoint exists). */
		sessionsTotal: z.number().int().min(1).max(52).default(12),
		startDate: z.string().default(""),
	})
	.superRefine((input, ctx) => {
		// Issue #105: creation rejects end <= start. Legacy stored rows with
		// end < start still parse (parseStoredSchedule guards only start ===
		// end) — the cross-midnight duration math stays for display only.
		if (input.schedule.end <= input.schedule.start) {
			ctx.addIssue({
				code: "custom",
				path: ["schedule", "end"],
				message: "Giờ kết thúc phải sau giờ bắt đầu",
			});
		}
		if (input.type === "ielts" && input.skills.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Lớp IELTS cần ít nhất một kỹ năng",
			});
		}
		if (input.type === "communication" && input.skills.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Lớp Giao tiếp không chọn kỹ năng",
			});
		}
	});
export type ClassCreate = z.infer<typeof classCreateSchema>;

/** Import a deep copy of a syllabus template into a class (issue #79). */
export const importSyllabusSchema = z.object({
	templateId: z.string().min(1),
});
export type ImportSyllabus = z.infer<typeof importSyllabusSchema>;

/** Remove a class curriculum: deletes the imported copy tree, nulls the pointer. */
export const removeCurriculumSchema = z.object({}).strict();
export type RemoveCurriculum = z.infer<typeof removeCurriculumSchema>;
export const classNotesSchema = z.object({
	notes: z.string(),
});
export type ClassNotes = z.infer<typeof classNotesSchema>;

/**
 * Bulk content cho syllabus create (Excel/CSV import).
 * Mirror moduleUpsertSchema/lessonUpsertSchema + import-only caps
 * (server-side bound: client 2MB file cap không áp dụng cho caller trực tiếp).
 */
export const syllabusModuleContentSchema = z.object({
	title: z.string().min(1).max(500),
	description: z.string().max(10_000).default(""),
	lessons: z
		.array(
			z.object({
				title: z.string().min(1).max(500),
				objectives: z.string().max(10_000).default(""),
				materials: z.string().max(10_000).default(""),
				// Loại buổi (issue #154): default "lesson" — payload create/
				// replace luôn có kind, file import 4 cột v3 chạy như cũ.
				kind: z.enum(["lesson", "midterm", "final"]).default("lesson"),
				status: z.enum(["done", "current", "upcoming"]).default("upcoming"),
			}),
		)
		.default([]),
});
export type SyllabusModuleContent = z.infer<typeof syllabusModuleContentSchema>;

export const syllabusCreateSchema = z
	.object({
		name: z.string().min(1),
		type: z.enum(CLASS_TYPES).default("ielts"),
		level: z.string().default(""),
		skills: z
			.array(z.enum(IELTS_SKILLS))
			.max(IELTS_SKILLS.length)
			.refine((skills) => new Set(skills).size === skills.length)
			.default([]),
		description: z.string().default(""),
		totalLessons: z.number().int().min(0).default(0),
		modules: z.array(syllabusModuleContentSchema).optional(),
	})
	.superRefine((input, ctx) => {
		if (input.modules) {
			const nodes =
				input.modules.length +
				input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
			if (nodes > 500) {
				ctx.addIssue({
					code: "custom",
					path: ["modules"],
					message: "Tổng số module và buổi học vượt giới hạn 500",
				});
			}
		}
		if (input.type === "ielts" && input.skills.length === 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Syllabus IELTS cần ít nhất một kỹ năng",
			});
		}
		if (input.type === "communication" && input.skills.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["skills"],
				message: "Syllabus Giao tiếp không chọn kỹ năng",
			});
		}
	});
export type SyllabusCreate = z.infer<typeof syllabusCreateSchema>;

export const moduleUpsertSchema = z.object({
	title: z.string().min(1),
	description: z.string().default(""),
});
export type ModuleUpsert = z.infer<typeof moduleUpsertSchema>;

export const lessonUpsertSchema = z.object({
	title: z.string().min(1),
	objectives: z.string().default(""),
	materials: z.string().default(""),
	// Loại buổi (issue #154): optional như status — form mở từ màn hình lớp
	// không gửi kind; route edit preserve giá trị existing, route add default
	// "lesson" khi vắng.
	kind: z.enum(["lesson", "midterm", "final"]).optional(),
	// Optional: form thêm/sửa buổi học mở từ màn hình syllabus không gửi status.
	// Route edit preserve giá trị existing; route add default "upcoming" khi vắng.
	status: z.enum(["done", "current", "upcoming"]).optional(),
});
export type LessonUpsert = z.infer<typeof lessonUpsertSchema>;

export const moduleRemoveSchema = z.object({}).strict();
export type ModuleRemove = z.infer<typeof moduleRemoveSchema>;
export const lessonRemoveSchema = z.object({}).strict();
export type LessonRemove = z.infer<typeof lessonRemoveSchema>;

/** Cap matches MAX_IMPORT_NODES — one D1 batch of UPDATEs. */
export const reorderModulesSchema = z
	.object({
		moduleIds: z.array(z.string().min(1)).min(1).max(500),
	})
	.strict();
export type ReorderModules = z.infer<typeof reorderModulesSchema>;
export const reorderLessonsSchema = z
	.object({
		lessonIds: z.array(z.string().min(1)).min(1).max(500),
	})
	.strict();
export type ReorderLessons = z.infer<typeof reorderLessonsSchema>;

/** Bulk replace nội dung syllabus (import ghi đè ở màn hình detail). */
export const syllabusReplaceContentSchema = z
	.object({
		modules: z.array(syllabusModuleContentSchema).min(1),
	})
	.strict()
	.superRefine((input, ctx) => {
		const nodes =
			input.modules.length +
			input.modules.reduce((sum, m) => sum + m.lessons.length, 0);
		if (nodes > 500) {
			ctx.addIssue({
				code: "custom",
				path: ["modules"],
				message: "Tổng số module và buổi học vượt giới hạn 500",
			});
		}
	});
export type SyllabusReplaceContent = z.infer<
	typeof syllabusReplaceContentSchema
>;

/**
 * IELTS rubric scores — strict shape, float 0–9 on purpose: half-bands
 * (6.5, 7.5) are the domain norm, so the repo-wide `.int()` convention
 * would reject most real grades.
 */
export const gradeScoresSchema = z
	.object({
		task: z.number().min(0).max(9),
		coherence: z.number().min(0).max(9),
		lexical: z.number().min(0).max(9),
		grammar: z.number().min(0).max(9),
	})
	.strict();
export type GradeScores = z.infer<typeof gradeScoresSchema>;

export const assignmentGradeSchema = z.object({
	scores: gradeScoresSchema,
});
export type AssignmentGrade = z.infer<typeof assignmentGradeSchema>;

/**
 * Ngân hàng đề — tạo đề Writing để lưu vào bank (design 2026-09-18).
 * `status` luôn tường minh trên wire (giống reportCreateSchema):
 * "ready" = hiện khi giao từ trang Lớp học, "draft" = bản nháp riêng tư.
 */
export const assignmentPromptCreateSchema = z
	.object({
		task: z.enum(["task1", "task2"]),
		genre: z.string().trim().min(1).max(40),
		title: z.string().trim().min(1).max(200),
		band: z.enum(["6.0", "6.5", "7.0", "7.5"]),
		source: z.string().trim().max(200),
		prompt: z.string().trim().min(1).max(5000),
		note: z.string().max(2000),
		status: z.enum(["draft", "ready"]),
	})
	.strict();
export type AssignmentPromptCreate = z.infer<
	typeof assignmentPromptCreateSchema
>;

/** Feedback is teacher-authored and may contain sensitive education data. */
export const commentBankCreateSchema = z
	.object({
		text: z.string().trim().min(1).max(2000),
		operationId: z.string().uuid(),
	})
	.strict();
export type CommentBankCreate = z.infer<typeof commentBankCreateSchema>;

/**
 * Weekly parent-report creation (#173). A "sent" report requires content —
 * an empty send would create a log entry for a message that never existed.
 * Drafts may be empty; `channel` is metadata only (no real delivery yet).
 */
export const reportCreateSchema = z
	.object({
		studentId: z.string().min(1),
		period: z.string().trim().min(1).max(120),
		content: z.string().max(4000),
		channel: z.enum(["Zalo OA", "Email"]),
		status: z.enum(["draft", "sent"]),
	})
	.strict()
	.refine((v) => v.status !== "sent" || v.content.trim().length > 0, {
		message: "content required when sending",
	});
export type ReportCreate = z.infer<typeof reportCreateSchema>;

/**
 * Scheduled-lesson status actions (Wave 4) — NOT syllabus_lesson (invariant 5).
 * The body is exactly `{}`: the target status comes from the endpoint, never
 * the client; anything else is rejected so a forged `status` cannot ride along.
 */
export const lessonActionSchema = z.object({}).strict();
export type LessonAction = z.infer<typeof lessonActionSchema>;

/**
 * Lesson edit (issue #55) — full-replace, upcoming-only. day: 1 = Monday …
 * 7 = Sunday (lesson-day convention; the class schedule JSON is 0-based —
 * the off-by-one is pinned here). WARNING for consumers (#56): omitted
 * optional fields reset to "" — send all five fields or topic/zoom are wiped.
 * zoom only accepts "" or an https:// URL (it lands in the Zalo reminder
 * template, so scheme injection must die at the boundary).
 */
export const lessonEditSchema = z
	.object({
		day: z.number().int().min(1).max(7),
		time: z.string().regex(TIME_REGEX),
		dur: z.number().int().min(1).max(1440),
		topic: z.string().max(500).default(""),
		zoom: z
			.string()
			.max(2048)
			.default("")
			.refine((value) => value === "" || value.startsWith("https://"), {
				message: "zoom phải là URL https:// hoặc rỗng",
			}),
	})
	.strict();
export type LessonEdit = z.infer<typeof lessonEditSchema>;

/**
 * Occurrence-level edit (issue #98) — `≥1` field, never `day`: the server
 * derives the weekday from `moveDate`. Every shared field MUST stay
 * constraint-identical to lessonEditSchema above (.strict(), zoom only "" or
 * https:// — it lands in the Zalo reminder template so scheme injection dies
 * at the boundary; topic ≤500; dur ≤1440 with midnight wrap handled by the
 * generator formula). moveDate is pattern-checked here and roundtrip-guarded
 * against the real calendar server-side (`parseStartDateStrict`) because a
 * regex alone accepts 2026-02-30.
 */
export const occurrenceEditSchema = z
	.object({
		moveDate: z
			.string()
			.regex(/^\d{4}-\d{2}-\d{2}$/)
			.optional(),
		time: z.string().regex(TIME_REGEX).optional(),
		dur: z.number().int().min(1).max(1440).optional(),
		topic: z.string().max(500).optional(),
		zoom: z
			.string()
			.max(2048)
			.optional()
			.refine(
				(value) =>
					value === undefined || value === "" || value.startsWith("https://"),
				{
					message: "zoom phải là URL https:// hoặc rỗng",
				},
			),
	})
	.strict()
	.refine(
		(body) =>
			body.moveDate !== undefined ||
			body.time !== undefined ||
			body.dur !== undefined ||
			body.topic !== undefined ||
			body.zoom !== undefined,
		{ message: "cần ít nhất một trường để chỉnh" },
	);
export type OccurrenceEdit = z.infer<typeof occurrenceEditSchema>;

/** Occurrence mutations report what landed (advisory numbers — see plan #98 K5/RT5). */
export interface OccurrenceMutationResponse {
	updated: number;
	skipped: number;
}

/** Mark-paid accepts only the display method; amount/status remain server-owned. */
export const invoiceMarkPaidSchema = z
	.object({ method: z.string().trim().min(1).max(32) })
	.strict();
export type InvoiceMarkPaid = z.infer<typeof invoiceMarkPaidSchema>;

/**
 * Issue #60 — create a tuition invoice for an enrollment. `due` is ISO
 * yyyy-mm-dd and is roundtrip-guarded server-side (`parseStartDateStrict`,
 * same precedent as `moveDate`) because the regex alone accepts 2026-02-30.
 * `amount` is integer VND and must be positive — unlike package `price`
 * (min 0), an invoice is a concrete amount due. Creation is non-idempotent,
 * consistent with POST /syllabi.
 */
export const invoiceCreateSchema = z
	.object({
		enrollmentId: z.string().min(1),
		amount: z.number().int().min(1),
		due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
		note: z.string().trim().max(500).default(""),
	})
	.strict();
export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;

// --- Kernel snapshot rows (server → web adapter) ---

export interface KernelStudentRow {
	id: string;
	name: string;
	phone: string;
	zalo: string;
	parentName: string;
	parentPhone: string;
}

export interface KernelClassRow {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	skills: string[];
	mode: string;
	syllabusId: string | null;
	/** Raw string: JSON `{days,start,end}` (new) or legacy free text. Web formats it. */
	schedule: string;
	sessionsTotal: number;
	/**
	 * Stored legacy column with no writer since Wave 4 — the display value
	 * derives from completed lessons (invariant 7). Do not trust it.
	 */
	sessionsDone: number;
	status: string;
	startDate: string;
	notes: string;
}

export interface KernelEnrollmentRow {
	id: string;
	classId: string;
	studentId: string;
	createdAt: string;
}

/**
 * Entitlement owned by a student; enrollment is the optional class attachment
 * (issue #104 — a package can exist before the student joins a class, so
 * `enrollmentId`/`classId` are null for parked packages).
 * done/remaining are derived downstream, never stored.
 */
export interface KernelPackageRow {
	id: string;
	enrollmentId: string | null;
	classId: string | null;
	studentId: string;
	total: number;
	price: number;
	mode: "Online" | "Offline" | string;
	start: string;
	expiry: string;
	status: string;
	createdAt: string;
}

export interface KernelSyllabusLessonRow {
	id: string;
	title: string;
	objectives: string;
	materials: string;
	/** Loại buổi (issue #154): "lesson" | "midterm" | "final"; `| string` cho forward-compat. */
	kind: "lesson" | "midterm" | "final" | string;
	status: "done" | "current" | "upcoming" | string;
}

export interface KernelSyllabusModuleRow {
	id: string;
	title: string;
	description: string;
	lessons: KernelSyllabusLessonRow[];
}

export interface KernelSyllabusRow {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	skills: string[];
	description: string;
	/** NULL = shared template; a class id = that class's imported copy. */
	classId: string | null;
	/** Template the copy was imported from (null on templates). */
	sourceTemplateId: string | null;
	/** Stored form value; the adapter recomputes from the tree. */
	totalLessons: number;
	modules: KernelSyllabusModuleRow[];
}

export interface KernelAssignmentRow {
	id: string;
	studentId: string;
	title: string;
	type: string;
	/** Display-formatted dd/mm text, like every other date on the wire. */
	due: string;
	status: "not-submitted" | "late" | "graded" | string;
	scores: {
		task: number;
		coherence: number;
		lexical: number;
		grammar: number;
	} | null;
}

/**
 * A delivered/plan session (Wave 4). The student is never on this row —
 * the adapter resolves `sid` via the enrollment (invariant 2). done/remaining
 * derive from completed rows of the enrollment (invariant 6).
 * `date` (issue #98): occurrence identity yyyy-mm-dd — every row sharing
 * `(classId, date)` IS one physical session; NULL means the class diverged
 * from its schedule heuristic and renders through the frozen legacy path.
 */
export interface KernelLessonRow {
	id: string;
	classId: string;
	enrollmentId: string;
	day: number;
	time: string;
	dur: number;
	date: string | null;
	type: string;
	status: "completed" | "upcoming" | "cancelled" | "absent" | string;
	topic: string;
	zoom: string;
}

export interface KernelInvoiceRow {
	id: string;
	studentId: string;
	/**
	 * Issue #60 — ISO yyyy-mm-dd, unlike `date`'s display dd/mm and unlike
	 * the "every other date on the wire" dd/mm docblock on
	 * KernelAssignmentRow.due: the year is required for overdue math.
	 * Display formatting is a web concern (issue #61).
	 */
	due: string;
	note: string;
	enrollmentId: string;
	amount: number;
	status: "paid" | "overdue" | "unpaid" | string;
	date: string;
	type: string;
	method: string;
}

export interface KernelAssignmentPromptRow {
	id: string;
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
	status: "draft" | "ready" | string;
}

export interface KernelReportRow {
	id: string;
	studentId: string;
	period: string;
	sessions: number;
	status: "read" | "sent" | "draft";
	sent: string;
	read: string;
}

export interface KernelNotifRow {
	id: string;
	text: string;
	time: string;
	channel: string;
	dot: "accent" | "danger" | "warn";
}

export interface KernelCommentBankRow {
	id: string;
	tag: string;
	text: string;
}

export interface KernelSnapshot {
	students: KernelStudentRow[];
	classes: KernelClassRow[];
	syllabi: KernelSyllabusRow[];
	enrollments: KernelEnrollmentRow[];
	packages: KernelPackageRow[];
	lessons: KernelLessonRow[];
	assignments: KernelAssignmentRow[];
	invoices: KernelInvoiceRow[];
	reports: KernelReportRow[];
	assignmentPrompts: KernelAssignmentPromptRow[];
	notifs: KernelNotifRow[];
	commentBank: KernelCommentBankRow[];
}

export interface CreatedResponse {
	id: string;
}

export const workspaceSettingsSchema = z.object({
	defaultUnitPrice: z.string().min(1).default("400.000đ"),
	tplReminder: z
		.string()
		.min(1)
		.default(
			"Chào phụ huynh, mai ({{date}}) học viên {{student_name}} có buổi học lúc {{time}} hình thức {{mode}}. Link: {{zoom_link}}. Nhắc em chuẩn bị bài nhé ạ.",
		),
	tplDebt: z
		.string()
		.min(1)
		.default(
			"Phụ huynh ơi, học phí gói của {{student_name}} còn nợ {{amount}}. Giáo viên gửi QR MoMo {{qr_link}}. Nhờ phụ huynh thanh toán giúp ạ.",
		),
	tplReport: z
		.string()
		.min(1)
		.default(
			"Tuần này {{student_name}} học {{sessions}} buổi, chuyên cần {{attendance}}. Band gần nhất: {{latest_band}}. Việc ở nhà: {{homework}}. Chi tiết: {{report_link}}",
		),
	absenceNoticeHours: z.string().min(1).default("2 giờ trước buổi học"),
	unexcusedDeduct: z.string().min(1).default("Có, trừ 1 buổi"),
	maxAbsencesBeforeAlert: z.number().int().min(0).default(2),
	reminderSchedule: z.string().min(1).default("T−24h và T−1h"),
	overdueDebtReminder: z.string().min(1).default("Sau 3 ngày và 7 ngày"),
	packageEndReminder: z.string().min(1).default("Khi còn 3 buổi"),
	preferredChannel: z.string().min(1).default("Zalo trước, email dự phòng"),
});
export type WorkspaceSettings = z.infer<typeof workspaceSettingsSchema>;

export const workspaceSettingsUpdateSchema = z.object({
	defaultUnitPrice: z.string().min(1).optional(),
	tplReminder: z.string().min(1).optional(),
	tplDebt: z.string().min(1).optional(),
	tplReport: z.string().min(1).optional(),
	absenceNoticeHours: z.string().min(1).optional(),
	unexcusedDeduct: z.string().min(1).optional(),
	maxAbsencesBeforeAlert: z.number().int().min(0).optional(),
	reminderSchedule: z.string().min(1).optional(),
	overdueDebtReminder: z.string().min(1).optional(),
	packageEndReminder: z.string().min(1).optional(),
	preferredChannel: z.string().min(1).optional(),
});
export type WorkspaceSettingsUpdate = z.infer<
	typeof workspaceSettingsUpdateSchema
>;
