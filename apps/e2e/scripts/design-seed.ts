/**
 * Seed dữ liệu cho harness so sánh design v2 (plan #378, phase 1).
 *
 * Chạy SAU khi boot:api sẵn sàng (boot xoá local.db mỗi lần). Teacher đăng ký
 * qua UI thật (tạo org + bootstrap); student là auth thật qua portal + mail
 * log; phần còn lại seed thẳng DB theo tiền lệ Decision D6
 * (apps/e2e/specs/helpers-quiz.ts). Ghi ids vào
 * scripts/design-compare/.state/design-seed.json cho capture.mjs.
 */
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { chromium, type Page } from "@playwright/test";
import { orgIdForTeacherEmail } from "../specs/helpers";
import {
	type QuizSeedLesson,
	seedQuizFixture,
	seedSubmittedEssay,
} from "../specs/helpers-quiz";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "../specs/origins";
import {
	assertVerifiedEmailRedirect,
	clampTimeoutMs,
	redactCapabilityUrl,
	TransientNavError,
	withNavRetry,
} from "../src/design-seed-nav";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(
	HERE,
	"../../../scripts/design-compare/.state/design-seed.json",
);
const MAIL_LOG = fileURLToPath(
	new URL("../.mail-log.jsonl", import.meta.url).href,
);
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const teacherEmail = `design.teacher.${runToken}@test.local`;
const studentEmail = `design.student.${runToken}@test.local`;

const TITLE_READING = "Đọc hiểu: Một ngày của An";
const TITLE_LISTENING = "Nghe điền từ: Trái cây lạ";
const TITLE_WRITING = "Viết Task 1: Biểu đồ năng lượng";
const TITLE_SPEAKING = "Nói Part 2: Địa điểm yêu thích";
const TITLE_ESSAY = "Viết Task 2: Học từ xa";

// Trần 390s (< 420s SIGTERM của capture.mjs) để design-seed kịp ném timeline đã redact.
const SEED_START = Date.now();
const SEED_DEADLINE = SEED_START + 390_000;
let navRetryCount = 0;
const recordRetry = ({
	nextAttempt,
	label,
	lastEntry,
}: {
	nextAttempt: number;
	label: string;
	lastEntry: string;
}) => {
	navRetryCount += 1;
	console.warn(
		`[design-seed] retry #${navRetryCount} (${label}, attempt=${nextAttempt}): ${lastEntry}`,
	);
};

/** Vite dev lần đầu load có thể full-reload khi optimize deps → chờ cho
 * mạng lặng + một nhịp trước khi tương tác. */
async function gotoStable(page: Page, url: string) {
	await withNavRetry(
		(timeoutMs) => page.goto(url, { waitUntil: "load", timeout: timeoutMs }),
		{
			label: `gotoStable ${url}`,
			attempts: 2,
			perAttemptMs: 45_000,
			deadline: SEED_DEADLINE,
			onRetry: recordRetry,
		},
	);
	if (SEED_DEADLINE - Date.now() > 7_000) {
		try {
			await page.waitForLoadState("networkidle", {
				timeout: Math.min(
					8_000,
					Math.max(1_000, SEED_DEADLINE - Date.now() - 6_000),
				),
			});
		} catch {
			/* long-poll không lặng — bỏ qua */
		}
	}
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, 800);
	await promise;
}

