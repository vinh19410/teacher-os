import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

/**
 * Issue #221 — class-scoped lesson management: the curriculum card is
 * assignment-only (no progress %, no expandable tree) and lesson ordering
 * lives in the "Quản lý buổi" modal. Reordering lessons must swap the
 * topics shown on the class schedule table (buổi N ↔ bài N).
 */

async function createTemplateWithModules(page: Page, name: string) {
	// Mỗi module render trong card riêng (div.overflow-hidden chứa h3 tiêu đề)
	// và có nút "+ Thêm buổi học" của riêng nó — phải scope theo module, nếu
	// không từ module thứ hai trở đi locator sẽ strict-violate (2 matches).
	const moduleSection = (title: string) =>
		page.getByTestId("module-card").filter({
			has: page.getByRole("heading", { name: title, exact: true }),
		});

	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByPlaceholder("VD: IELTS Writing 7.0").fill(name);
	await dialog.getByRole("button", { name: "Writing", exact: true }).click();
	await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
	await page.waitForURL(/\/syllabus\/.+/);

	// Module A with two lessons, then Module B with one.
	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog = page.getByRole("dialog");
	await moduleDialog
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module A");
	await moduleDialog.getByRole("button", { name: "Thêm module" }).click();
	await expect(page.getByText("Module A")).toBeVisible();

	for (const title of ["Buổi A1", "Buổi A2"]) {
		await moduleSection("Module A")
			.getByRole("button", { name: "+ Thêm buổi học" })
			.click();
		const addDialog = page.getByRole("dialog");
		await addDialog
			.getByPlaceholder("VD: Line chart — Mô tả xu hướng")
			.fill(title);
		await addDialog.getByRole("button", { name: "Thêm buổi" }).click();
		await expect(addDialog).toBeHidden();
	}

	await page.getByRole("button", { name: "+ Thêm module" }).click();
	const moduleDialog2 = page.getByRole("dialog");
	await moduleDialog2
		.getByPlaceholder("VD: Module 4 — Mock Test & Feedback")
		.fill("Module B");
	await moduleDialog2.getByRole("button", { name: "Thêm module" }).click();
	await expect(moduleDialog2).toBeHidden();

	await moduleSection("Module B")
		.getByRole("button", { name: "+ Thêm buổi học" })
		.click();
	const addDialog2 = page.getByRole("dialog");
	await addDialog2
		.getByPlaceholder("VD: Line chart — Mô tả xu hướng")
		.fill("Buổi B1");
	await addDialog2.getByRole("button", { name: "Thêm buổi" }).click();
	await expect(addDialog2).toBeHidden();
}

/** Since #649 a class created without a template is manual (0 buổi, no
 * schedule projection) and importing a curriculum later does not turn it into
 * an auto-scheduled class — so the class is created FROM the template, the
 * flow that keeps "buổi N ↔ bài N" session rows on the schedule. */
async function createClassFromTemplate(
	page: Page,
	className: string,
	templateName: string,
) {
	// Full load so the ['kernel'] snapshot carries the freshly built template.
	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(className);
	// Template has 3 lessons + skill Writing: picking it fills skills and
	// locks "Tổng số buổi" at 3.
	await classDialog
		.getByLabel("Template giáo trình")
		.selectOption({ label: `${templateName} · 3 buổi` });
	await expect(classDialog.getByLabel("Tổng số buổi")).toHaveValue("3");
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// Creation stays on the /classes list (same flow as class-operations.spec)
	// — open the class detail.
	await expect(page.getByText(className)).toBeVisible();
	await page.getByText(className).click();
	await expect(page).toHaveURL(/\/classes\/.+/);

	// Curriculum lives on the "Giáo trình" tab (#391): the class carries its
	// own copy of the template.
	await page.getByRole("tab", { name: "Giáo trình", exact: true }).click();
	await expect(page.getByText(templateName)).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Gỡ giáo trình", exact: true }),
	).toBeVisible();
}

