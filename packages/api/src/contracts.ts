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
	total: z.number().int().min(0).default(10),
	price: z.number().int().min(0).default(400000),
	mode: z.enum(["Online", "Offline"]).default("Online"),
	classId: z.string().min(1).optional(),
});
export type StudentCreate = z.infer<typeof studentCreateSchema>;

export const classCreateSchema = z.object({
	name: z.string().min(1),
	level: z.string().default(""),
	skill: z.string().default(""),
	mode: z.string().default("Online"),
	/** "" means no syllabus assigned yet. */
	syllabusId: z.string().default(""),
	schedule: z.string().default(""),
	sessionsTotal: z.number().int().min(0).default(12),
	startDate: z.string().default(""),
});
export type ClassCreate = z.infer<typeof classCreateSchema>;

export const assignSyllabusSchema = z.object({
	/** "" unassigns. */
	syllabusId: z.string(),
});
export type AssignSyllabus = z.infer<typeof assignSyllabusSchema>;

export const classNotesSchema = z.object({
	notes: z.string(),
});
export type ClassNotes = z.infer<typeof classNotesSchema>;

export const syllabusCreateSchema = z.object({
	name: z.string().min(1),
	level: z.string().default(""),
	skill: z.string().default(""),
	description: z.string().default(""),
	totalLessons: z.number().int().min(0).default(0),
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
	status: z.enum(["done", "current", "upcoming"]).default("upcoming"),
});
export type LessonUpsert = z.infer<typeof lessonUpsertSchema>;

/**
 * Scheduled-lesson status actions (Wave 4) — NOT syllabus_lesson (invariant 5).
 * The body is exactly `{}`: the target status comes from the endpoint, never
 * the client; anything else is rejected so a forged `status` cannot ride along.
 */
export const lessonActionSchema = z.object({}).strict();
export type LessonAction = z.infer<typeof lessonActionSchema>;

/** Mark-paid accepts only the display method; amount/status remain server-owned. */
export const invoiceMarkPaidSchema = z
	.object({ method: z.string().trim().min(1).max(32) })
	.strict();
export type InvoiceMarkPaid = z.infer<typeof invoiceMarkPaidSchema>;

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
	skill: string;
	mode: string;
	syllabusId: string | null;
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
 * Entitlement joined with its enrollment's class/student for the adapter.
 * done/remaining are derived downstream, never stored (invariant 6).
 */
export interface KernelPackageRow {
	id: string;
	enrollmentId: string;
	classId: string;
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
	skill: string;
	description: string;
	/** Stored form value; the adapter recomputes from the tree. */
	totalLessons: number;
	modules: KernelSyllabusModuleRow[];
}

/**
 * A delivered/plan session (Wave 4). The student is never on this row —
 * the adapter resolves `sid` via the enrollment (invariant 2). done/remaining
 * derive from completed rows of the enrollment (invariant 6).
 */
export interface KernelLessonRow {
	id: string;
	classId: string;
	enrollmentId: string;
	day: number;
	time: string;
	dur: number;
	type: string;
	status: "completed" | "upcoming" | "cancelled" | "absent" | string;
	topic: string;
	zoom: string;
}

export interface KernelInvoiceRow {
	id: string;
	studentId: string;
	amount: number;
	status: "paid" | "overdue" | "unpaid" | string;
	date: string;
	type: string;
	method: string;
}

export interface KernelSnapshot {
	students: KernelStudentRow[];
	classes: KernelClassRow[];
	syllabi: KernelSyllabusRow[];
	enrollments: KernelEnrollmentRow[];
	packages: KernelPackageRow[];
	lessons: KernelLessonRow[];
	invoices: KernelInvoiceRow[];
}

export interface CreatedResponse {
	id: string;
}
