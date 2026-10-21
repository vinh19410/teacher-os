/**
 * Seed dữ liệu cho harness so sánh design v2 (plan #378, phase 1).
 *
 * Chạy SAU khi boot:api sẵn sàng (boot xoá local.db mỗi lần). Teacher đăng ký
 * qua UI thật (tạo org + bootstrap); student là auth thật qua portal + mail
 * log; phần còn lại seed thẳng DB theo tiền lệ Decision D6
 * (apps/e2e/specs/helpers-quiz.ts). Ghi ids vào
 * scripts/design-compare/.state/design-seed.json cho capture.mjs.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium, type Page } from "@playwright/test";
import { orgIdForTeacherEmail } from "../specs/helpers";
import { seedQuizFixture, seedSubmittedEssay } from "../specs/helpers-quiz";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "../specs/origins";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(
	HERE,
	"../../../scripts/design-compare/.state/design-seed.json",
);
const MAIL_LOG = new URL("../.mail-log.jsonl", import.meta.url).pathname;
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `design.teacher.${runToken}@test.local`;
const studentEmail = `design.student.${runToken}@test.local`;

const TITLE_READING = "Đọc hiểu: Một ngày của An";
const TITLE_LISTENING = "Nghe điền từ: Trái cây lạ";
const TITLE_WRITING = "Viết Task 1: Biểu đồ năng lượng";
const TITLE_SPEAKING = "Nói Part 2: Địa điểm yêu thích";
const TITLE_ESSAY = "Viết Task 2: Học từ xa";

/** Vite dev lần đầu load có thể full-reload khi optimize deps → chờ cho
 * mạng lặng + một nhịp trước khi tương tác. */
async function gotoStable(page: Page, url: string) {
	await page.goto(url, { waitUntil: "load" });
	try {
		await page.waitForLoadState("networkidle", { timeout: 8_000 });
	} catch {
		/* long-poll không lặng — bỏ qua */
	}
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 800);
	await promise;
}

async function readVerificationUrl(email: string): Promise<string> {
	for (let i = 0; i < 40; i++) {
		try {
			const lines = readFileSync(MAIL_LOG, "utf8")
				.split("\n")
				.filter((l) => l.trim().length > 0);
			for (const l of lines) {
				const entry = JSON.parse(l) as {
					to?: string;
					url?: string;
				};
				if (
					entry.to?.trim().toLowerCase() === email.toLowerCase() &&
					entry.url
				) {
					return entry.url;
				}
			}
		} catch {
			/* log chưa có */
		}
		const { promise, resolve } = Promise.withResolvers<void>();
		setTimeout(resolve, 500);
		await promise;
	}
	throw new Error(`không thấy email verify cho ${email}`);
}

