import { existsSync, readFileSync } from "node:fs";
import { type Client, createClient } from "@libsql/client";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import {
	ADMIN_ORIGIN,
	API_ORIGIN,
	STUDENT_ORIGIN,
	WEB_ORIGIN,
} from "./origins";
/** Sign up through the real UI; a fresh context lands on the default
 * "Create account" tab (apps/web/src/routes/login.tsx), and the first
 * authenticated GET /api/kernel bootstraps the org server-side.
 * Opts override the generated identity (profile.spec seeds deterministic
 * emails for DB lookups); defaults keep existing specs unchanged.
 * Returns the email used so specs can address the created user row. */
export async function signUpViaUi(
	page: Page,
	opts: { name?: string; email?: string; password?: string } = {},
): Promise<string> {
	const email =
		opts.email ??
		`e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
	await page.goto("/login");
	await page.locator("#su-name").fill(opts.name ?? "E2E Teacher");
	await page.locator("#su-email").fill(email);
	await page.locator("#su-password").fill(opts.password ?? "password-8chars");
	await page.getByRole("button", { name: "Create account" }).click();
	// Cold vite dev on CI can make the sign-up + bootstrap round-trip slow;
	// the default 5s expect timeout is too tight for this flow-critical wait.
	await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
	return email;
}

async function withBusyRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (err: unknown) {
			if (i === retries - 1) throw err;
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 50 * (i + 1));
			await promise;
		}
	}
	throw new Error("retry exhausted");
}

export interface VerificationEmailEntry {
	to: string;
	subject?: string;
	url?: string;
	kind?: string;
	error?: string;
	at?: string;
	// Plan TOS-21 (#454): recordingMailer lưu thêm header mới của thư thông báo.
	replyTo?: string | null;
	fromName?: string | null;
	// Plan TOS-22 (#463): recordingMailer đánh dấu failed: true cho thư thông báo tới @bounce.test.
	failed?: boolean;
}

export async function readVerificationEmails(): Promise<
	VerificationEmailEntry[]
> {
	const logPath = new URL("../.mail-log.jsonl", import.meta.url).pathname;
	return withBusyRetry(async () => {
		if (!existsSync(logPath)) return [];
		const content = readFileSync(logPath, "utf8");
		const lines = content.split("\n").filter((l) => l.trim().length > 0);
		return lines.map((l) => JSON.parse(l) as VerificationEmailEntry);
	});
}

/** Bóc URL verify từ mail log cho `email` (poll 20×500ms), mở link và bấm
 * CTA trên trang xác nhận — landing phải là /verify-email?verified=ok của
 * cổng student, không còn landing thẳng gate. */
export async function verifyStudentEmailFromMailLog(
	page: Page,
	email: string,
): Promise<void> {
	let verifyUrl: string | undefined;
	for (let i = 0; i < 20; i++) {
		const emails = await readVerificationEmails();
		const entry = emails.find(
			(e) =>
				e.to.trim().toLowerCase() === email.trim().toLowerCase() && !!e.url,
		);
		if (entry?.url) {
			verifyUrl = entry.url;
			break;
		}
		await page.waitForTimeout(500);
	}
	expect(verifyUrl, "verification email logged").toBeDefined();

	await page.goto(verifyUrl as string);
	await expect(page).toHaveURL(/\/verify-email\?verified=ok/);
	await expect(page.getByText("Email đã được xác thực")).toBeVisible();

	await page.getByRole("button", { name: "Vào cổng học viên" }).click();
	// Pin đúng origin student đích; gate tự quyết /onboarding hay portal.
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_ORIGIN}`), {
		timeout: 20_000,
	});
}

/** Org đầu tiên của giáo viên (bootstrap tạo ở request /api đầu tiên sau
 * đăng ký, có thể sau khi URL đã sang /dashboard) — retry tới khi bootstrap
 * xong thay vì throw ngay (flaky một lần query). */
export async function orgIdForTeacherEmail(email: string): Promise<string> {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	try {
		const res = await withBusyRetry(async () => {
			const rs = await client.execute({
				sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
					WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
				args: [email],
			});
			if (!rs.rows[0]) throw new Error("no org yet, waiting for bootstrap");
			return rs;
		}, 30);
		return String(res.rows[0]?.id);
	} finally {
		client.close();
	}
}

/** Org đầu tiên trong DB — fallback khi seed không truyền teacherEmail. */
async function firstOrgId(client: Client): Promise<string> {
	const orgRow = await withBusyRetry(async () => {
		const res = await client.execute(
			"SELECT id FROM organization ORDER BY created_at ASC, id ASC LIMIT 1",
		);
		if (!res.rows[0]) {
			throw new Error("seedStudent: no org yet, waiting for bootstrap");
		}
		return res;
	}, 30);
	return String(orgRow.rows[0]?.id);
}

/**
 * Seed a student record directly into local.db for E2E tests (Decision D6).
 * Resolves the target org from the logged-in teacher's email, or falls back
 * to the earliest global org.
 */
