/**
 * QC #121 regression — "tạo lớp có lịch không sinh buổi".
 *
 * A class created with a structured schedule and NO students must show its
 * projected sessions: chronologically on the "Buổi học" tab and ONLY in the
 * weeks that contain them on /schedule, with zero write targets; the first
 * enrollment (in-page, no reload) flips the projection to real generated
 * rows with identical dates.
 *
 * Fixture uses a FIXED far-future Monday (2027-01-04): the add-class modal
 * enforces strictly-future start dates, so a fixed-date QC repro must be
 * API-seeded (helpers-dated-class), and every pinned week derives from the
 * constant — 12 weekly Mondays, 04/01 … 22/03/2027.
 */
import { expect, test } from "@playwright/test";
import { gotoWeek, signUpViaUi } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";

const START = "2027-01-04"; // Monday
const LAST = "2027-03-22"; // START + 11 weeks (12th session)
const WEEK_BEFORE = "2026-12-28";
const WEEK_AFTER = "2027-03-29";

test("lớp có lịch chưa có học viên → buổi dự kiến đúng tuần, không CTA, enroll thay buổi thật", async ({
	page,
}) => {
	const CLASS_NAME = `E2E Projected ${Date.now()}`;
	const STUDENT_NAME = "Trần Dự Kiến E2E";

	await signUpViaUi(page);
	await seedDatedClass(page, {
		name: CLASS_NAME,
		schedule: { days: [0], start: "19:00", end: "20:30" },
		startDate: START,
		sessionsTotal: 12,
	});
	await page.reload();
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByText(CLASS_NAME).click();

	// Buổi học tab: all 12 projected sessions, chronological, muted badges.
	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(page.locator("tbody tr")).toHaveCount(12);
	const firstRow = page.locator("tbody tr").first();
	await expect(firstRow).toContainText("04/01");
	await expect(page.locator("tbody tr").last()).toContainText("22/03");
	await expect(page.getByText("Dự kiến", { exact: true })).toHaveCount(12);
	await expect(page.getByRole("button", { name: "Điểm danh" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Điều chỉnh" })).toHaveCount(0);

	// /schedule: the session exists ONLY in the weeks that contain it.
	await gotoWeek(page, WEEK_BEFORE);
	await expect(
		page.locator("div.lesson-block", { hasText: CLASS_NAME }),
	).toHaveCount(0);
	await gotoWeek(page, START);
	const block = page.locator("div.lesson-block", { hasText: CLASS_NAME });
	await expect(block).toHaveCount(1);
	await expect(block).toContainText("19:00");
	await expect(block).toContainText("chưa có học viên");
	// Projection is display-only: not a button, click opens no LessonModal.
	await expect(
		page.locator("button.lesson-block", { hasText: CLASS_NAME }),
	).toHaveCount(0);
	await block.click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	// Continuation weeks + course tail.
	await gotoWeek(page, "2027-01-11");
	await expect(
		page.locator("div.lesson-block", { hasText: CLASS_NAME }),
	).toHaveCount(1);
	await gotoWeek(page, LAST);
	await expect(
		page.locator("div.lesson-block", { hasText: CLASS_NAME }),
	).toHaveCount(1);
	await gotoWeek(page, WEEK_AFTER);
	await expect(
		page.locator("div.lesson-block", { hasText: CLASS_NAME }),
	).toHaveCount(0);

	// First enrollment flips the projection to real rows IN-PAGE (atomic
	// snapshot refresh, no reload): same dates, no "Dự kiến", real targets.
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	await page.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await page.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	await page.getByRole("button", { name: "Buổi học", exact: true }).click();
	await expect(page.locator("tbody tr")).toHaveCount(12);
	await expect(page.getByText("Dự kiến", { exact: true })).toHaveCount(0);
	await expect(page.locator("tbody tr").first()).toContainText("04/01");
	// Real dated rows: every occurrence is future + upcoming → adjust targets
	// exist, no check-in (VN date gate keeps them ineligible).
	await expect(
		page.getByRole("button", { name: "Điều chỉnh" }).first(),
	).toBeVisible();
});
