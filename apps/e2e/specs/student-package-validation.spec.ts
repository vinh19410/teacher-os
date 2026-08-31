import { expect, type Page, type Request, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * QC scenario for issue #115 (P1): the add-student form let a 0-session
 * package and a negative unit price pass the client — the server answered
 * with a generic banner ("Không lưu được…") naming no field, and a 0-session
 * total was even coerced to 10 by `parseInt(total) || 10`.
 *
 * Load-bearing facts (mirrors create-class-validation.spec.ts / #105):
 * - Field injects label→input association, so getByLabel targets each input.
 * - The per-field error renders as a <span> sibling of the input inside the
 *   field container — NOT role="alert" (that is the server banner only), so
 *   assertions scope to the field container of the labeled input.
 * - The no-POST guarantee uses the observe-only counter idiom from
 *   create-invoice.spec.ts (countInvoicePosts), scoped to the real client
 *   URL /api/students — never a global count (signup POSTs auth too).
 */

/** Observe-only request counter (no mocking): POSTs hitting `needle` while
 * `action` runs. Registered BEFORE the action so nothing slips past. */
async function countPosts(
	page: Page,
	needle: string,
	action: () => Promise<void>,
): Promise<number> {
	let posts = 0;
	const onRequest = (request: Request) => {
		if (request.method() === "POST" && request.url().includes(needle)) {
			posts += 1;
		}
	};
	page.on("request", onRequest);
	try {
		await action();
	} finally {
		page.off("request", onRequest);
	}
	return posts;
}

/** The <span> holding a per-field error: a sibling of the labeled input. */
function fieldError(page: Page, label: string) {
	return page.getByRole("dialog").getByLabel(label).locator("xpath=..");
}

test("students → gói 0 buổi / giá âm / thập phân bị chặn theo field, hợp lệ thì lưu (issue #115)", async ({
	page,
}) => {
	const STUDENT_NAME = "QC-115 E2E";

	await signUpViaUi(page);

	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog.getByText("Thêm học viên mới")).toBeVisible();
	await dialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	const save = dialog.getByRole("button", { name: "Lưu", exact: true });

	// QC repro 1 (Case A): sessions 0 must be blocked per-field — never
	// coerced to 10, never sent to the server.
	await dialog.getByLabel("Số buổi gói").fill("0");
	const blockedTotal = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "Số buổi gói").getByText("từ 1 trở lên"),
	).toBeVisible();
	await expect(dialog).toBeVisible();
	expect(blockedTotal).toBe(0);

	// QC repro 2 (Case B): negative price is blocked per-field (guard against
	// a state-stale false green: the input must really hold -500 first).
	await dialog.getByLabel("Đơn giá (VND)").fill("-500");
	const priceValue = await dialog.getByLabel("Đơn giá (VND)").inputValue();
	await expect(priceValue).toBe("-500");
	const blockedPrice = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "Đơn giá (VND)").getByText("không được âm"),
	).toBeVisible();
	await expect(dialog).toBeVisible();
	expect(blockedPrice).toBe(0);

	// Decimal input (Case E): "10.5" must be rejected, not truncated to 10
	// (the #105 parseInt pattern truncates silently — this plan fixes that).
	await dialog.getByLabel("Đơn giá (VND)").fill("400000");
	await dialog.getByLabel("Số buổi gói").fill("10.5");
	const blockedDecimal = await countPosts(page, "/api/students", () =>
		save.click(),
	);
	await expect(
		fieldError(page, "Số buổi gói").getByText("từ 1 trở lên"),
	).toBeVisible();
	expect(blockedDecimal).toBe(0);

	// Valid input recovers (Case C): the stale error clears, the modal
	// closes, the row appears — and the counter POSITIVELY fires once, which
	// proves the negative assertions above were not vacuously green.
	await dialog.getByLabel("Số buổi gói").fill("12");
	await expect(
		fieldError(page, "Số buổi gói").getByText("từ 1 trở lên"),
	).toHaveCount(0);
	const saved = await countPosts(page, "/api/students", () => save.click());
	await expect(dialog).toBeHidden();
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	expect(saved).toBe(1);
});

test("class detail → enroll học viên có sẵn cũng chặn gói 0 buổi theo field (issue #115)", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 115 Lớp enroll";
	const STUDENT_NAME = "QC-115 Enrollable";

	await signUpViaUi(page);

	// Create the enrollable student first (defaults 10 buổi / 400000đ).
	await page.getByText("Học viên", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/students$/);
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const studentsDialog = page.getByRole("dialog");
	await studentsDialog.getByLabel("Họ tên học viên *").fill(STUDENT_NAME);
	await studentsDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(studentsDialog).toBeHidden();

	// Create a scheduled class (defaults: T2+T4, 12 buổi) and open the
	// add-student modal from class detail — it opens in "Học viên có sẵn"
	// mode because an unenrolled org student exists.
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	await page.getByText(CLASS_NAME).click();
	await page.getByRole("button", { name: "+ Thêm học viên" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByText("Thêm học viên", { exact: true }),
	).toBeVisible();
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await option.click();

	// Case D (mandatory): the enroll branch shares packageFields, so a
	// 0-session total must be blocked here too — with no enroll POST.
	await dialog.getByLabel("Số buổi gói").fill("0");
	const blockedEnroll = await countPosts(page, "/enroll", () =>
		dialog.getByRole("button", { name: "Lưu", exact: true }).click(),
	);
	await expect(
		fieldError(page, "Số buổi gói").getByText("từ 1 trở lên"),
	).toBeVisible();
	await expect(dialog).toBeVisible();
	expect(blockedEnroll).toBe(0);
});