export async function seedStudent(opts: {
	teacherEmail?: string;
	name: string;
	email?: string;
	phone?: string;
	/** Đặt onboarding_completed_at để portal bỏ wizard onboarding (TOS-21). */
	onboarded?: boolean;
}): Promise<{ id: string; name: string; email: string }> {
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	try {
		const slug =
			opts.name
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "") || "student";
		const email = opts.email ?? `${slug}.${Date.now()}@e2e.test`;

		const orgId = opts.teacherEmail
			? // Org lookup tự mở client riêng và retry tới khi bootstrap xong.
				await orgIdForTeacherEmail(opts.teacherEmail)
			: // Fallback dùng client đang mở của seedStudent.
				await firstOrgId(client);

		const id = crypto.randomUUID();
		const now = Date.now();

		await withBusyRetry(() =>
			client.execute({
				sql: `INSERT INTO student (id, org_id, name, phone, email, zalo, parent_name, parent_phone, onboarding_completed_at, created_at)
					VALUES (?,?,?,?,?,?,?,?,?,?)`,
				args: [
					id,
					orgId,
					opts.name,
					opts.phone ?? "0901234567",
					email,
					opts.phone ?? "0901234567",
					"",
					"",
					...(opts.onboarded ? [now] : [null]),
					now,
				],
			}),
		);

		return { id, name: opts.name, email };
	} finally {
		client.close();
	}
}
/** Navigate to a class's merged "Sessions & practice" tab (#391) — it renders
 * the session cards and the assigned-practice accordion. Text counts must
 * scope to the tab while on it. */
export async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	// Redesign #349: the classes list is a card grid — the class title is the
	// only h3 on the page; clicking it bubbles to the card button.
	const classRow = page.locator("h3", { hasText: className });
	await expect(classRow).toBeVisible();
	await classRow.click();
	await page
		.getByRole("tab", { name: "Sessions & practice", exact: true })
		.click();
}

/** Navigate to a class's "Học viên" tab (#391) — "+ Thêm học viên vào lớp",
 * "Sửa" học phí và chuỗi `Học phí: …` sống ở tab này. */
export async function openClassRosterTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	const classRow = page.locator("h3", { hasText: className });
	await expect(classRow).toBeVisible();
	await classRow.click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
}

/** Today as yyyy-mm-dd in Vietnam (UTC+7) via Intl parts — never a UTC slice
 * or machine-local Date, which drift a day between 00:00–07:00 VN. */