test("manage modal reorders lessons and the schedule table follows (#221)", async ({
	page,
}) => {
	await signUpViaApi(page);
	await createTemplateWithModules(page, "E2E 221 Template");
	await createClassFromTemplate(page, "E2E 221 Lớp", "E2E 221 Template");

	// Curriculum card is assignment-only: no progress, no expandable tree.
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(page.getByRole("button", { name: /^Mở rộng \(/ })).toHaveCount(
		0,
	);

	// Session cards start A1 → A2 → B1 (#391 testid thay bảng).
	const scheduleRows = page.locator("[data-testid='session-row']");
	await expect(
		scheduleRows.filter({ hasText: "Buổi A1" }).first(),
	).toBeVisible();
	const slotTimeRegex = /(Thứ [^·]+|Chủ Nhật, [^·]+) · \d{2}:\d{2}–\d{2}:\d{2}/;
	const row1Match = (await scheduleRows.nth(0).innerText()).match(
		slotTimeRegex,
	);
	const row2Match = (await scheduleRows.nth(1).innerText()).match(
		slotTimeRegex,
	);
	const row3Match = (await scheduleRows.nth(2).innerText()).match(
		slotTimeRegex,
	);
	expect(row1Match).not.toBeNull();
	expect(row2Match).not.toBeNull();
	expect(row3Match).not.toBeNull();

	// Open the manage modal and move "Buổi A2" up.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageDialog = page.getByRole("dialog");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeVisible();
	const a1Row = manageDialog
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi A1" });
	const a2Row = manageDialog
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi A2" });
	const b1Row = manageDialog
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi B1" });

	await expect(a1Row.getByTestId("curriculum-lesson-slot")).toHaveText(
		`Buổi 1 · ${row1Match?.[0]}`,
	);
	await expect(a2Row.getByTestId("curriculum-lesson-slot")).toHaveText(
		`Buổi 2 · ${row2Match?.[0]}`,
	);
	await expect(b1Row.getByTestId("curriculum-lesson-slot")).toHaveText(
		`Buổi 3 · ${row3Match?.[0]}`,
	);

	// Nút mũi tên có aria-label "Đưa {buổi} lên" (a11y #221) — glyph ↑ chỉ
	// là nội dung hiển thị, không phải accessible name.
	await a2Row
		.getByRole("button", { name: "Đưa Buổi A2 lên", exact: true })
		.click();
	await expect(a2Row.getByTestId("curriculum-lesson-slot")).toHaveText(
		`Buổi 1 · ${row1Match?.[0]}`,
	);
	await expect(a1Row.getByTestId("curriculum-lesson-slot")).toHaveText(
		`Buổi 2 · ${row2Match?.[0]}`,
	);
	// The base Modal closes on Escape (no explicit close button).
	await page.keyboard.press("Escape");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeHidden();

	// Schedule rows swapped: A2 now precedes A1.
	await expect(
		scheduleRows.filter({ hasText: "Buổi A2" }).first(),
	).toBeVisible();
	const firstRow = scheduleRows.nth(0);
	await expect(firstRow).toContainText("Buổi A2");
	await expect(firstRow).not.toContainText("Buổi A1");

	// Card stays assignment-only after the flow.
	await expect(page.getByRole("button", { name: /^Mở rộng \(/ })).toHaveCount(
		0,
	);
});

test("manage modal renders session datetime across 3 viewports (Light/Dark) and 320px reflow without overflow (#697)", async ({
	page,
}) => {
	await signUpViaApi(page);
	await createTemplateWithModules(page, "E2E 697 Template");
	await createClassFromTemplate(page, "E2E 697 Lớp", "E2E 697 Template");

	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageDialog = page.getByRole("dialog");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeVisible();
	await expect(manageDialog.getByTestId("curriculum-lesson-slot")).toHaveCount(
		3,
	);

	const viewports = [
		{ key: "desktop", width: 1440, height: 900 },
		{ key: "tablet", width: 768, height: 1024 },
		{ key: "mobile", width: 375, height: 812 },
	] as const;

	if (process.env.CAPTURE_POT === "1") {
		mkdirSync(REPORT_DIR, { recursive: true });
	}

	for (const vp of viewports) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate(
				(isDark) => document.documentElement.classList.toggle("dark", isDark),
				theme === "dark",
			);
			await page.waitForTimeout(150);
			await expect(manageDialog).toBeVisible();
			const overflow = await page.evaluate(() => {
				const docOverflow =
					document.documentElement.scrollWidth > window.innerWidth;
				const dlg = document.querySelector("[role='dialog']");
				const dlgOverflow = dlg ? dlg.scrollWidth > dlg.clientWidth : false;
				return docOverflow || dlgOverflow;
			});
			expect(overflow).toBe(false);

			if (process.env.CAPTURE_POT === "1") {
				await page.screenshot({
					path: resolve(REPORT_DIR, `697-manage-modal-${vp.key}-${theme}.png`),
				});
			}
		}
	}

	await page.setViewportSize({ width: 320, height: 812 });
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(isDark) => document.documentElement.classList.toggle("dark", isDark),
			theme === "dark",
		);
		await page.waitForTimeout(150);
		const overflow320 = await page.evaluate(() => {
			const docOverflow =
				document.documentElement.scrollWidth > window.innerWidth;
			const dlg = document.querySelector("[role='dialog']");
			const dlgOverflow = dlg ? dlg.scrollWidth > dlg.clientWidth : false;
			return docOverflow || dlgOverflow;
		});
		expect(overflow320).toBe(false);
	}
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
});
