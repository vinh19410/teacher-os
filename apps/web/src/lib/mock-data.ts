import type { ClassType } from "@teacher-os/api/contracts";

export interface Student {
	id: string;
	name: string;
	phone: string;
	zalo: string;
	parent: { name: string; phone: string };
	targetBand: string;
	skills: string[];
	examDate: string;
	pkg: {
		total: number;
		done: number;
		remaining: number;
		price: number;
		mode: "Online" | "Offline";
		start: string;
		expiry: string;
	};
	tags: string[];
	notes: string;
	avatar: string;
	atRisk: boolean;
}

export type LessonType = "1:1" | "1:2" | "trial" | "mock" | "review";
export type LessonStatus = "completed" | "upcoming" | "cancelled" | "absent";

export interface Lesson {
	id: string;
	sid: string;
	day: number;
	time: string;
	dur: number;
	type: LessonType;
	status: LessonStatus;
	topic: string;
	zoom: string;
}
export type InvoiceStatus = "paid" | "overdue" | "unpaid";
export interface Invoice {
	id: string;
	sid: string;
	amount: number;
	status: InvoiceStatus;
	date: string;
	type: string;
	method: string;
}
export interface Scores {
	task: number;
	coherence: number;
	lexical: number;
	grammar: number;
}
export type AssignmentStatus = "not-submitted" | "late" | "graded";
export interface Assignment {
	id: string;
	sid: string;
	title: string;
	type: string;
	due: string;
	status: AssignmentStatus;
	scores: Scores | null;
}
export interface Report {
	id: string;
	sid: string;
	period: string;
	sessions: number;
	status: "read" | "sent" | "draft";
	sent: string;
	read: string;
}
export interface Notif {
	id: string;
	text: string;
	time: string;
	channel: string;
	dot: "accent" | "danger" | "warn";
}
export interface CommentBankItem {
	id: string;
	tag: string;
	text: string;
}

export interface ClassGroup {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	skills: string[];
	mode: string;
	syllabusId: string;
	studentIds: string[];
	/** Raw string: JSON `{days,start,end}` (new) or legacy free text. */
	schedule: string;
	sessionsDone: number;
	sessionsTotal: number;
	status: string;
	startDate: string;
	notes: string;
}

export type SyllabusLessonStatus = "done" | "current" | "upcoming";
export interface SyllabusLesson {
	id: string;
	title: string;
	objectives: string;
	materials: string;
	status: SyllabusLessonStatus;
}
export interface SyllabusModule {
	id: string;
	title: string;
	description?: string;
	lessons: SyllabusLesson[];
}
export interface Syllabus {
	id: string;
	name: string;
	level: string;
	type: ClassType;
	/** NULL = shared template; a class id = that class's imported copy (issue #79). */
	classId: string | null;
	/** Template the copy was imported from (null on templates). */
	sourceTemplateId: string | null;
	skills: string[];
	totalLessons: number;
	description: string;
	modules: SyllabusModule[];
}

export interface MockData {
	students: Student[];
	lessons: Lesson[];
	invoices: Invoice[];
	assignments: Assignment[];
	reports: Report[];
	notifs: Notif[];
	commentBank: CommentBankItem[];
	classes: ClassGroup[];
	syllabi: Syllabus[];
}

export type KernelHydratedData = Pick<
	MockData,
	| "students"
	| "classes"
	| "syllabi"
	| "lessons"
	| "assignments"
	| "invoices"
	| "reports"
	| "notifs"
	| "commentBank"
>;

export const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Single source for the display label of the wire enum id. */
export const CLASS_TYPE_LABELS: Record<ClassType, string> = {
	ielts: "IELTS",
	communication: "Giao tiếp",
};

/** One-line class summary: "Band 7.0 · Writing, Speaking · Online". */
export function classMeta(c: ClassGroup): string {
	return [c.level, c.skills.join(", "), c.mode].filter(Boolean).join(" · ");
}
export function fmtVND(n: number): string {
	return `${n.toLocaleString("vi-VN")}đ`;
}
export function fmtK(n: number): string {
	return `${Math.round(n / 1000)}k`;
}
export function averageBand(scores: Scores): number {
	return (
		Math.round(
			((scores.task + scores.coherence + scores.lexical + scores.grammar) / 4) *
				10,
		) / 10
	);
}
export function initials(name: string): string {
	const parts = name.trim().split(/\s+/);
	return parts.length === 1
		? parts[0].slice(0, 2).toUpperCase()
		: (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}
export function isAlmostOut(s: Student): boolean {
	return s.pkg.remaining <= 3;
}