export function vietnamTodayISO(): string {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const get = (type: string) =>
		parts.find((p) => p.type === type)?.value ?? "00";
	return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Weekday (Mon=0 … Sun=6, schedule.days convention) of a yyyy-mm-dd string,
 * parsed at UTC midnight — never Date#getDay() on the runner's machine. */
export function vnWeekdayMon0(iso: string): number {
	return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** yyyy-mm-dd + n days, UTC-anchored — ISO strings carry no DST, so plain
 * day-millisecond math is exact and machine-local timezones never leak. */
export function addDaysISO(iso: string, n: number): string {
	return new Date(
		new Date(`${iso}T00:00:00Z`).getTime() + n * 24 * 60 * 60 * 1000,
	)
		.toISOString()
		.slice(0, 10);
}

/** Monday-start week containing `iso` (week-grid convention). */
export function mondayWeekStartISO(iso: string): string {
	return addDaysISO(iso, -vnWeekdayMon0(iso));
}

/** yyyy-mm-dd của hôm nay (giờ VN) + n ngày — specs học phí (#322) dùng hạn
 * tương đối thay vì ngày cố định để badge "Quá hạn" suy ra từ `due` không tự
 * lật trạng thái khi lịch chạy qua mốc nào đó. */
export function isoInDaysFromTodayVN(n: number): string {
	return addDaysISO(vietnamTodayISO(), n);
}

/** Navigate the /schedule grid to an explicit week. Issue #121: specs must
 * never depend on "current week" — on a VN Sunday a "start tomorrow" seed
 * lands its dated rows in the NEXT Monday-start week, so week-scoped
 * assertions pin the ?week= param instead. */
export async function gotoWeek(
	page: Page,
	weekStartISO: string,
): Promise<void> {
	await page.goto(`/schedule?week=${weekStartISO}`);
}

/** Fill a rich text editor (Tiptap contenteditable) by its Field label.
 * Works because RichTextEditor wires aria-labelledby through the Field label
 * id — `getByLabel` resolves straight to the .ProseMirror element, and
 * Playwright's `fill()` supports contenteditable officially. */
export async function fillRichEditor(
	page: Page,
	label: string,
	text: string,
): Promise<void> {
	const editor = page.getByLabel(label, { exact: true });
	await editor.click();
	await editor.fill(text);
}

/** Kích hoạt enrollment qua API seam (/api/enrollments/:id/accept).
 * Mang theo session cookie và Origin header. */
export async function acceptEnrollment(
	page: Page,
	enrollmentId: string,
): Promise<void> {
	const response = await page.request.post(
		`${API_ORIGIN}/api/enrollments/${enrollmentId}/accept`,
		{
			data: {},
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
		},
	);
	if (response.status() !== 200) {
		throw new Error(
			`acceptEnrollment failed (${response.status()}): ${await response.text()}`,
		);
	}
}

/** Kích hoạt toàn bộ enrollment đang ở trạng thái 'invited' của lớp qua API. */
export async function acceptAllClassEnrollments(
	page: Page,
	classId: string,
): Promise<void> {
	const response = await page.request.get(`${API_ORIGIN}/api/kernel`);
	if (response.status() !== 200) {
		throw new Error(`getKernelSnapshot failed (${response.status()})`);
	}
	const snap = (await response.json()) as {
		enrollments?: Array<{ id: string; classId: string; status?: string }>;
	};
	const enrollments = (snap.enrollments ?? []).filter(
		(e) => e.classId === classId && e.status === "invited",
	);
	for (const en of enrollments) {
		await acceptEnrollment(page, en.id);
	}
}

// --- Admin console (plan #413 phase 7) --------------------------------------

function sleep(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<void>();
	setTimeout(resolve, ms);
	return promise;
}

/** Email admin mặc định của e2e — khớp E2E_ADMIN_EMAILS trong boot.ts. */
export const ADMIN_EMAIL =
	(process.env.E2E_ADMIN_EMAILS ?? "admin@e2e.local").split(",")[0]?.trim() ??
	"admin@e2e.local";
export const ADMIN_PASSWORD = "password-8chars";

/**
 * Đảm bảo có đúng MỘT tài khoản admin hợp lệ cho cả run: đăng ký qua API
 * thật với Origin admin (allowlist của boot chấp nhận ADMIN_EMAIL), sau đó
 * khóa DB đảm bảo `role='admin'` + `email_verified=1` (requireAdmin đòi cả
 * hai; đăng ký mới của better-auth để email chưa verify). Idempotent —
 * chạy lại khi account đã tồn tại chỉ còn nhánh UPDATE.
 */
export async function ensureAdminAccount(
	request: APIRequestContext,
): Promise<void> {
	const res = await request.post(`${API_ORIGIN}/api/auth/sign-up/email`, {
		data: { name: "E2E Admin", email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
		headers: { "Content-Type": "application/json", Origin: ADMIN_ORIGIN },
	});
	if (res.status() !== 200) {
		// Đã tồn tại (422/400) là đường lặp lại hợp lệ; từ chối khác → fail loud.
		const body = await res.text();
		if (!/already|exists|tồn tại|registered/i.test(body)) {
			throw new Error(`admin sign-up failed (${res.status()}): ${body}`);
		}
	}
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	try {
		await client.execute("PRAGMA busy_timeout = 5000;");
		for (let i = 0; ; i++) {
			const rs = await client.execute({
				sql: "UPDATE user SET role = 'admin', email_verified = 1 WHERE lower(email) = lower(?)",
				args: [ADMIN_EMAIL],
			});
			if (Number(rs.rowsAffected) > 0) break;
			if (i >= 30) throw new Error("admin user row chưa xuất hiện sau sign-up");
			await sleep(100 * (i + 1));
		}
	} finally {
		client.close();
	}
}

/** Đăng nhập admin qua form thật của cổng 8004 → hạ cánh trang danh sách. */
export async function adminSignInViaUi(page: Page): Promise<void> {
	await page.goto(`${ADMIN_ORIGIN}/login`);
	await page.locator("#signin-email").fill(ADMIN_EMAIL);
	await page.locator("#signin-password").fill(ADMIN_PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	// Cold vite dev của app admin có thể chậm; flow-critical → 30s.
	await expect(page).toHaveURL(/\/library\/tests/, { timeout: 30_000 });
	await expect(
		page.getByRole("heading", { name: "Thư viện đề" }),
	).toBeVisible();
}

/** Đăng nhập admin rồi mở trang tạo bộ đề mới (link "Tạo bộ đề" có 2 bản
 * khi list rỗng — đi thẳng URL cho ổn định). */
export async function adminOpenNewTestPage(page: Page): Promise<void> {
	await adminSignInViaUi(page);
	await page.goto(`${ADMIN_ORIGIN}/library/tests/new`);
	await expect(
		page.getByRole("heading", { name: "Tạo bộ đề mới" }),
	).toBeVisible();
}

/** Sinh buffer MP3 hợp lệ tối thiểu (10 MPEG1 Layer3 frame) — không commit
 * binary fixture; header frame thật để gần hành vi file thật. */
export function mp3FixtureBytes(): Buffer {
	const frame = Buffer.alloc(417, 0);
	frame[0] = 0xff; // sync
	frame[1] = 0xfb; // MPEG1 Layer3, no CRC
	frame[2] = 0x90; // 128 kbps, 44.1 kHz
	frame[3] = 0x64;
	return Buffer.concat(Array.from({ length: 10 }, () => frame));
}
