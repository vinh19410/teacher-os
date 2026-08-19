/*
 * Teacher OS — mock data layer, ported verbatim from
 * open-design/v1/teacher-os.html `D` object (lines 558–691).
 */

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
	day: number; // 1..7
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
	skill: string;
	mode: string;
	syllabusId: string;
	studentIds: string[];
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
	skill: string;
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
export const dayDates = [18, 19, 20, 21, 22, 23, 24];

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
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (
		parts[parts.length - 2][0] + parts[parts.length - 1][0]
	).toUpperCase();
}

export function isAlmostOut(s: Student): boolean {
	return s.pkg.remaining <= 3;
}

export const seedData: MockData = {
	students: [
		{
			id: "s1",
			name: "Nguyễn Minh Anh",
			phone: "0912 345 678",
			zalo: "0912345678",
			parent: { name: "Nguyễn Văn Hùng", phone: "0987 654 321" },
			targetBand: "7.0",
			skills: ["Writing", "Speaking"],
			examDate: "14/12/2026",
			pkg: {
				total: 12,
				done: 8,
				remaining: 4,
				price: 450000,
				mode: "Online",
				start: "01/08",
				expiry: "15/11",
			},
			tags: ["IELTS Writing", "sắp hết buổi"],
			notes: "Chăm chỉ, yếu Task Response. Mẹ hay hỏi chi tiết.",
			avatar: "MA",
			atRisk: false,
		},
		{
			id: "s2",
			name: "Trần Khôi Nguyên",
			phone: "0903 222 111",
			zalo: "0903222111",
			parent: { name: "Trần Thị Thu", phone: "0903 222 000" },
			targetBand: "6.5",
			skills: ["Speaking"],
			examDate: "30/11/2026",
			pkg: {
				total: 10,
				done: 3,
				remaining: 7,
				price: 400000,
				mode: "Offline",
				start: "10/08",
				expiry: "20/12",
			},
			tags: ["IELTS Speaking"],
			notes: "Tự tin nói nhưng phát âm /θ/ /ð/ yếu.",
			avatar: "KN",
			atRisk: false,
		},
		{
			id: "s3",
			name: "Lê Hoàng Gia Hân",
			phone: "0988 100 200",
			zalo: "0988100200",
			parent: { name: "Lê Minh Phương", phone: "0988 100 201" },
			targetBand: "6.0",
			skills: ["Speaking", "Giao tiếp"],
			examDate: "",
			pkg: {
				total: 16,
				done: 5,
				remaining: 11,
				price: 350000,
				mode: "Online",
				start: "15/07",
				expiry: "15/01/27",
			},
			tags: ["Giao tiếp"],
			notes: "Học 1:2. Cần chia thời gian nói đều.",
			avatar: "GH",
			atRisk: false,
		},
		{
			id: "s4",
			name: "Phạm Quốc Bảo",
			phone: "0977 555 444",
			zalo: "0977555444",
			parent: { name: "Phạm Thị Hoa", phone: "0977 555 400" },
			targetBand: "7.0",
			skills: ["Writing", "Speaking"],
			examDate: "19/10/2026",
			pkg: {
				total: 10,
				done: 8,
				remaining: 2,
				price: 500000,
				mode: "Online",
				start: "01/07",
				expiry: "15/09",
			},
			tags: ["IELTS Writing", "sắp hết buổi", "nợ học phí"],
			notes: "Vắng 2 buổi liên. Cần gọi phụ huynh.",
			avatar: "QB",
			atRisk: true,
		},
		{
			id: "s5",
			name: "Vũ Thảo Vy",
			phone: "0966 777 888",
			zalo: "0966777888",
			parent: { name: "Vũ Thanh Hà", phone: "0966 777 800" },
			targetBand: "5.5",
			skills: ["Writing", "Reading"],
			examDate: "10/01/2027",
			pkg: {
				total: 20,
				done: 5,
				remaining: 15,
				price: 300000,
				mode: "Offline",
				start: "01/08",
				expiry: "01/02/27",
			},
			tags: ["Trẻ em", "IELTS Junior"],
			notes: "Lớp 10, cần bài tập nhẹ.",
			avatar: "TV",
			atRisk: false,
		},
	],
	lessons: [
		{
			id: "l1",
			sid: "s1",
			day: 1,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "completed",
			topic: "Task 2: Advantages & Disadvantages",
			zoom: "meet.google.com/abc",
		},
		{
			id: "l2",
			sid: "s5",
			day: 1,
			time: "18:00",
			dur: 60,
			type: "1:1",
			status: "completed",
			topic: "Writing: Process Description",
			zoom: "",
		},
		{
			id: "l3",
			sid: "s1",
			day: 2,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "upcoming",
			topic: "Task 2: Opinion Essay — Education",
			zoom: "meet.google.com/abc",
		},
		{
			id: "l4",
			sid: "s2",
			day: 2,
			time: "20:30",
			dur: 60,
			type: "1:1",
			status: "upcoming",
			topic: "Part 2: Describe a memorable event",
			zoom: "",
		},
		{
			id: "l5",
			sid: "s4",
			day: 3,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "upcoming",
			topic: "Mock Writing Task 1 + Review",
			zoom: "meet.google.com/xyz",
		},
		{
			id: "l6",
			sid: "s3",
			day: 3,
			time: "20:30",
			dur: 60,
			type: "1:2",
			status: "upcoming",
			topic: "Speaking Practice — Part 1 & 2",
			zoom: "meet.google.com/lmn",
		},
		{
			id: "l7",
			sid: "s5",
			day: 4,
			time: "18:00",
			dur: 60,
			type: "1:1",
			status: "upcoming",
			topic: "Reading: Matching Headings",
			zoom: "",
		},
		{
			id: "l8",
			sid: "s1",
			day: 4,
			time: "19:30",
			dur: 90,
			type: "review",
			status: "upcoming",
			topic: "Review bài Writing tuần",
			zoom: "meet.google.com/abc",
		},
		{
			id: "l9",
			sid: "s4",
			day: 5,
			time: "19:00",
			dur: 90,
			type: "1:1",
			status: "cancelled",
			topic: "Task 2: Discussion Essay",
			zoom: "",
		},
		{
			id: "l10",
			sid: "s2",
			day: 6,
			time: "9:00",
			dur: 120,
			type: "mock",
			status: "upcoming",
			topic: "Mock Test Full Speaking",
			zoom: "meet.google.com/mock",
		},
		{
			id: "l11",
			sid: "s3",
			day: 7,
			time: "10:00",
			dur: 60,
			type: "trial",
			status: "upcoming",
			topic: "Trial — Đánh giá trình độ",
			zoom: "meet.google.com/trial",
		},
	],
	invoices: [
		{
			id: "INV-081",
			sid: "s1",
			amount: 5400000,
			status: "paid",
			date: "01/08",
			type: "Gói 12 buổi",
			method: "CK",
		},
		{
			id: "INV-082",
			sid: "s2",
			amount: 4000000,
			status: "paid",
			date: "10/08",
			type: "Gói 10 buổi",
			method: "MoMo",
		},
		{
			id: "INV-083",
			sid: "s3",
			amount: 5600000,
			status: "paid",
			date: "15/07",
			type: "Gói 16 buổi",
			method: "CK",
		},
		{
			id: "INV-084",
			sid: "s4",
			amount: 1000000,
			status: "overdue",
			date: "05/08",
			type: "2 buổi",
			method: "MoMo",
		},
		{
			id: "INV-085",
			sid: "s5",
			amount: 6000000,
			status: "paid",
			date: "01/08",
			type: "Gói 20 buổi",
			method: "CK",
		},
		{
			id: "INV-086",
			sid: "s1",
			amount: 900000,
			status: "unpaid",
			date: "19/08",
			type: "2 buổi phụ",
			method: "—",
		},
	],
	assignments: [
		{
			id: "a1",
			sid: "s1",
			title: "Task 2: University education should be free",
			type: "Writing",
			due: "20/08",
			status: "late",
			scores: null,
		},
		{
			id: "a2",
			sid: "s2",
			title: "Cue Card: Describe a person who influenced you",
			type: "Speaking",
			due: "19/08",
			status: "graded",
			scores: { task: 6.5, coherence: 6.0, lexical: 6.5, grammar: 6.0 },
		},
		{
			id: "a3",
			sid: "s4",
			title: "Task 1: Line chart — Internet users 2000-2020",
			type: "Writing",
			due: "18/08",
			status: "not-submitted",
			scores: null,
		},
		{
			id: "a4",
			sid: "s3",
			title: "Part 1: Hometown + Study (audio)",
			type: "Speaking",
			due: "21/08",
			status: "not-submitted",
			scores: null,
		},
		{
			id: "a5",
			sid: "s5",
			title: "Reading: Matching Headings (Cam 15)",
			type: "Reading",
			due: "22/08",
			status: "graded",
			scores: { task: 5.5, coherence: 5.5, lexical: 5.0, grammar: 5.5 },
		},
		{
			id: "a6",
			sid: "s1",
			title: "Task 1: Bar chart — Coffee exports",
			type: "Writing",
			due: "24/08",
			status: "late",
			scores: null,
		},
	],
	reports: [
		{
			id: "r1",
			sid: "s1",
			period: "12–18/08",
			sessions: 2,
			status: "read",
			sent: "18/08 20:00",
			read: "18/08 21:30",
		},
		{
			id: "r2",
			sid: "s2",
			period: "12–18/08",
			sessions: 1,
			status: "read",
			sent: "18/08 20:00",
			read: "19/08 08:15",
		},
		{
			id: "r3",
			sid: "s4",
			period: "12–18/08",
			sessions: 0,
			status: "sent",
			sent: "18/08 20:00",
			read: "",
		},
		{
			id: "r4",
			sid: "s5",
			period: "12–18/08",
			sessions: 1,
			status: "draft",
			sent: "",
			read: "",
		},
	],
	notifs: [
		{
			id: "n1",
			text: "Nhắc lịch: Minh Anh — 19:00 hôm nay (Online)",
			time: "18/08 19:00",
			channel: "Zalo",
			dot: "accent",
		},
		{
			id: "n2",
			text: "Nhắc nợ: Quốc Bảo — quá hạn 5 ngày (1.000k)",
			time: "18/08 09:00",
			channel: "Zalo",
			dot: "danger",
		},
		{
			id: "n3",
			text: "Sắp hết gói: Quốc Bảo — còn 2 buổi",
			time: "17/08 18:00",
			channel: "Zalo",
			dot: "warn",
		},
		{
			id: "n4",
			text: "Bài trễ: Minh Anh — Task 2 University (hạn 20/08)",
			time: "17/08 20:00",
			channel: "Email",
			dot: "warn",
		},
	],
	commentBank: [
		{
			id: "cb1",
			tag: "Task Response",
			text: "Đề bị thiếu ý counter-argument, cần cân bằng hai mặt.",
		},
		{
			id: "cb2",
			tag: "Task Response",
			text: "Ví dụ cụ thể nhưng chưa link rõ tới luận điểm chính.",
		},
		{
			id: "cb3",
			tag: "Coherence",
			text: "Thiếu linking words giữa đoạn, ý nhảy quá nhanh.",
		},
		{
			id: "cb4",
			tag: "Coherence",
			text: "Cấu trúc đoạn tốt, topic sentence rõ ràng.",
		},
		{
			id: "cb5",
			tag: "Lexical",
			text: 'Từ vựng học thuật tốt, nhưng lặp "important" 3 lần.',
		},
		{
			id: "cb6",
			tag: "Lexical",
			text: 'Cần dùng synonym thay "people" — individuals, citizens.',
		},
		{
			id: "cb7",
			tag: "Grammar",
			text: "Lỗi article a/an, cần ôn lại countable nouns.",
		},
		{
			id: "cb8",
			tag: "Grammar",
			text: "Câu phức tốt, nhưng run-on sentence ở đoạn 2.",
		},
	],
	classes: [
		{
			id: "c1",
			name: "IELTS Writing 7.0 — Nhóm tối",
			level: "Band 7.0",
			skill: "Writing",
			mode: "Online",
			syllabusId: "sy1",
			studentIds: ["s1", "s4"],
			schedule: "T3 & T5 · 19:00–20:30",
			sessionsDone: 6,
			sessionsTotal: 12,
			status: "active",
			startDate: "01/08",
			notes:
				"Nhóm nâng cao — tập trung Task 2. Minh Anh nhanh, Quốc Bảo cần chậm lại.",
		},
		{
			id: "c2",
			name: "IELTS Speaking 6.5 — Cặp 1:2",
			level: "Band 6.5",
			skill: "Speaking",
			mode: "Online",
			syllabusId: "sy2",
			studentIds: ["s3"],
			schedule: "T4 · 20:30–21:30",
			sessionsDone: 3,
			sessionsTotal: 10,
			status: "active",
			startDate: "15/07",
			notes: "Hoàng Gia Hân học ghép — cần chia thời gian nói đều.",
		},
		{
			id: "c3",
			name: "IELTS Junior — Viết cơ bản",
			level: "Band 5.5",
			skill: "Writing",
			mode: "Offline",
			syllabusId: "sy3",
			studentIds: ["s5"],
			schedule: "T6 · 18:00–19:00",
			sessionsDone: 5,
			sessionsTotal: 15,
			status: "active",
			startDate: "01/08",
			notes: "Thảo Vy lớp 10 — bài tập nhẹ, nhiều thực hành viết câu.",
		},
	],
	syllabi: [
		{
			id: "sy1",
			name: "IELTS Writing 7.0",
			level: "Band 7.0",
			skill: "Writing",
			totalLessons: 12,
			description:
				"Lộ trình 12 buổi: Task 1 (4 buổi) → Task 2 (6 buổi) → Mock & Review (2 buổi). Dành cho học viên mục tiêu 7.0+.",
			modules: [
				{
					id: "sy1-m1",
					title: "Module 1 · Task 1 — Graphs & Charts",
					lessons: [
						{
							id: "sy1-l1",
							title: "Line chart — Mô tả xu hướng",
							objectives:
								"Từ vựng trend (rise, fall, fluctuate); cấu trúc overview",
							materials: "Cam 15 Test 1 Task 1",
							status: "done",
						},
						{
							id: "sy1-l2",
							title: "Bar chart — So sánh nhóm",
							objectives: "Từ vựng comparison; nhóm dữ liệu",
							materials: "Cam 14 Test 3 Task 1",
							status: "done",
						},
						{
							id: "sy1-l3",
							title: "Pie chart — Tỷ lệ & phân bổ",
							objectives: "Cấu trúc so sánh tỷ lệ; fractions / percentages",
							materials: "Cam 13 Test 2 Task 1",
							status: "done",
						},
						{
							id: "sy1-l4",
							title: "Table — Dữ liệu số liệu",
							objectives: "Chọn dữ liệu chính; paraphrase số liệu",
							materials: "Cam 16 Test 2 Task 1",
							status: "done",
						},
					],
				},
				{
					id: "sy1-m2",
					title: "Module 2 · Task 2 — Essay Types",
					lessons: [
						{
							id: "sy1-l5",
							title: "Opinion Essay — Cấu trúc 4 đoạn",
							objectives: "Thesis statement; topic sentence",
							materials: "Cam 15 Test 2 Task 2",
							status: "done",
						},
						{
							id: "sy1-l6",
							title: "Discussion Essay — Cân bằng ý",
							objectives: "Counter-argument; linking words",
							materials: "Cam 14 Test 2 Task 2",
							status: "done",
						},
						{
							id: "sy1-l7",
							title: "Advantages & Disadvantages",
							objectives: "Paraphrase đề; chọn stand rõ ràng",
							materials: "Cam 13 Test 1 Task 2",
							status: "current",
						},
						{
							id: "sy1-l8",
							title: "Problem & Solution",
							objectives: "Brainstorm causes; propose solutions",
							materials: "Cam 16 Test 1 Task 2",
							status: "upcoming",
						},
						{
							id: "sy1-l9",
							title: "Two-part Question",
							objectives: "Phân tích 2 câu hỏi; time management",
							materials: "Cam 15 Test 4 Task 2",
							status: "upcoming",
						},
						{
							id: "sy1-l10",
							title: "Mixed & Unusual Topics",
							objectives: "Xử lý đề lạ; brainstorm nhanh",
							materials: "Tự biên soạn",
							status: "upcoming",
						},
					],
				},
				{
					id: "sy1-m3",
					title: "Module 3 · Mock & Review",
					lessons: [
						{
							id: "sy1-l11",
							title: "Mock Test — Full Writing 60 phút",
							objectives: "Time management; pressure test",
							materials: "Cam 17 Test 1",
							status: "upcoming",
						},
						{
							id: "sy1-l12",
							title: "Review & Feedback tổng hợp",
							objectives: "Phân tích điểm yếu; kế hoạch tự học",
							materials: "Tổng hợp bài đã viết",
							status: "upcoming",
						},
					],
				},
			],
		},
		{
			id: "sy2",
			name: "IELTS Speaking 6.5",
			level: "Band 6.5",
			skill: "Speaking",
			totalLessons: 10,
			description:
				"Lộ trình 10 buổi: Part 1 (3) → Part 2 (4) → Part 3 (3). Tập trung phát âm, fluency và mở rộng ý.",
			modules: [
				{
					id: "sy2-m1",
					title: "Module 1 · Part 1 — Introduction & Familiar Topics",
					lessons: [
						{
							id: "sy2-l1",
							title: "Hometown & Study",
							objectives: "Câu trả lời 2-3 câu; mở rộng ý tự nhiên",
							materials: "Cam 15 Test 1",
							status: "done",
						},
						{
							id: "sy2-l2",
							title: "Work & Daily Routine",
							objectives: "Thì hiện tại; từ vựng tần suất",
							materials: "Cam 14 Test 2",
							status: "done",
						},
						{
							id: "sy2-l3",
							title: "Hobbies & Free time",
							objectives: "Từ vựng sở thích; gerund / infinitive",
							materials: "Cam 13 Test 3",
							status: "done",
						},
					],
				},
				{
					id: "sy2-m2",
					title: "Module 2 · Part 2 — Cue Card (2 phút)",
					lessons: [
						{
							id: "sy2-l4",
							title: "Describe a person",
							objectives: "Cấu trúc 2 phút; từ vựng miêu tả tính cách",
							materials: "Cam 15 Test 2",
							status: "done",
						},
						{
							id: "sy2-l5",
							title: "Describe a place",
							objectives: "Location vocabulary; miêu tả bằng giác quan",
							materials: "Cam 14 Test 3",
							status: "current",
						},
						{
							id: "sy2-l6",
							title: "Describe an event / experience",
							objectives: "Narrative tenses; time markers",
							materials: "Cam 16 Test 1",
							status: "upcoming",
						},
						{
							id: "sy2-l7",
							title: "Describe an object / activity",
							objectives: "Functional language; expressing opinion",
							materials: "Cam 13 Test 1",
							status: "upcoming",
						},
					],
				},
				{
					id: "sy2-m3",
					title: "Module 3 · Part 3 — Abstract Discussion",
					lessons: [
						{
							id: "sy2-l8",
							title: "Comparing & Contrasting",
							objectives: "Comparative structures; giving opinion",
							materials: "Cam 15 Test 3",
							status: "upcoming",
						},
						{
							id: "sy2-l9",
							title: "Speculating & Hypothesizing",
							objectives: "Conditionals; modal verbs",
							materials: "Cam 14 Test 4",
							status: "upcoming",
						},
						{
							id: "sy2-l10",
							title: "Mock Speaking Full Test",
							objectives: "Full test simulation; feedback tổng hợp",
							materials: "Cam 17 Test 2",
							status: "upcoming",
						},
					],
				},
			],
		},
		{
			id: "sy3",
			name: "IELTS Junior — Viết cơ bản",
			level: "Band 5.5",
			skill: "Writing",
			totalLessons: 15,
			description:
				"Lộ trình 15 buổi cho học sinh lớp 10: câu → đoạn → essay ngắn. Bài tập nhẹ, nhiều thực hành.",
			modules: [
				{
					id: "sy3-m1",
					title: "Module 1 · Sentence Structure",
					lessons: [
						{
							id: "sy3-l1",
							title: "Câu đơn — S-V-O",
							objectives: "Subject, verb, object; capitalization",
							materials: "Worksheet 1",
							status: "done",
						},
						{
							id: "sy3-l2",
							title: "Câu phức — because, although",
							objectives: "Conjunctions; complex sentences",
							materials: "Worksheet 2",
							status: "done",
						},
						{
							id: "sy3-l3",
							title: "Connecting ideas — and, but, so",
							objectives: "Linking words cơ bản",
							materials: "Worksheet 3",
							status: "done",
						},
						{
							id: "sy3-l4",
							title: "Mô tả quá trình",
							objectives: "Sequence words; passive voice intro",
							materials: "Worksheet 4",
							status: "done",
						},
						{
							id: "sy3-l5",
							title: "Mô tả biểu đồ đơn giản",
							objectives: "Numbers, percentages; trend words",
							materials: "Worksheet 5",
							status: "done",
						},
					],
				},
				{
					id: "sy3-m2",
					title: "Module 2 · Paragraph Writing",
					lessons: [
						{
							id: "sy3-l6",
							title: "Topic sentence & supporting",
							objectives: "Main idea + evidence",
							materials: "Worksheet 6",
							status: "current",
						},
						{
							id: "sy3-l7",
							title: "Paragraph về ý kiến",
							objectives: "Opinion + reason + example",
							materials: "Worksheet 7",
							status: "upcoming",
						},
						{
							id: "sy3-l8",
							title: "Paragraph miêu tả",
							objectives: "Descriptive adjectives; order",
							materials: "Worksheet 8",
							status: "upcoming",
						},
						{
							id: "sy3-l9",
							title: "Paragraph kể chuyện",
							objectives: "Past tenses; narrative flow",
							materials: "Worksheet 9",
							status: "upcoming",
						},
						{
							id: "sy3-l10",
							title: "Review đoạn văn",
							objectives: "Self-edit; peer review",
							materials: "Tổng hợp WS 6-9",
							status: "upcoming",
						},
					],
				},
				{
					id: "sy3-m3",
					title: "Module 3 · Short Essays",
					lessons: [
						{
							id: "sy3-l11",
							title: "Essay 3 đoạn — Opinion",
							objectives: "Intro + body + conclusion",
							materials: "Topic set A",
							status: "upcoming",
						},
						{
							id: "sy3-l12",
							title: "Essay 3 đoạn — Description",
							objectives: "Descriptive writing basics",
							materials: "Topic set B",
							status: "upcoming",
						},
						{
							id: "sy3-l13",
							title: "Essay 4 đoạn — Discussion",
							objectives: "Two sides + opinion",
							materials: "Topic set C",
							status: "upcoming",
						},
						{
							id: "sy3-l14",
							title: "Introduction & Conclusion",
							objectives: "Hook; thesis; summary",
							materials: "Topic set D",
							status: "upcoming",
						},
						{
							id: "sy3-l15",
							title: "Mock mini-test",
							objectives: "30 min timed writing",
							materials: "Final worksheet",
							status: "upcoming",
						},
					],
				},
			],
		},
	],
};
