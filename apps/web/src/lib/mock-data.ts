import type {
	AssignmentQuestion,
	AssignmentSkill,
	AttendanceStatus,
	ClassType,
	KernelAssignmentTestRow,
	KernelEnrollmentRow,
	KernelEventRow,
	KernelHolidayShiftRow,
	KernelHolidaySummary,
	KernelViewer,
	KernelVocabDeckRow,
	KernelVocabSuggestionRow,
} from "@teacher-os/api/contracts";

export interface Student {
	id: string;
	name: string;
	phone: string;
	zalo: string;
	/** Email học viên — danh tính đăng nhập tương lai (cùng phone); "" với row legacy. */
	email: string;
	/** false = chưa có gói (tạo không lớp — D2): pkg là ZERO_PKG, view render "Chưa có gói". */
	hasPackage: boolean;
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
export type LessonStatus =
	| "completed"
	| "upcoming"
	| "cancelled"
	| "absent"
	| "holiday";

export interface Lesson {
	id: string;
	/** Owning class — maps 1:1 from KernelLessonRow.classId; the schedule
	 * tab scopes rows by it (studentIds filtering breaks for multi-class
	 * students, issue #83). */
	classId: string;
	sid: string;
	day: number;
	time: string;
	dur: number;
	/** Occurrence identity yyyy-mm-dd (#98): rows sharing `(classId, date)`
	 * are one physical session; null = legacy/divergent class. */
	date: string | null;
	type: LessonType;
	status: LessonStatus;
	/** TOS-7: trạng thái điểm danh chi tiết; null = chưa ghi (dòng cũ /
	 * 1-click). Giá trị lạ coerce về null ở mapLessons. */
	attendance: AttendanceStatus | null;
	/** Teacher-only ghi chú học vụ; không hiển thị ngoài màn giáo viên. */
	attendanceNote: string | null;
	topic: string;
	zoom: string;
}
export type InvoiceStatus = "paid" | "overdue" | "unpaid";
export interface AssignmentPrompt {
	id: string;
	skill?: AssignmentSkill | string;
	part?: string;
	type?: string;
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	intro?: string;
	passage?: string;
	transcript?: string;
	cueTopic?: string;
	cuePoints?: string;
	audioName?: string;
	/** Diagram image URL (https-only) — diagram prompts render it (#269). */
	imageUrl?: string;
	questions?: AssignmentQuestion[];
	/** Phase-02 FR7 — structured option bank (labeled choice list). */
	optionBank?: string[];
	note: string;
	status: "draft" | "ready";
	/** ISO datetime (#208) — bank sort mới nhất trước + meta `Thêm {date}`. */
	createdAt: string;
}

/** One lượt giao (#208) — mirror KernelClassAssignmentRow. `title` là snapshot
 * tên đề lúc giao; submittedAt null = chưa nộp (derived display-only). */
export interface ClassAssignment {
	id: string;
	classId: string;
	promptId: string;
	title: string;
	due: string;
	note: string;
	createdAt: string;
	targets: Array<{
		studentId: string;
		submittedAt: string | null;
		/** Optional: fixture/mock cũ không có — coi như null (#319). */
		attemptId?: string | null;
		gradedAt?: string | null;
		band?: number | null;
	}>;
}

export interface Invoice {
	id: string;
	sid: string;
	/** Enrollment (lớp) phát sinh hóa đơn; "" trên legacy rows tạo trước
	 * create API. Nguồn: KernelInvoiceRow.enrollmentId trên snapshot. */
	eid: string;
	amount: number;
	/** #320 — ledger-recomputed paid total; 0 on manually mark-paid rows. */
	paidAmount: number;
	status: InvoiceStatus;
	date: string;
	type: string;
	method: string;
	/** Issue #60/#135 — ISO yyyy-mm-dd from the wire; dd/mm is a render
	 * concern. Empty on legacy rows created before the create API. */
	due: string;
	note: string;
	/** #343 — creation timestamp (ms) parsed from KernelInvoiceRow.createdAt
	 * (ISO wire). 0 on unparseable/legacy-snapshot rows: the invoice is
	 * excluded from revenue buckets and counted as dropped, never silent. */
	createdAt: number;
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
	invitedStudentIds: string[];
	/** Raw string: JSON `{days,start,end}` (new) or legacy free text. */
	schedule: string;
	sessionsDone: number;
	sessionsTotal: number;
	status: string;
	startDate: string;
	tuitionFee: number | null;
	notes: string;
}

export type SyllabusLessonStatus = "done" | "current" | "upcoming";
/** Loại buổi (issue #154): midterm/final là buổi thi, hiển thị highlight. */
export type SyllabusLessonKind = "lesson" | "midterm" | "final";
export interface SyllabusLesson {
	id: string;
	title: string;
	objectives: string;
	materials: string;
	kind: SyllabusLessonKind;
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

/** Template giáo trình dùng chung — `classId` chắc chắn null (issue #394). */
export type SyllabusTemplate = Syllabus & { classId: null };

/** Giáo trình của một lớp — bản copy với `classId` trỏ đúng lớp đó (issue #394). */
export type ClassCurriculum = Syllabus & { classId: string };

export interface MockData {
	students: Student[];
	lessons: Lesson[];
	invoices: Invoice[];
	assignments: Assignment[];
	assignmentPrompts: AssignmentPrompt[];
	reports: Report[];
	notifs: Notif[];
	commentBank: CommentBankItem[];
	classes: ClassGroup[];
	syllabi: Syllabus[];
	/** TOS-17 (#451): quyền tài chính của thành viên hiện tại; mặc định cho phép
	 * trong fixture cũ khi không truyền. */
	viewer?: KernelViewer;
}

export type KernelHydratedData = Pick<
	MockData,
	| "students"
	| "classes"
	| "syllabi"
	| "lessons"
	| "assignments"
	| "assignmentPrompts"
	| "invoices"
	| "reports"
	| "notifs"
	| "commentBank"
> & {
	/** Issue #61: raw enrollment rows for the invoice create picker —
	 * MockData itself has no enrollments collection. */
	enrollments: KernelEnrollmentRow[];
	/** #208: lượt giao bài đã persist; MockData itself has no such collection. */
	classAssignments: ClassAssignment[];
	/** Full-test builder: full tests (parts đã group theo test);
	 * MockData itself has no such collection. */
	assignmentTests: KernelAssignmentTestRow[];
	/** Student Vocab SRS (#359): deck list (aggregate wordCount) cho trang lớp. */
	vocabDecks: KernelVocabDeckRow[];
	/** Pending vocab suggestions (#363): danh sách gợi ý đang chờ học viên phản hồi. */
	vocabSuggestions: KernelVocabSuggestionRow[];
	/** TOS-11: nhãn kỳ nghỉ + "Đã dời sang dd/MM" trên lịch tuần. */
	holidays: KernelHolidaySummary[];
	holidayShifts: KernelHolidayShiftRow[];
	/** TOS-14 (#447): sự kiện vận hành ngoài lịch lớp (org_event). */
	events: KernelEventRow[];
	/** TOS-17 (#451): ngữ cảnh quyền tài chính của thành viên hiện tại. */
	viewer?: KernelViewer;
};

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
