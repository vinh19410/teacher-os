import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

const REPORT_DIR = fileURLToPath(
	new URL("../../../plans/reports", import.meta.url),
);

async function apiPost<T = { id?: string; error?: string }>(
	page: Page,
	path: string,
	data: unknown,
	expected = 201,
): Promise<T> {
	const response = await page.request.post(`${API_ORIGIN}${path}`, {
		data,
		headers: {
			Origin: WEB_ORIGIN,
			"Content-Type": "application/json",
		},
	});
	expect(response.status(), await response.text()).toBe(expected);
	return (await response.json()) as T;
}

async function seedThreeLessonTemplate(page: Page, name: string) {
	const tpl = await apiPost(page, "/api/syllabus-templates", {
		name,
		type: "ielts",
		level: "Band 7.0",
		skills: ["Writing"],
		description: "Mô tả giáo trình",
		totalLessons: 0,
	});
	const templateId = tpl.id ?? "";
	expect(templateId).not.toBe("");
	const modA = await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules`,
		{ title: "Module Alpha", description: "" },
	);
	const modB = await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules`,
		{ title: "Module Beta", description: "" },
	);
	const moduleAId = modA.id ?? "";
	const moduleBId = modB.id ?? "";
	const lA1 = await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${moduleAId}/lessons`,
		{ title: "Buổi A1", objectives: "", materials: "", status: "upcoming" },
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${moduleAId}/lessons`,
		{
			title: "Thi giữa kỳ A",
			objectives: "",
			materials: "",
			kind: "midterm",
			status: "upcoming",
		},
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${templateId}/modules/${moduleBId}/lessons`,
		{ title: "Buổi B1", objectives: "", materials: "", status: "upcoming" },
	);
	return {
		templateId,
		moduleAId,
		moduleBId,
		lessonA1Id: lA1.id ?? "",
	};
}

async function assertNoHorizontalOverflow(page: Page, includeDialog: boolean) {
	const overflow = await page.evaluate((checkDialog) => {
		const docOverflow =
			document.documentElement.scrollWidth > window.innerWidth;
		if (!checkDialog) return docOverflow;
		const dlgs = Array.from(document.querySelectorAll("[role='dialog']"));
		const dlgOverflow = dlgs.some((dlg) => dlg.scrollWidth > dlg.clientWidth);
		return docOverflow || dlgOverflow;
	}, includeDialog);
	expect(overflow).toBe(false);
}

test("1. Giáo viên sync lại giáo trình sau khi template cập nhật, giữ tiến độ và pass 3 viewport Light/Dark (#700)", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaApi(page);
	const tpl = await seedThreeLessonTemplate(page, `E2E 700 Sync ${stamp}`);
	const classId = await seedDatedClass(page, {
		name: `E2E 700 Lớp ${stamp}`,
		templateId: tpl.templateId,
		startDate: "2026-11-16",
		schedule: { days: [0], start: "19:00", end: "20:30" },
		sessionsTotal: 3,
	});

	await page.goto(`/classes/${classId}`);
	await expect(
		page.getByRole("heading", { name: `E2E 700 Lớp ${stamp}` }),
	).toBeVisible();

	// Ban đầu khớp template: không hiện banner trong Quản lý buổi; đánh dấu Buổi A1 = Đã dạy.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageDialog = page.getByRole("dialog");
	await expect(
		manageDialog.getByRole("heading", { name: "Quản lý buổi của lớp" }),
	).toBeVisible();
	await expect(
		manageDialog.getByTestId("manage-modal-sync-banner"),
	).toHaveCount(0);
	const a1Row = manageDialog
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi A1" });
	await a1Row.getByRole("button", { name: "Sửa", exact: true }).click();
	const editDialog = page.getByRole("dialog", { name: "Sửa buổi học" });
	await editDialog.getByLabel("Trạng thái").selectOption("done");
	await editDialog.getByRole("button", { name: "Lưu thay đổi" }).click();
	await expect(editDialog).toBeHidden();
	await expect(a1Row.getByText("Đã dạy", { exact: true })).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(manageDialog).toBeHidden();

	// Đổi status trên lớp KHÔNG được báo lệch template.
	const curriculumTab = page.getByRole("tab", {
		name: "Giáo trình",
		exact: true,
	});
	await curriculumTab.click();
	await expect(page.getByText("Đã đồng bộ với template gốc")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Đồng bộ lại", exact: true }),
	).toBeDisabled();

	// Cập nhật template gốc (đổi tên Buổi A1 + thêm Buổi B2).
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl.templateId}/modules/${tpl.moduleAId}/lessons/${tpl.lessonA1Id}`,
		{
			title: "Buổi A1 (Cập nhật v2)",
			objectives: "Mục tiêu mới",
			materials: "Slide v2",
			kind: "lesson",
		},
		200,
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl.templateId}/modules/${tpl.moduleBId}/lessons`,
		{
			title: "Buổi B2 (Mới)",
			objectives: "",
			materials: "",
			status: "upcoming",
		},
		201,
	);

	// Reload để snapshot nhận bản template mới.
	await page.reload();

	// Modal Quản lý buổi hiện banner nhắc đồng bộ.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageAfterUpdate = page.getByRole("dialog", {
		name: "Quản lý buổi của lớp",
	});
	const banner = manageAfterUpdate.getByTestId("manage-modal-sync-banner");
	await expect(banner).toBeVisible();
	await expect(
		banner.getByRole("button", { name: "Đồng bộ lại", exact: true }),
	).toBeEnabled();

	// Banner trong modal không tràn ngang ở 320px (Light & Dark).
	await page.setViewportSize({ width: 320, height: 812 });
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.waitForTimeout(100);
	await assertNoHorizontalOverflow(page, true);
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(100);
	await assertNoHorizontalOverflow(page, true);
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.setViewportSize({ width: 1280, height: 720 });

	// Mở SyncCurriculumModal từ banner, Escape chỉ đóng modal trên cùng.
	await banner
		.getByRole("button", { name: "Đồng bộ lại", exact: true })
		.click();
	const nestedSyncDialog = page.getByRole("dialog", {
		name: "Đồng bộ lại giáo trình?",
	});
	await expect(nestedSyncDialog).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(nestedSyncDialog).toBeHidden();
	await expect(manageAfterUpdate).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(manageAfterUpdate).toBeHidden();

	// Tab Giáo trình hiện trạng thái lệch và bật nút Đồng bộ lại.
	await curriculumTab.click();
	await expect(page.getByText("Có thay đổi so với template gốc")).toBeVisible();
	const syncBtn = page.getByRole("button", {
		name: "Đồng bộ lại",
		exact: true,
	});
	await expect(syncBtn).toBeEnabled();

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
			await expect(syncBtn).toBeVisible();
			await assertNoHorizontalOverflow(page, false);
			if (process.env.CAPTURE_POT === "1") {
				await page.screenshot({
					path: resolve(REPORT_DIR, `700-sync-tab-${vp.key}-${theme}.png`),
					fullPage: true,
				});
			}
		}
	}
	await page.setViewportSize({ width: 320, height: 812 });
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.waitForTimeout(150);
	await assertNoHorizontalOverflow(page, false);
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(150);
	await assertNoHorizontalOverflow(page, false);
	await page.evaluate(() => document.documentElement.classList.remove("dark"));

	// Mở SyncCurriculumModal và kiểm tra 3 viewport Light/Dark + 320px reflow.
	await page.setViewportSize({ width: 1280, height: 720 });
	await syncBtn.click();
	const syncDialog = page.getByRole("dialog", {
		name: "Đồng bộ lại giáo trình?",
	});
	await expect(syncDialog).toBeVisible();
	await expect(syncDialog.getByText("3 buổi → 4 buổi")).toBeVisible();
	await expect(
		syncDialog.getByText(
			"Tổng số buổi dự kiến của lớp sẽ cập nhật thành 4 buổi.",
		),
	).toBeVisible();

	for (const vp of viewports) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		for (const theme of ["light", "dark"] as const) {
			await page.evaluate(
				(isDark) => document.documentElement.classList.toggle("dark", isDark),
				theme === "dark",
			);
			await page.waitForTimeout(150);
			await expect(syncDialog).toBeVisible();
			await assertNoHorizontalOverflow(page, true);
			if (process.env.CAPTURE_POT === "1") {
				await page.screenshot({
					path: resolve(REPORT_DIR, `700-sync-modal-${vp.key}-${theme}.png`),
				});
			}
		}
	}
	await page.setViewportSize({ width: 320, height: 812 });
	await page.evaluate(() => document.documentElement.classList.remove("dark"));
	await page.waitForTimeout(150);
	await assertNoHorizontalOverflow(page, true);
	await page.evaluate(() => document.documentElement.classList.add("dark"));
	await page.waitForTimeout(150);
	await assertNoHorizontalOverflow(page, true);
	await page.evaluate(() => document.documentElement.classList.remove("dark"));

	await page.setViewportSize({ width: 1280, height: 720 });
	await syncDialog
		.getByRole("button", { name: "Đồng bộ lại", exact: true })
		.click();
	await expect(syncDialog).toBeHidden();
	await expect(page.getByText("Đã đồng bộ giáo trình.")).toBeVisible();
	await expect(page.getByText("Đã đồng bộ với template gốc")).toBeVisible();
	await expect(syncBtn).toBeDisabled();

	// StatCard cập nhật sang 0/4 và 4 bài trong syllabus.
	const doneCard = page.locator("div.rounded-xl", {
		has: page.getByText("buổi đã học", { exact: true }),
	});
	await expect(doneCard.getByText("0/4", { exact: true })).toBeVisible();
	const syCard = page.locator("div.rounded-xl", {
		has: page.getByText("bài trong syllabus", { exact: true }),
	});
	await expect(syCard.getByText("4", { exact: true })).toBeVisible();

	// Tab Buổi học & luyện tập chiếu đủ 4 buổi theo nội dung mới.
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const sessionRows = page.getByTestId("session-row");
	await expect(sessionRows).toHaveCount(4);
	await expect(page.getByText("Buổi A1 (Cập nhật v2)")).toBeVisible();
	await expect(page.getByText("Buổi B2 (Mới)")).toBeVisible();

	// Quản lý buổi không còn banner và giữ tiến độ "Đã dạy" ở bài 1, "Sắp tới" ở bài 4.
	await page.getByRole("button", { name: "Sắp xếp buổi", exact: true }).click();
	const manageSynced = page.getByRole("dialog", {
		name: "Quản lý buổi của lớp",
	});
	await expect(
		manageSynced.getByTestId("manage-modal-sync-banner"),
	).toHaveCount(0);
	const syncedA1Row = manageSynced
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi A1 (Cập nhật v2)" });
	await expect(syncedA1Row.getByText("Đã dạy", { exact: true })).toBeVisible();
	const syncedB2Row = manageSynced
		.locator("div[class*='grid-cols-[20px_1fr_auto']")
		.filter({ hasText: "Buổi B2 (Mới)" });
	await expect(syncedB2Row.getByText("Sắp tới", { exact: true })).toBeVisible();
});

test("2. Lớp đã có học viên và lịch buổi thực tế giữ nguyên sessionsTotal & lịch điểm danh khi template đổi số bài (#700)", async ({
	page,
}) => {
	const stamp = Date.now();
	const teacherEmail = await signUpViaApi(page);
	const tpl = await seedThreeLessonTemplate(page, `E2E 700 Real ${stamp}`);
	const classId = await seedDatedClass(page, {
		name: `E2E 700 Lớp Real ${stamp}`,
		templateId: tpl.templateId,
		startDate: "2026-11-16",
		schedule: { days: [0], start: "19:00", end: "20:30" },
		sessionsTotal: 3,
		students: {
			teacherEmail,
			names: ["Học viên Sync"],
		},
	});

	// Cập nhật tên bài 1 và thêm 2 bài mới trên template (3 → 5 bài).
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl.templateId}/modules/${tpl.moduleAId}/lessons/${tpl.lessonA1Id}`,
		{
			title: "Buổi A1 (Real Class v2)",
			objectives: "",
			materials: "",
			kind: "lesson",
		},
		200,
	);
	for (const title of ["Buổi B2", "Buổi B3"]) {
		await apiPost(
			page,
			`/api/syllabus-templates/${tpl.templateId}/modules/${tpl.moduleBId}/lessons`,
			{ title, objectives: "", materials: "", status: "upcoming" },
			201,
		);
	}

	await page.goto(`/classes/${classId}`);
	await page.getByRole("tab", { name: "Giáo trình", exact: true }).click();
	await page.getByRole("button", { name: "Đồng bộ lại", exact: true }).click();
	const syncDialog = page.getByRole("dialog", {
		name: "Đồng bộ lại giáo trình?",
	});
	await expect(
		syncDialog.getByText(
			"Lưu ý: Lớp đã có lịch buổi học thực tế (3 buổi) — lịch điểm danh và gói buổi của học viên vẫn giữ nguyên.",
		),
	).toBeVisible();
	await syncDialog
		.getByRole("button", { name: "Đồng bộ lại", exact: true })
		.click();
	await expect(syncDialog).toBeHidden();

	const doneCard = page.locator("div.rounded-xl", {
		has: page.getByText("buổi đã học", { exact: true }),
	});
	await expect(doneCard.getByText("0/3", { exact: true })).toBeVisible();
	const syCard = page.locator("div.rounded-xl", {
		has: page.getByText("bài trong syllabus", { exact: true }),
	});
	await expect(syCard.getByText("5", { exact: true })).toBeVisible();

	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	await expect(page.getByTestId("session-row")).toHaveCount(3);
	await expect(page.getByText("Buổi A1 (Real Class v2)")).toBeVisible();
});

