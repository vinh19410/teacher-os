import { expect, type Page } from "@playwright/test";

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

/** Navigate to a class's "Buổi học" tab (Issue #89 merged tab) — it renders the
 * "Đã học"/"Sắp tới" badges on the timeline table. Text counts must scope to
 * "Buổi học" while on it. */
export async function openClassScheduleTab(page: Page, className: string) {
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(className).click();
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
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