const browser = await chromium.launch();
try {
	const ctx = await browser.newContext({
		timezoneId: "Asia/Ho_Chi_Minh",
	});
	const page = await ctx.newPage();

	// 1) Teacher đăng ký qua UI → org bootstrap.
	await page.goto(`${WEB_ORIGIN}/login`);
	await page.fill("#su-name", "Nguyễn Hoàng Lan");
	await page.fill("#su-email", teacherEmail);
	await page.fill("#su-password", PASSWORD);
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	// Tên org + class hiển thị đẹp cho ảnh so sánh.
	await db.execute({
		sql: "UPDATE organization SET name = 'Lan IELTS Studio' WHERE id = ?",
		args: [orgId],
	});

	// 2) Fixture bài giảng + học viên + đề theo từng skill (DB trực tiếp).
	const today = new Date();
	const daysFromToday = (n: number) =>
		new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10);
	const fixture = await seedQuizFixture({
		orgId,
		orgName: "Lan IELTS Studio",
		className: "IELTS Foundation 5.5",
		studentName: "Phạm Bảo Ngọc",
		studentEmail,
		invitedClassName: "Writing Clinic",
		lessons: [
			{
				date: daysFromToday(-7),
				time: "18:00",
				dur: 90,
				status: "completed",
				topic: "Listening Section 1–2",
			},
			{
				date: daysFromToday(-3),
				time: "18:00",
				dur: 90,
				status: "completed",
				topic: "Vocabulary: Environment",
			},
			{
				date: daysFromToday(0),
				time: "18:00",
				dur: 90,
				status: "upcoming",
				topic: "Reading: Matching headings",
			},
			{
				date: daysFromToday(4),
				time: "18:00",
				dur: 90,
				status: "upcoming",
				topic: "Writing Task 1 — Line graphs",
			},
			{
				date: daysFromToday(9),
				time: "18:00",
				dur: 90,
				status: "cancelled",
				topic: "Speaking Part 1 warm-up",
			},
		],
		prompts: [
			{
				title: TITLE_READING,
				skill: "reading",
				part: "p1",
				type: "mcq",
				note: "Chọn một đáp án cho mỗi câu.",
				passage:
					"<p>The Bronze Age settlement predates the river diversion. Archaeologists found evidence of trade with Crete.</p>",
				questions: [
					{
						stem: "Việc chuyển dòng sông xảy ra trước hay sau thời kỳ đồ đồng?",
						opts: ["Trước", "Sau", "Không đề cập", "Chồng thời gian"],
						answer: "Sau",
						alts: "",
					},
					{
						stem: "Bằng chứng thương mại với Crete được tìm thấy ở đâu?",
						opts: [
							"Trong lăng mộ",
							"Trong khu định cư",
							"Trên tàu đắm",
							"Trong hang động",
						],
						answer: "Trong khu định cư",
						alts: "",
					},
				],
			},
			{
				title: TITLE_LISTENING,
				skill: "listening",
				part: "s1",
				type: "sent",
				note: "Điền MỘT TỪ hoặc một con số cho mỗi chỗ trống.",
				passage: "<p>Section 1 — Đặt phòng câu lạc bộ đọc sách.</p>",
				questions: [
					{
						stem: "Booking reference: ______",
						opts: null,
						answer: "KT4471",
						alts: "kt4471",
					},
					{
						stem: "Số điện thoại liên hệ: ______",
						opts: null,
						answer: "0938224477",
						alts: "",
					},
				],
			},
			{
				title: TITLE_WRITING,
				skill: "writing",
				part: "task1",
				type: "chart",
				note: "Viết ít nhất 150 từ.",
				passage: "",
				prompt:
					"<p>Biểu đồ dưới đây cho thấy mức tiêu thụ năng lượng của các hộ gia đình tại Việt Nam giai đoạn 2000–2020. Hãy tóm tắt thông tin và chọn lọc các đặc điểm chính.</p>",
				questions: [],
			},
			{
				title: TITLE_SPEAKING,
				skill: "speaking",
				part: "part2",
				type: "place",
				note: "Nói 1–2 phút về chủ đề.",
				passage: "",
				cueTopic: "một địa điểm bạn thích đến",
				cuePoints:
					"đó là nơi nào\nbạn thường đến khi nào\nbạn thích nó vì lý do gì",
				questions: [],
			},
			{
				title: TITLE_ESSAY,
				skill: "writing",
				part: "task2",
				type: "essay",
				note: "Viết ít nhất 250 từ.",
				passage: "",
				prompt:
					"<p>Some people believe remote learning widens educational inequality. To what extent do you agree or disagree?</p>",
				questions: [],
			},
		],
	});

	// Lịch v2 cho lớp chính: không có schedule + start_date thì projection
	// trả null → class detail rơi vào bảng legacy, KHÔNG có nút "Điểm danh"
	// → harness không chụp được modal điểm danh (t-attendance).
	await db.execute({
		sql: "UPDATE class SET schedule = ?, start_date = ?, sessions_total = 5 WHERE id = ?",
		args: [
			JSON.stringify({ days: [1, 3, 5], start: "18:00", end: "19:30" }),
			daysFromToday(-7),
			fixture.classId,
		],
	});

	// 3) Attempt Writing đã nộp → màn chấm bài.
	// Lint cấm non-null assertion — kiểm tường minh để lỗi fixture rõ nghĩa.
	const writingAssignmentId = fixture.assignmentIds[4];
	if (!writingAssignmentId) {
		throw new Error("design-seed fixture thiếu assignment #4 (Writing)");
	}
	const attemptId = await seedSubmittedEssay({
		orgId,
		assignmentId: writingAssignmentId,
		studentId: fixture.studentId,
		essay:
			"<p>Remote learning has widened the gap between students with stable internet access and those without. In my view, the shift online amplifies existing inequalities rather than creating new ones.</p>",
	});

	// 4) Hoá đơn: paid / partial / unpaid quá hạn cho list + detail + /pay.
	const invoicePaid = crypto.randomUUID();
	const invoicePartial = crypto.randomUUID();
	const invoiceUnpaid = crypto.randomUUID();
	const now = Date.now();
	const duePaid = daysFromToday(-20);
	const duePartial = daysFromToday(7);
	const dueUnpaid = daysFromToday(-5);
	const payToken = `cmp${runToken.replace(/[^a-z0-9]/g, "")}`;
	for (const [id, amount, paid, status, due, token] of [
		[invoicePaid, 4_800_000, 4_800_000, "paid", duePaid, `${payToken}a`],
		[invoicePartial, 6_500_000, 3_000_000, "partial", duePartial, payToken],
		[invoiceUnpaid, 3_600_000, 0, "unpaid", dueUnpaid, `${payToken}c`],
	] as const) {
		await db.execute({
			sql: `INSERT INTO invoice (id, org_id, student_id, enrollment_id, amount, status, due, note, date, type, method, payment_code, pay_token, paid_amount, created_at)
				VALUES (?,?,?,?,?,?,?,?,?, 'tuition', '—', ?, ?, ?, ?)`,
			args: [
				id,
				orgId,
				fixture.studentId,
				"",
				amount,
				status,
				due,
				"Học phí kỳ Fall",
				daysFromToday(-25),
				`TOS${id.slice(0, 8).toUpperCase()}`,
				token,
				paid,
				now,
			],
		});
	}

	// 5) Syllabus template + modules + lessons.
	const syllabusId = crypto.randomUUID();
	await db.execute({
		sql: `INSERT INTO syllabus (id, org_id, name, level, type, skills, description, total_lessons, created_at, class_id)
			VALUES (?,?, 'IELTS Foundation 5.5+', '5.5–6.5', 'ielts', '["Reading","Listening","Writing","Speaking"]', 'Lộ trình nền tảng lên band 6.5', 9, ?, NULL)`,
		args: [syllabusId, orgId, now],
	});
	const modules = [
		{
			title: "Module 1 — Chẩn đoán",
			lessons: ["Placement mock", "Reading strategies", "Listening map"],
		},
		{
			title: "Module 2 — Academic Reading",
			lessons: ["T/F/NG deep dive", "Matching headings", "Summary completion"],
		},
		{
			title: "Module 3 — Writing",
			lessons: ["Task 1 visuals", "Task 2 argument", "Final mock test"],
		},
	];
	for (const [mIdx, mod] of modules.entries()) {
		const moduleId = crypto.randomUUID();
		await db.execute({
			sql: `INSERT INTO syllabus_module (id, org_id, syllabus_id, title, description, position, created_at)
				VALUES (?,?,?,?,'',?,?)`,
			args: [moduleId, orgId, syllabusId, mod.title, mIdx, now],
		});
		for (const [lIdx, lTitle] of mod.lessons.entries()) {
			await db.execute({
				sql: `INSERT INTO syllabus_lesson (id, org_id, module_id, title, objectives, materials, kind, status, position, created_at)
					VALUES (?,?,?,?,'','', 'lesson', 'upcoming', ?, ?)`,
				args: [crypto.randomUUID(), orgId, moduleId, lTitle, lIdx, now],
			});
		}
	}

	// 6) Thêm học viên cho list students không trống.
	for (const name of ["Lê Quang Huy", "Trần Minh Anh", "Đỗ Khánh Linh"]) {
		await db.execute({
			sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
				VALUES (?, ?, ?, ?, ?, ?)`,
			args: [
				crypto.randomUUID(),
				orgId,
				name,
				`${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
				now,
				now,
			],
		});
	}
	db.close();

	// 7) Student auth thật: signup portal + verify qua mail log.
	// Cookie localhost không phân biệt port — session giáo viên ở ctx trên
	// sẽ chặn cổng student ("Đây là tài khoản giáo viên"), nên dùng ctx mới.
	const studentCtx = await browser.newContext({
		timezoneId: "Asia/Ho_Chi_Minh",
	});
	const studentPage = await studentCtx.newPage();
	await gotoStable(studentPage, `${STUDENT_ORIGIN}/login`);
	try {
		await studentPage.click("#tab-signup", { timeout: 15_000 });
	} catch (err) {
		const dbg = path.resolve(
			HERE,
			"../../../scripts/design-compare/.state/debug",
		);
		mkdirSync(dbg, { recursive: true });
		await studentPage.screenshot({ path: path.join(dbg, "student-login.png") });
		console.error(
			`[design-seed] student login không render đúng. url=${studentPage.url()}\nbody=${(await studentPage.content()).slice(0, 600)}`,
		);
		throw err;
	}
	await studentPage.fill("#signup-name", "Phạm Bảo Ngọc");
	await studentPage.fill("#signup-email", studentEmail);
	await studentPage.fill("#signup-password", PASSWORD);
	await studentPage.getByRole("button", { name: "Tạo tài khoản" }).click();
	const verifyUrl = await readVerificationUrl(studentEmail);
	await studentPage.goto(verifyUrl);
	await studentPage.getByRole("button", { name: "Vào cổng học viên" }).click();
	await studentPage.waitForURL(new RegExp(`^${STUDENT_ORIGIN}`), {
		timeout: 30_000,
	});

	// 8) Student bắt đầu 4 đề (reading/listening/writing/speaking) → attempt ids.
	// Link "Làm bài" sang /learn/quizzes/<assignmentId>; nút "Bắt đầu" POST
	// …/quiz/start trả attemptId (URL không đổi).
	const attemptIds: Record<string, string> = {};
	for (const [skill, title] of [
		["reading", TITLE_READING],
		["listening", TITLE_LISTENING],
		["writing", TITLE_WRITING],
		["speaking", TITLE_SPEAKING],
	] as const) {
		await gotoStable(studentPage, `${STUDENT_ORIGIN}/`);
		const row = studentPage.getByRole("link", {
			name: `Làm bài: ${title}`,
		});
		await row.waitFor({ timeout: 20_000 });
		const navPromise = studentPage.waitForURL(/\/learn\/quizzes\/[^/]+$/, {
			timeout: 30_000,
		});
		await row.click();
		await navPromise;
		const startDialog = studentPage.getByRole("alertdialog", {
			name: "Bắt đầu làm bài",
		});
		const startRes = studentPage.waitForResponse(
			(r) => r.request().method() === "POST" && r.url().endsWith("/quiz/start"),
			{ timeout: 30_000 },
		);
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
		const res = await startRes;
		const body = (await res.json()) as { attemptId?: string };
		if (!body.attemptId) {
			throw new Error(`quiz/start không trả attemptId cho ${skill}`);
		}
		attemptIds[skill] = body.attemptId;
	}

	await ctx.close();
	await studentCtx.close();

	mkdirSync(path.dirname(OUT_FILE), { recursive: true });
	const out = {
		runToken,
		teacherEmail,
		teacherPassword: PASSWORD,
		studentEmail,
		studentPassword: PASSWORD,
		orgId,
		classId: fixture.classId,
		studentClassId: fixture.classId,
		invitedClassId: fixture.invitedClassId,
		studentId: fixture.studentId,
		assignmentIds: fixture.assignmentIds,
		attemptId,
		attemptReadingId: attemptIds.reading ?? "",
		attemptListeningId: attemptIds.listening ?? "",
		attemptWritingId: attemptIds.writing ?? "",
		attemptSpeakingId: attemptIds.speaking ?? "",
		invoiceId: invoicePartial,
		invoicePaidId: invoicePaid,
		payToken,
		syllabusId,
		seededAt: new Date().toISOString(),
		apiOrigin: API_ORIGIN,
		webOrigin: WEB_ORIGIN,
		studentOrigin: STUDENT_ORIGIN,
	};
	writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`);
	console.log(`[design-seed] xong → ${OUT_FILE}`);
	console.log(
		`[design-seed] attempts: reading=${out.attemptReadingId} listening=${out.attemptListeningId} writing=${out.attemptWritingId} speaking=${out.attemptSpeakingId} grading=${out.attemptId}`,
	);
} finally {
	await browser.close();
}