test("3. Template gốc bị xóa cho phép chọn template thay thế và đồng bộ thành công (#700)", async ({
	page,
}) => {
	const stamp = Date.now();
	await signUpViaApi(page);
	const tpl1 = await seedThreeLessonTemplate(page, `E2E 700 Tpl1 ${stamp}`);
	const tpl2Name = `Template Thay Thế ${stamp}`;
	const tpl2 = await apiPost(page, "/api/syllabus-templates", {
		name: tpl2Name,
		type: "ielts",
		level: "Band 7.5",
		skills: ["Writing"],
		description: "",
		totalLessons: 0,
	});
	const tpl2Id = tpl2.id ?? "";
	const tpl2Mod = await apiPost(
		page,
		`/api/syllabus-templates/${tpl2Id}/modules`,
		{ title: "Module Mới", description: "" },
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl2Id}/modules/${tpl2Mod.id}/lessons`,
		{ title: "Bài Mới 1", objectives: "", materials: "", status: "upcoming" },
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl2Id}/modules/${tpl2Mod.id}/lessons`,
		{ title: "Bài Mới 2", objectives: "", materials: "", status: "upcoming" },
	);

	const classId = await seedDatedClass(page, {
		name: `E2E 700 Missing ${stamp}`,
		templateId: tpl1.templateId,
		startDate: "2026-11-16",
		schedule: { days: [0], start: "19:00", end: "20:30" },
		sessionsTotal: 3,
	});

	// Xóa template gốc.
	await apiPost(
		page,
		`/api/syllabus-templates/${tpl1.templateId}/remove`,
		{},
		200,
	);

	await page.goto(`/classes/${classId}`);
	await page.getByRole("tab", { name: "Giáo trình", exact: true }).click();
	await expect(page.getByText("Template gốc đã bị xóa")).toBeVisible();

	// Kiểm tra reflow 320px ở trạng thái missing-source-template (nút dài hơn).
	await page.setViewportSize({ width: 320, height: 812 });
	await page.waitForTimeout(100);
	await assertNoHorizontalOverflow(page, false);
	await page.setViewportSize({ width: 1280, height: 720 });

	await page
		.getByRole("button", { name: "Đồng bộ từ template khác", exact: true })
		.click();

	const dialog = page.getByRole("dialog", {
		name: "Đồng bộ giáo trình từ template khác",
	});
	await expect(dialog).toBeVisible();

	await page.setViewportSize({ width: 320, height: 812 });
	await page.waitForTimeout(100);
	await assertNoHorizontalOverflow(page, true);
	await page.setViewportSize({ width: 1280, height: 720 });

	await dialog
		.getByLabel("Template giáo trình")
		.selectOption({ label: `${tpl2Name} · 2 buổi` });
	await dialog
		.getByRole("button", { name: "Đồng bộ giáo trình", exact: true })
		.click();
	await expect(dialog).toBeHidden();

	await expect(page.getByText(tpl2Name)).toBeVisible();
	await expect(page.getByText("Đã đồng bộ với template gốc")).toBeVisible();
});