async function readVerificationUrl(email: string): Promise<string> {
	for (let i = 0; i < 40; i++) {
		clampTimeoutMs(SEED_DEADLINE, 20_000, "readVerificationUrl");
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
	// Org + membership chỉ được tạo khi request GET /api/kernel ĐẦU TIÊN đi qua
	// bootstrapMiddleware (apps/server/src/app.ts) — request này chỉ bắn sau
	// khi vite dev transform xong graph dashboard (luôn lạnh mỗi lần boot,
	// warm() của harness chỉ phủ /login). Issue #397: blind-poll DB ~21.75s
	// thất bại trên máy đang tải vì AbortSignal.timeout(15000) + retry:false
	// của fetchKernelSnapshot biến kernel chậm thành abort KHÔNG có retry.
	// Collector duy nhất (đăng ký trước click, không promise mồ côi theo vòng)
	// ghi lại request/response/requestfailed có mốc thời gian; response →
	// DB (orgIdForTeacherEmail) là oracle; chỉ requestfailed hoặc window hết
	// mà chưa có request nào mới goto lại /dashboard bắn kernel mới.
	type KernelObs = {
		kind: "request" | "response" | "requestfailed";
		at: number;
		status?: number;
		failure?: string;
	};
	const kernelObs: KernelObs[] = [];
	const tKernel = Date.now();
	const isKernelGet = (url: string, method: string) =>
		method === "GET" && new URL(url).pathname === "/api/kernel";
	page.on("request", (r) => {
		if (isKernelGet(r.url(), r.method()))
			kernelObs.push({ kind: "request", at: Date.now() - tKernel });
	});
	page.on("response", (r) => {
		if (isKernelGet(r.url(), r.request().method()))
			kernelObs.push({
				kind: "response",
				status: r.status(),
				at: Date.now() - tKernel,
			});
	});
	page.on("requestfailed", (r) => {
		if (isKernelGet(r.url(), r.method()))
			kernelObs.push({
				kind: "requestfailed",
				failure: r.failure()?.errorText,
				at: Date.now() - tKernel,
			});
	});
	await page.getByRole("button", { name: "Create account" }).click();
	await page.waitForURL(/\/dashboard/, { timeout: 60_000 });

	// Vòng chờ kernel (tổng 120s): mỗi vòng chờ response HOẶC requestfailed
	// (client tự abort ≤15s nhờ AbortSignal.timeout) trong window 30s. Chỉ goto
	// /dashboard cứu khi (a) requestfailed — request đang bay ĐÃ chết, không
	// bao giờ goto giữa chừng vì navigation hủy cả fetch đang treo; (b) window
	// hết mà không hề có request nào (JS chưa boot). Observation `request`
	// (đã gửi) KHÔNG kích hoạt goto. ERR_ABORTED không phân biệt abort-15s và
	// navigation-cancel — observation ghi text thô, không khẳng định nguyên
	// nhân; nguyên nhân thật được suy từ tổ hợp observations khi fail.
	const kernelDeadline = Date.now() + 120_000;
	// Baseline quan sát: 0 (từ lúc click) — kernel có thể đã bắn trong lúc
	// waitForURL và vẫn đang bay khi vào vòng (review #397 F3: snapshot
	// kernelObs.length tại window đầu sẽ bỏ sót request đó).
	let seen = 0;
	while (!kernelObs.some((o) => o.kind === "response")) {
		const remaining = kernelDeadline - Date.now();
		if (remaining <= 0) break;
		const windowEnd = Date.now() + Math.min(30_000, remaining);
		while (Date.now() < windowEnd) {
			const fresh = kernelObs.slice(seen);
			if (
				fresh.some((o) => o.kind === "response" || o.kind === "requestfailed")
			)
				break;
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 250);
			await promise;
		}
		if (kernelObs.some((o) => o.kind === "response")) break;
		const fresh = kernelObs.slice(seen);
		const failed = fresh.some((o) => o.kind === "requestfailed");
		const sent = fresh.some((o) => o.kind === "request");
		seen = kernelObs.length;
		if (Date.now() >= kernelDeadline) break;
		if (!failed && !sent) {
			// JS chưa boot / chưa ai bắn request — goto để khởi động lại flow.
		} else if (!failed) {
			// Request vẫn đang bay (chưa tới 15s abort) — chờ tiếp trong window,
			// không goto: navigation sẽ hủy fetch đang bay và tự gây fail giả.
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 250);
			await promise;
			continue;
		}
		// Bắn lại kernel bằng goto (không reload — trang có thể đã chuyển sang
		// /login?returnUrl hoặc vừa full-reload); goto tự ném ERR_ABORTED thì
		// ghi thành observation và để vòng sau thử tiếp.
		try {
			await page.goto(`${WEB_ORIGIN}/dashboard`, { waitUntil: "load" });
		} catch (err) {
			kernelObs.push({
				kind: "requestfailed",
				failure: `goto /dashboard: ${String(err).slice(0, 120)}`,
				at: Date.now() - tKernel,
			});
		}
	}
	const kernelSummary = kernelObs.length
		? kernelObs
				.map((o) => {
					const at = `+${o.at}ms`;
					if (o.kind === "response") return `response ${o.status} ${at}`;
					if (o.kind === "requestfailed")
						return `requestfailed (${o.failure ?? "?"}) ${at}`;
					return `request sent ${at}`;
				})
				.join(" -> ")
		: "không thấy request /api/kernel nào trong 120s";
	let orgId: string;
	try {
		orgId = await orgIdForTeacherEmail(teacherEmail);
	} catch (err) {
		// Phân biệt nhánh nguyên nhân theo observations (#397): response 401 →
		// nghi cookie cross-origin (E2E_HOSTNAME=127.0.0.1); response 403 →
		// role gate; chỉ request/abort/timeout → timing hoặc JS chưa boot.
		throw new Error(
			`orgIdForTeacherEmail thất bại. Kernel observations: ${kernelSummary}`,
			{ cause: err },
		);
	}

	const db = createClient({
		url: `file:${fileURLToPath(new URL("../local.db", import.meta.url).href)}`,
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
	// #403: tách mảng lesson ra để tạo bản sao cho học viên thứ 2 (roster nhóm
	// cho modal điểm danh — cặp ảnh t-attendance).
	const classLessons: QuizSeedLesson[] = [
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
	];
	const fixture = await seedQuizFixture({
		orgId,
		orgName: "Lan IELTS Studio",
		className: "IELTS Foundation 5.5",
		studentName: "Phạm Bảo Ngọc",
		studentEmail,
		invitedClassName: "Writing Clinic",
		lessons: classLessons,
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

	// #403: học viên thứ 2 trong lớp chính → các buổi thành nhóm (attendees >= 2)
	// → link mở attendance modal render (`session-attendance-open-*`) và nút
	// commit check-in 1:1 (mutating) biến mất khỏi trang. Tên trùng roster lớp
	// c2 của design mock (s1 Nguyễn Thu Hà + s3 Phạm Bảo Ngọc) để ảnh khớp;
	// email có runToken vì unique index student(org_id, lower(trim(email))).
	const now = Date.now();
	const rosterStudentId = crypto.randomUUID();
	await db.execute({
		sql: `INSERT INTO student (id, org_id, name, email, onboarding_completed_at, created_at)
			VALUES (?, ?, 'Nguyễn Thu Hà', ?, ?, ?)`,
		args: [
			rosterStudentId,
			orgId,
			`design.roster2.${runToken}@test.local`,
			now,
			now,
		],
	});
	const rosterEnrollmentId = crypto.randomUUID();
	await db.execute({
		sql: `INSERT INTO enrollment (id, org_id, class_id, student_id, status, created_at)
			VALUES (?, ?, ?, ?, 'active', ?)`,
		args: [rosterEnrollmentId, orgId, fixture.classId, rosterStudentId, now],
	});
	for (const l of classLessons) {
		const weekday = new Date(`${l.date}T00:00:00Z`).getUTCDay();
		await db.execute({
			sql: `INSERT INTO lesson (id, org_id, class_id, enrollment_id, day, time, dur, date, status, topic, created_at)
				VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			args: [
				crypto.randomUUID(),
				orgId,
				fixture.classId,
				rosterEnrollmentId,
				weekday === 0 ? 7 : weekday,
				l.time,
				l.dur,
				l.date,
				l.status,
				l.topic,
				now,
			],
		});
	}

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
		await studentPage.click("#tab-signup", {
			timeout: clampTimeoutMs(SEED_DEADLINE, 15_000, "student #tab-signup"),
		});
	} catch (err) {
		try {
			const dbg = path.resolve(
				HERE,
				"../../../scripts/design-compare/.state/debug",
			);
			mkdirSync(dbg, { recursive: true, mode: 0o700 });
			chmodSync(dbg, 0o700);
			const loginShot = path.join(dbg, "student-login.png");
			await studentPage.screenshot({ path: loginShot, timeout: 5_000 });
			chmodSync(loginShot, 0o600);
			const safeBody = redactCapabilityUrl(await studentPage.content()).slice(
				0,
				600,
			);
			console.error(
				`[design-seed] student login không render đúng. url=${redactCapabilityUrl(studentPage.url())}\nbody=${safeBody}`,
			);
		} catch {
			/* debug capture không được che lỗi gốc hoặc lố SEED_DEADLINE */
		}
		throw err;
	}
	await studentPage.fill("#signup-name", "Phạm Bảo Ngọc");
	await studentPage.fill("#signup-email", studentEmail);
	await studentPage.fill("#signup-password", PASSWORD);
	const signUpTimeout = clampTimeoutMs(
		SEED_DEADLINE,
		30_000,
		"student sign-up",
	);
	const signUpResPromise = studentPage.waitForResponse(
		(r) => {
			const u = new URL(r.url());
			return (
				r.request().method() === "POST" &&
				u.origin === API_ORIGIN &&
				u.pathname === "/api/auth/sign-up/email"
			);
		},
		{ timeout: signUpTimeout },
	);
	signUpResPromise.catch(() => {});
	const [signUpRes] = await Promise.all([
		signUpResPromise,
		studentPage
			.getByRole("button", { name: "Tạo tài khoản" })
			.click({ timeout: signUpTimeout }),
	]);
	if (!signUpRes.ok()) {
		throw new Error(
			`[design-seed] student sign-up thất bại: HTTP ${signUpRes.status()}`,
		);
	}
	// Đóng nguyên tử renderer /login để chặn SignUpForm chạy getSession() ->
	// window.location.assign("/") ở nền mà không đua navigation (#652 RT-1).
	await studentPage.close();

	const tVerifyStart = Date.now();
	const verifyUrl = await readVerificationUrl(studentEmail);
	// #652: xác thực qua API trực tiếp (maxRedirects: 0) thay vì page.goto qua
	// Vite dev — không còn chết vì cold-transform module graph trên máy đang tải.
	await withNavRetry(
		async (timeoutMs) => {
			const res = await studentCtx.request.get(verifyUrl, {
				maxRedirects: 0,
				timeout: timeoutMs,
			});
			if (res.status() >= 500) {
				throw new TransientNavError(`verify-email HTTP ${res.status()}`);
			}
			const cookies = await studentCtx.cookies(API_ORIGIN);
			assertVerifiedEmailRedirect({
				status: res.status(),
				location: res.headers().location,
				studentOrigin: STUDENT_ORIGIN,
				cookies,
			});
			const sessRes = await studentCtx.request.get(
				`${API_ORIGIN}/api/auth/get-session`,
				{
					timeout: clampTimeoutMs(SEED_DEADLINE, 15_000, "student get-session"),
				},
			);
			if (sessRes.status() >= 500) {
				throw new TransientNavError(`get-session HTTP ${sessRes.status()}`);
			}
			if (!sessRes.ok()) {
				throw new Error(`get-session HTTP ${sessRes.status()}`);
			}
			const sessBody = (await sessRes.json()) as {
				user?: { emailVerified?: boolean };
			} | null;
			if (sessBody?.user?.emailVerified !== true) {
				throw new Error(
					"student session chưa có emailVerified=true sau verify-email",
				);
			}
		},
		{
			label: `verify-email ${verifyUrl}`,
			attempts: 2,
			perAttemptMs: 30_000,
			deadline: SEED_DEADLINE,
			onRetry: recordRetry,
		},
	);
	const verifyMs = Date.now() - tVerifyStart;
	// 8) Student bắt đầu 4 đề (reading/listening/writing/speaking) → attempt ids.
	// #652: gọi thẳng POST /api/student/assignments/:id/quiz/start qua studentCtx.request
	// (idempotent, chia sẻ cookie phiên với studentCtx, không phụ thuộc Vite dev
	// cold-transform hay full-reload khi optimizeDeps bundle media/recorder).
	const tQuizzesStart = Date.now();
	const attemptIds: Record<string, string> = {};
	const quizTargets = [
		["reading", 0],
		["listening", 1],
		["writing", 2],
		["speaking", 3],
	] as const;
	for (const [skill, idx] of quizTargets) {
		const assignmentId = fixture.assignmentIds[idx];
		if (!assignmentId) {
			throw new Error(
				`design-seed fixture thiếu assignment #${idx} (${skill})`,
			);
		}
		attemptIds[skill] = await withNavRetry(
			async (timeoutMs) => {
				const res = await studentCtx.request.post(
					`${API_ORIGIN}/api/student/assignments/${encodeURIComponent(assignmentId)}/quiz/start`,
					{
						data: {},
						headers: { Origin: STUDENT_ORIGIN },
						timeout: timeoutMs,
						maxRedirects: 0,
					},
				);
				if (res.status() >= 500) {
					throw new TransientNavError(
						`quiz/start HTTP ${res.status()} cho ${skill}`,
					);
				}
				if (!res.ok()) {
					throw new Error(`quiz/start HTTP ${res.status()} cho ${skill}`);
				}
				const body = (await res.json()) as { attemptId?: string };
				if (!body.attemptId) {
					throw new Error(`quiz/start không trả attemptId cho ${skill}`);
				}
				return body.attemptId;
			},
			{
				label: `quiz/start ${skill}`,
				attempts: 2,
				perAttemptMs: 30_000,
				deadline: SEED_DEADLINE,
				onRetry: recordRetry,
			},
		);
	}
	const quizzesMs = Date.now() - tQuizzesStart;

	await ctx.close();
	await studentCtx.close();

	const outDir = path.dirname(OUT_FILE);
	mkdirSync(outDir, { recursive: true, mode: 0o700 });
	chmodSync(outDir, 0o700);
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
		seedDurationMs: Date.now() - SEED_START,
		verifyDurationMs: verifyMs,
		quizzesDurationMs: quizzesMs,
		navRetryCount,
		apiOrigin: API_ORIGIN,
		webOrigin: WEB_ORIGIN,
		studentOrigin: STUDENT_ORIGIN,
	};
	writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, { mode: 0o600 });
	chmodSync(OUT_FILE, 0o600);
	console.log(
		`[design-seed] xong → ${OUT_FILE} (totalMs=${out.seedDurationMs}, verifyMs=${verifyMs}, quizzesMs=${quizzesMs}, retries=${navRetryCount})`,
	);
	console.log(
		`[design-seed] attempts: reading=${out.attemptReadingId} listening=${out.attemptListeningId} writing=${out.attemptWritingId} speaking=${out.attemptSpeakingId} grading=${out.attemptId}`,
	);
} finally {
	await browser.close();
}
