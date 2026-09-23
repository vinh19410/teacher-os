import { expect, type Page } from "@playwright/test";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";
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

/** Tạo học viên qua modal /students (form create — SĐT + email bắt buộc).
 * Mặc định SĐT/email hợp lệ; spec test validation tự fill tay, không dùng helper. */
export async function createStudentViaUi(
	page: Page,
	name: string,
	opts: { phone?: string; email?: string } = {},
): Promise<void> {
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Họ tên học viên *").fill(name);
	await dialog.getByLabel("SĐT *").fill(opts.phone ?? "0901234567");
	const slug =
		name
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "") || "student";
	const email = opts.email ?? `${slug}.${Date.now()}@e2e.test`;
	await dialog.getByLabel("Email *").fill(email);
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();
}

/** Navigate to a class's "Buổi học" tab (Issue #89 merged tab) — it renders the
 * "Đã học"/"Sắp tới" badges on the timeline table. Text counts must scope to
 * "Buổi học" while on it. */
export async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	const classRow = page.locator("tbody").getByText(className);
	await expect(classRow).toBeVisible();
	await classRow.click();
	await page.getByRole("tab", { name: "Buổi học", exact: true }).click();
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
