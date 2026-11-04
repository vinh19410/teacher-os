import {
	HISTORY_PAGE_SIZE,
	HISTORY_SKILLS,
	type HistoryDay,
	type HistoryEntry,
	type HistoryListResponse,
	type HistoryMonthResponse,
	type HistorySkill,
	type HistoryWeekResponse,
	type HistoryWeekRow,
} from "@teacher-os/api/contracts";
import { formatBand } from "@teacher-os/api/lib/ielts-band";
import {
	addDaysISO,
	mondayOfISO,
	vietnamDateKeyOf,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import {
	assignmentPrompt,
	assignmentTest,
	classAssignment,
	quizAttempt,
	vocabReviewLog,
} from "@teacher-os/db/schema/index";
import { and, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { Db } from "../app";
import { visibleAssignmentFilter } from "../lib/assignment-visibility";
import { toQuizAttemptGrade } from "../lib/quiz-grade";
import {
	createStudentGuard,
	parseQuizQuestions,
	type StudentEnv,
	type StudentRouteDeps,
} from "./student";

type HistoryRouteDeps = StudentRouteDeps;

/** Trạng thái điểm một lượt nộp cho danh sách lịch sử. */
type EntryGrade = {
	score: string | null;
	status: HistoryEntry["status"];
};

/** Dữ liệu thô đủ để dựng một dòng attempt — select một lần cho cả
 * month/week (chỉ cần thời điểm + phút) lẫn list (cần điểm/trạng thái). */
type AttemptSourceRow = {
	id: string;
	mode: string;
	skill: string;
	title: string;
	submittedAt: Date;
	startedAt: Date;
	correctCount: number | null;
	gradeScores: Record<string, number> | null;
	gradedAt: Date | null;
	questionsSnapshot: string;
	writingPart: string | null;
};

/** Nhóm vocab theo ngày — n thẻ đã ôn + tổng phút trong ngày. */
type VocabDayGroup = {
	count: number;
	minutes: number;
	lastReviewedAt: Date;
};

const YM_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Giới hạn truy vấn lịch sử attempt/vocab của MỘT học viên — đủ cho nhiều
 * năm luyện tập; quá mốc này danh sách cắt bớt phần cũ (vẫn mới nhất trước). */
const HISTORY_SCAN_LIMIT = 500;
const VOCAB_SCAN_LIMIT = 2000;

function invalidParam(c: Context<StudentEnv>, message: string) {
	return c.json({ error: message }, 400);
}

/** Ngày yyyy-mm-dd hợp lệ thật (đặt tên tháng/ngày sai như 2026-02-31 bị từ chối). */
function isValidISODate(iso: string): boolean {
	if (!ISO_DATE_PATTERN.test(iso)) return false;
	const parsed = new Date(`${iso}T00:00:00Z`);
	return (
		!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso
	);
}

/** Cửa sổ UTC [start, end) của các ngày VN từ `fromIso` kéo dài `days` ngày —
 * mỗi ngày VN bắt đầu 17:00 UTC của ngày trước (UTC+7), nên parse mốc
 * `T00:00:00+07:00` là chính xác, không phụ thuộc múi giờ máy chạy route. */
function vietnamWindowUtc(
	fromIso: string,
	days: number,
): { start: Date; end: Date } {
	const start = new Date(`${fromIso}T00:00:00+07:00`);
	const end = new Date(`${addDaysISO(fromIso, days)}T00:00:00+07:00`);
	return { start, end };
}

/** Phút học của một lượt nộp = submitted_at − started_at, làm tròn phút và
 * không bao giờ âm (đồng hồ lệch/timeout xử lý chéo). */
function attemptMinutes(row: AttemptSourceRow): number {
	const millis = row.submittedAt.getTime() - row.startedAt.getTime();
	return Math.max(0, Math.round(millis / 60000));
}

/** Điểm hiển thị của một lượt nộp — cùng derive với catalog practice
 * (practiceScoreLabel) và summary route: đã chấm → "Band x.x", tự chấm →
 * "đúng/tổng" từ snapshot, Writing/Speaking chưa chấm → chờ chấm. */
function entryGradeOf(row: AttemptSourceRow): EntryGrade {
	const graded = toQuizAttemptGrade({
		gradeScores: row.gradeScores,
		gradeFeedback: "",
		gradedAt: row.gradedAt,
	});
	if (row.writingPart !== null) {
		const total = parseQuizQuestions(row.questionsSnapshot, row.id).length;
		const objScore =
			row.correctCount !== null && total > 0
				? `${row.correctCount}/${total}`
				: null;
		if (graded) {
			const band = formatBand(graded.band);
			return {
				score: objScore ? `${objScore} · Band ${band}` : `Band ${band}`,
				status: "graded",
			};
		}
		return { score: objScore, status: "awaiting" };
	}
	if (graded) {
		const band = formatBand(graded.band);
		return { score: `Band ${band}`, status: "graded" };
	}
	if (row.skill === "writing" || row.skill === "speaking") {
		return { score: null, status: "awaiting" };
	}
	if (row.correctCount === null) {
		return { score: null, status: "auto" };
	}
	const total = parseQuizQuestions(row.questionsSnapshot, row.id).length;
	return { score: `${row.correctCount}/${total}`, status: "auto" };
}

function attemptToEntry(row: AttemptSourceRow): HistoryEntry {
	const grade = entryGradeOf(row);
	return {
		id: row.id,
		kind: row.mode === "practice" ? "practice" : "assignment",
		skill: row.skill as HistorySkill,
		title: row.title,
		date: vietnamDateKeyOf(row.submittedAt),
		submittedAt: row.submittedAt.toISOString(),
		minutes: attemptMinutes(row),
		score: grade.score,
		status: grade.status,
		attemptId: row.id,
		...(row.writingPart !== null ? { hasWriting: true } : {}),
	};
}

/** `date(..., '+7 hours')` gom log ôn từ theo ngày VN ngay trong SQLite —
 * biểu thức dùng chung cho select lẫn groupBy để SQLite khớp chữ ký. */
const VOCAB_DAY_EXPR = sql<string>`date(${vocabReviewLog.reviewedAt} / 1000, 'unixepoch', '+7 hours')`;

async function vocabDayGroups(
	db: Db,
	studentId: string,
	window: { start: Date; end: Date },
): Promise<Map<string, VocabDayGroup>> {
	const rows = await db
		.select({
			day: VOCAB_DAY_EXPR,
			n: count(),
			totalMs: sql<string>`coalesce(sum(${vocabReviewLog.durationMs}), 0)`,
			lastAt: sql<string>`max(${vocabReviewLog.reviewedAt})`,
		})
		.from(vocabReviewLog)
		.where(
			and(
				eq(vocabReviewLog.studentId, studentId),
				// Chỉ đếm thẻ ĐÃ ÔN (vòng Review) — vòng Learn (học từ mới) của
				// cùng bảng log không tính là "ôn từ vựng" trên lịch sử.
				eq(vocabReviewLog.sessionKind, "review"),
				gte(vocabReviewLog.reviewedAt, window.start),
				lt(vocabReviewLog.reviewedAt, window.end),
			),
		)
		.groupBy(VOCAB_DAY_EXPR)
		.limit(VOCAB_SCAN_LIMIT);
	const grouped = new Map<string, VocabDayGroup>();
	for (const row of rows) {
		grouped.set(row.day, {
			count: Number(row.n),
			minutes: Math.round(Number(row.totalMs) / 60000),
			lastReviewedAt: new Date(Number(row.lastAt)),
		});
	}
	return grouped;
}

/** WHERE đã ép status=submitted nên submittedAt luôn có mặt; guard này chỉ
 * thu hẹp kiểu Drizzle (timestamp_ms nullable) — lọc phòng thủ row lạ. */
function isSubmittedRow(
	row: Omit<AttemptSourceRow, "submittedAt"> & { submittedAt: Date | null },
): row is Omit<AttemptSourceRow, "submittedAt"> & { submittedAt: Date } {
	return row.submittedAt !== null;
}

async function attemptRows(
	db: Db,
	studentId: string,
	orgId: string,
	window: { start: Date; end: Date },
): Promise<AttemptSourceRow[]> {
	const submittedRange = and(
		eq(quizAttempt.status, "submitted"),
		gte(quizAttempt.submittedAt, window.start),
		lt(quizAttempt.submittedAt, window.end),
	);
	const baseColumns = {
		id: quizAttempt.id,
		mode: quizAttempt.mode,
		submittedAt: quizAttempt.submittedAt,
		startedAt: quizAttempt.startedAt,
		correctCount: quizAttempt.correctCount,
		gradeScores: quizAttempt.gradeScores,
		gradedAt: quizAttempt.gradedAt,
		questionsSnapshot: quizAttempt.questionsSnapshot,
	};
	// Tự luyện: title/skill từ assignment_test. Attempt trỏ đề ĐÃ XOÁ (test_id
	// set null) KHÔNG vào lịch sử v1: không còn skill để xếp dòng — attempt
	// vẫn xem được qua route review attempts/:id như cũ.
	const practiceRows = await db
		.select({
			...baseColumns,
			skill: assignmentTest.skill,
			title: assignmentTest.title,
			writingPart: sql<string | null>`NULL`,
		})
		.from(quizAttempt)
		.innerJoin(
			assignmentTest,
			and(
				eq(assignmentTest.id, quizAttempt.testId),
				eq(assignmentTest.orgId, orgId),
			),
		)
		.where(
			and(
				eq(quizAttempt.orgId, orgId),
				eq(quizAttempt.studentId, studentId),
				eq(quizAttempt.mode, "practice"),
				submittedRange,
			),
		)
		.orderBy(desc(quizAttempt.submittedAt))
		.limit(HISTORY_SCAN_LIMIT);
	// Luồng assignment: title từ lượt giao, skill từ prompt — attempt bị xoá
	// cascade cùng lượt giao nên inner join luôn khớp (CHECK DB ép liên kết).
	const assignmentRows = await db
		.select({
			...baseColumns,
			skill: assignmentPrompt.skill,
			title: classAssignment.title,
			writingPart: assignmentPrompt.writingPart,
		})
		.from(quizAttempt)
		.innerJoin(
			classAssignment,
			and(
				eq(classAssignment.id, quizAttempt.assignmentId),
				eq(classAssignment.orgId, orgId),
			),
		)
		.innerJoin(
			assignmentPrompt,
			and(
				eq(assignmentPrompt.id, classAssignment.promptId),
				eq(assignmentPrompt.orgId, orgId),
			),
		)
		.where(
			and(
				eq(quizAttempt.orgId, orgId),
				eq(quizAttempt.studentId, studentId),
				eq(quizAttempt.mode, "assignment"),
				inArray(assignmentPrompt.skill, [...HISTORY_SKILLS]),
				visibleAssignmentFilter(new Date()),
				submittedRange,
			),
		)
		.orderBy(desc(quizAttempt.submittedAt))
		.limit(HISTORY_SCAN_LIMIT);
	return [...practiceRows, ...assignmentRows]
		.filter(isSubmittedRow)
		.map((row) => ({
			id: row.id,
			mode: row.mode,
			skill: row.skill,
			title: row.title,
			submittedAt: row.submittedAt,
			startedAt: row.startedAt,
			correctCount: row.correctCount,
			gradeScores: row.gradeScores,
			gradedAt: row.gradedAt,
			questionsSnapshot: row.questionsSnapshot,
			writingPart: row.writingPart,
		}));
}

function vocabToEntry(day: string, group: VocabDayGroup): HistoryEntry {
	return {
		id: `vocab-${day}`,
		kind: "vocab",
		skill: "vocabulary",
		title: `Ôn ${group.count} thẻ từ vựng`,
		date: day,
		submittedAt: group.lastReviewedAt.toISOString(),
		minutes: group.minutes,
		score: null,
		status: "auto",
		attemptId: null,
	};
}

type HistoryDayBucket = { count: number; minutes: number };

/** Dữ liệu đã trộn attempt + vocab theo ngày VN: `days` cho heatmap
 * (count = lượt nộp + SỐ THẺ đã ôn), `countsByDay` cho bảng tuần (đếm theo
 * thẻ — cùng quy ước heatmap), `entries` cho danh sách chi tiết (vocab gộp
 * 1 dòng/ngày). */
type MergedHistory = {
	days: Map<string, HistoryDayBucket>;
	countsByDay: Map<string, Record<HistorySkill, number>>;
	entries: HistoryEntry[];
};

function mergeHistory(
	entries: HistoryEntry[],
	vocabGroups: Map<string, VocabDayGroup>,
): MergedHistory {
	const days = new Map<string, HistoryDayBucket>();
	const countsByDay = new Map<string, Record<HistorySkill, number>>();
	const all: HistoryEntry[] = [...entries];
	for (const entry of entries) {
		const bucket = days.get(entry.date) ?? { count: 0, minutes: 0 };
		bucket.count += 1;
		bucket.minutes += entry.minutes;
		days.set(entry.date, bucket);
		const skillRow = countsByDay.get(entry.date) ?? {
			reading: 0,
			listening: 0,
			writing: 0,
			speaking: 0,
			vocabulary: 0,
		};
		skillRow[entry.skill] += 1;
		countsByDay.set(entry.date, skillRow);
	}
	for (const [day, group] of vocabGroups) {
		const bucket = days.get(day) ?? { count: 0, minutes: 0 };
		bucket.count += group.count;
		bucket.minutes += group.minutes;
		days.set(day, bucket);
		const skillRow = countsByDay.get(day) ?? {
			reading: 0,
			listening: 0,
			writing: 0,
			speaking: 0,
			vocabulary: 0,
		};
		skillRow.vocabulary += group.count;
		countsByDay.set(day, skillRow);
		all.push(vocabToEntry(day, group));
	}
	all.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
	return { days, countsByDay, entries: all };
}

/**
 * Router lịch sử học viên (phase 11, #378) — mount cạnh các router học viên
 * khác (`app.route("/api/student", …)`): bootstrapMiddleware bỏ qua
 * /api/student nên router PHẢI tự gắn `createStudentGuard`. Mọi số liệu chỉ
 * từ dữ liệu của CHÍNH học viên trong org đang chọn; ngày gom theo giờ Việt
 * Nam qua `vietnamDateKeyOf` (attempt 23:30 VN vẫn thuộc đúng ngày đó dù
 * worker chạy UTC).
 */
export function studentHistoryRoutes(deps: HistoryRouteDeps) {
	const router = new Hono<StudentEnv>();
	const requireStudent = createStudentGuard(deps);

	// use(path) của Hono chỉ khớp đúng path — đăng ký cả hai dạng như route
	// invoices (student.ts) để guard phủ /history và mọi path con.
	router.use("/history", requireStudent);
	router.use("/history/*", requireStudent);

	/**
	 * GET /api/student/history/month?ym=yyyy-mm — các ngày CÓ hoạt động của
	 * tháng (count/minutes); client dựng lưới cả tháng và coi ngày vắng = 0.
	 */
	router.get("/history/month", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();

		const ym = c.req.query("ym") || vietnamTodayISO().slice(0, 7);
		if (!YM_PATTERN.test(ym)) {
			return invalidParam(c, "invalid ym");
		}
		const { start, end } = vietnamWindowUtc(`${ym}-01`, 31);
		const merged = mergeHistory(
			(await attemptRows(db, s.id, orgId, { start, end })).map(attemptToEntry),
			await vocabDayGroups(db, s.id, { start, end }),
		);
		const days: HistoryDay[] = [...merged.days.entries()]
			.filter(([date, day]) => date.startsWith(ym) && day.count > 0)
			.map(([date, day]) => ({ date, count: day.count, minutes: day.minutes }))
			.sort((a, b) => (a.date < b.date ? -1 : 1));
		const response: HistoryMonthResponse = { ym, days };
		return c.json(response);
	});

	/**
	 * GET /api/student/history/week?monday=yyyy-mm-dd — bảng tuần theo kỹ
	 * năng; ngày bất kỳ được chuẩn hóa về Thứ Hai của tuần chứa nó.
	 */
	router.get("/history/week", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();

		const rawMonday = c.req.query("monday") || mondayOfISO(vietnamTodayISO());
		if (!isValidISODate(rawMonday)) {
			return invalidParam(c, "invalid monday");
		}
		const monday = mondayOfISO(rawMonday);
		const { start, end } = vietnamWindowUtc(monday, 7);
		const merged = mergeHistory(
			(await attemptRows(db, s.id, orgId, { start, end })).map(attemptToEntry),
			await vocabDayGroups(db, s.id, { start, end }),
		);

		// Ma trận [7 ngày][5 skill] + phút mỗi ngày — đếm theo ngày VN, thẻ
		// từ vựng đếm theo THẺ (cùng quy ước heatmap month).
		const counts: Record<HistorySkill, number[]> = {
			reading: [0, 0, 0, 0, 0, 0, 0],
			listening: [0, 0, 0, 0, 0, 0, 0],
			writing: [0, 0, 0, 0, 0, 0, 0],
			speaking: [0, 0, 0, 0, 0, 0, 0],
			vocabulary: [0, 0, 0, 0, 0, 0, 0],
		};
		const minutesByDay = [0, 0, 0, 0, 0, 0, 0];
		for (const [day, dayCounts] of merged.countsByDay) {
			const offset = Math.round(
				(new Date(`${day}T00:00:00Z`).getTime() -
					new Date(`${monday}T00:00:00Z`).getTime()) /
					86400000,
			);
			if (offset < 0 || offset > 6) continue;
			for (const skill of HISTORY_SKILLS) {
				counts[skill][offset] = (counts[skill][offset] ?? 0) + dayCounts[skill];
			}
			minutesByDay[offset] =
				(minutesByDay[offset] ?? 0) + (merged.days.get(day)?.minutes ?? 0);
		}
		const rows: HistoryWeekRow[] = [...HISTORY_SKILLS].map((skill) => ({
			skill,
			days: counts[skill],
		}));
		const response: HistoryWeekResponse = {
			monday,
			rows,
			minutes: minutesByDay,
		};
		return c.json(response);
	});

	/**
	 * GET /api/student/history?skill=&page= — danh sách chi tiết mới nhất
	 * trước, 20 dòng/trang; `skill` lọc đúng một kỹ năng (từ vựng là entry
	 * gộp theo ngày).
	 */
	router.get("/history", async (c) => {
		const { student: s, orgId } = c.get("studentCtx");
		const db: Db = deps.getDb();

		const rawSkill = c.req.query("skill");
		if (
			rawSkill !== undefined &&
			rawSkill !== "" &&
			!(HISTORY_SKILLS as readonly string[]).includes(rawSkill)
		) {
			return invalidParam(c, "invalid skill");
		}
		const rawPage = Number.parseInt(c.req.query("page") ?? "1", 10);
		if (!Number.isInteger(rawPage) || rawPage < 1) {
			return invalidParam(c, "invalid page");
		}
		const page = rawPage;

		// Cửa sổ rộng (từ 2020) gom toàn bộ lịch sử có thể có của học viên
		// rồi phân trang trong bộ nhớ — hai nguồn (attempt + vocab gộp ngày)
		// không có bảng chung nên SQL offset một mình không trộn được.
		const window = vietnamWindowUtc("2020-01-01", 365 * 30);
		const merged = mergeHistory(
			(await attemptRows(db, s.id, orgId, window)).map(attemptToEntry),
			await vocabDayGroups(db, s.id, window),
		);
		const filtered =
			rawSkill === undefined || rawSkill === ""
				? merged.entries
				: merged.entries.filter((entry) => entry.skill === rawSkill);
		const total = filtered.length;
		const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
		const response: HistoryListResponse = {
			entries: filtered.slice(
				(page - 1) * HISTORY_PAGE_SIZE,
				page * HISTORY_PAGE_SIZE,
			),
			page,
			pages,
			total,
		};
		return c.json(response);
	});

	return router;
}
