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

export interface KernelSnapshot {
	students: KernelStudentRow[];
	classes: KernelClassRow[];
	syllabi: KernelSyllabusRow[];
	enrollments: KernelEnrollmentRow[];
	packages: KernelPackageRow[];
}

export interface CreatedResponse {
	id: string;
}
