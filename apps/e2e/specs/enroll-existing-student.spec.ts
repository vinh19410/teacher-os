import { expect, type Locator, type Page, test } from "@playwright/test";
import { seedStudent, signUpViaUi } from "./helpers";

const REVIEW_VIEWPORTS = [
	{ width: 1440, height: 900 },
	{ width: 768, height: 1024 },
	{ width: 375, height: 812 },
] as const;

async function assertSelectedContrastAcrossThemesAndViewports(
	page: Page,
	selectedEl: Locator,
	mode: { kind: "chip"; unselectedSelector: string } | { kind: "option" },
): Promise<void> {
	try {
		for (const viewport of REVIEW_VIEWPORTS) {
			await page.setViewportSize(viewport);
			for (const theme of ["light", "dark"] as const) {
				await page.evaluate(
					(isDark) => document.documentElement.classList.toggle("dark", isDark),
					theme === "dark",
				);
				await expect(selectedEl).toBeVisible();
				await expect
					.poll(async () => {
						const metrics = await selectedEl.evaluate((selNode, m) => {
							const canvas = document.createElement("canvas");
							canvas.width = 1;
							canvas.height = 1;
							const ctx = canvas.getContext("2d", {
								willReadFrequently: true,
							});
							if (!ctx) return { textRatio: 0, stateRatio: 0 };

							const parseRgba = (
								cssColor: string,
							): [number, number, number, number] => {
								ctx.clearRect(0, 0, 1, 1);
								ctx.fillStyle = "#010203";
								ctx.fillStyle = cssColor;
								ctx.fillRect(0, 0, 1, 1);
								const data = ctx.getImageData(0, 0, 1, 1).data;
								return [
									data[0] ?? 0,
									data[1] ?? 0,
									data[2] ?? 0,
									(data[3] ?? 0) / 255,
								];
							};

							const blend = (
								fg: [number, number, number],
								bg: [number, number, number],
								alpha: number,
							): [number, number, number] => [
								fg[0] * alpha + bg[0] * (1 - alpha),
								fg[1] * alpha + bg[1] * (1 - alpha),
								fg[2] * alpha + bg[2] * (1 - alpha),
							];

							const resolveBackdrop = (
								node: Element,
							): [number, number, number] => {
								const chain: HTMLElement[] = [];
								let cur: HTMLElement | null = node.parentElement;
								while (cur) {
									chain.push(cur);
									cur = cur.parentElement;
								}
								let rgb: [number, number, number] = [255, 255, 255];
								for (let i = chain.length - 1; i >= 0; i--) {
									const item = chain[i];
									if (!item) continue;
									const [r, g, b, a] = parseRgba(
										getComputedStyle(item).backgroundColor,
									);
									if (a > 0) rgb = blend([r, g, b], rgb, a);
								}
								return rgb;
							};

							const lum = (rgb: [number, number, number]): number => {
								const rS = rgb[0] / 255;
								const gS = rgb[1] / 255;
								const bS = rgb[2] / 255;
								const rL =
									rS <= 0.04045 ? rS / 12.92 : ((rS + 0.055) / 1.055) ** 2.4;
								const gL =
									gS <= 0.04045 ? gS / 12.92 : ((gS + 0.055) / 1.055) ** 2.4;
								const bL =
									bS <= 0.04045 ? bS / 12.92 : ((bS + 0.055) / 1.055) ** 2.4;
								return 0.2126 * rL + 0.7152 * gL + 0.0722 * bL;
							};

							const ratio = (
								a: [number, number, number],
								b: [number, number, number],
							): number => {
								const la = lum(a);
								const lb = lum(b);
								return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
							};

							const selBackdrop = resolveBackdrop(selNode);
							const selStyle = getComputedStyle(selNode);
							const selBgRaw = parseRgba(selStyle.backgroundColor);
							const selBg = blend(
								[selBgRaw[0], selBgRaw[1], selBgRaw[2]],
								selBackdrop,
								selBgRaw[3],
							);
							const selFgRaw = parseRgba(selStyle.color);
							const selFg = blend(
								[selFgRaw[0], selFgRaw[1], selFgRaw[2]],
								selBg,
								selFgRaw[3],
							);
							const textRatio = ratio(selFg, selBg);

							if (m.kind === "option") {
								const borderRaw = parseRgba(selStyle.borderTopColor);
								if (borderRaw[3] === 0) return { textRatio, stateRatio: 0 };
								const borderRgb = blend(
									[borderRaw[0], borderRaw[1], borderRaw[2]],
									selBackdrop,
									borderRaw[3],
								);
								return {
									textRatio,
									stateRatio: ratio(borderRgb, selBackdrop),
								};
							}

							const dialog = selNode.closest('[role="dialog"]') ?? document;
							const unselNode = dialog.querySelector<HTMLElement>(
								m.unselectedSelector,
							);
							if (!unselNode) return { textRatio, stateRatio: 0 };
							const unselBackdrop = resolveBackdrop(unselNode);
							const unselBgRaw = parseRgba(
								getComputedStyle(unselNode).backgroundColor,
							);
							const unselBg = blend(
								[unselBgRaw[0], unselBgRaw[1], unselBgRaw[2]],
								unselBackdrop,
								unselBgRaw[3],
							);
							return {
								textRatio,
								stateRatio: ratio(selBg, unselBg),
							};
						}, mode);
						return metrics.textRatio >= 4.5 && metrics.stateRatio >= 3;
					})
					.toBe(true);
			}
		}
	} finally {
		await page.evaluate(() =>
			document.documentElement.classList.remove("dark"),
		);
		await page.setViewportSize({ width: 1280, height: 720 });
	}
}
/**
 * QC scenario for issue #122 & issue #257:
 * Enrolling an EXISTING student into a class from class detail.
 * The modal is dedicated to enrolling existing students.
 * When an eligible student is enrolled, they enter 'Đã mời' state.
 * Upon activation, the active package and lesson series are generated.
 * When all students are enrolled, the modal displays the empty picker state.
 */
test("class detail → picker enroll học viên có sẵn → roster + KPI tăng", async ({
	page,
}) => {
	const CLASS_NAME = "E2E 122 Lớp có sẵn";
	const STUDENT_NAME = "QC-122 E2E";

	// 1. Sign-up teacher
	const teacherEmail = await signUpViaUi(page);

	// 2. Seed student in DB
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
	await page.goto("/students");
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 3. Create a scheduled class (defaults: T2+T4, 12 buổi).
	await page.getByText("Lớp học", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/classes$/);
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	const writingChip = classDialog.getByRole("button", {
		name: "Writing",
		exact: true,
	});
	const t2Chip = classDialog.getByRole("button", { name: "T2", exact: true });
	await writingChip.click();
	await t2Chip.click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await expect(writingChip).toHaveAttribute("aria-pressed", "true");
	await expect(
		classDialog.getByRole("button", { name: "Speaking", exact: true }),
	).toHaveAttribute("aria-pressed", "false");
	await assertSelectedContrastAcrossThemesAndViewports(page, writingChip, {
		kind: "chip",
		unselectedSelector: 'button[aria-pressed="false"]',
	});
	await assertSelectedContrastAcrossThemesAndViewports(page, t2Chip, {
		kind: "chip",
		unselectedSelector: 'button[aria-pressed="false"]',
	});
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	// 4. Class detail → + Thêm học viên vào lớp opens enroll modal with picker.
	await page.getByText(CLASS_NAME).click();
	await expect(page.getByText("0", { exact: true }).first()).toBeVisible();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const dialog = page.getByRole("dialog");
	await expect(
		dialog.getByText("Thêm học viên vào lớp", { exact: true }),
	).toBeVisible();
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await expect(option).toBeVisible();
	await expect(option).toHaveAttribute("aria-selected", "false");
	await expect(option.locator("svg")).toHaveCount(0);

	// 5. Pick the existing student, verify high-contrast selected state + check icon, and save.
	await option.click();
	await expect(option).toHaveAttribute("aria-selected", "true");
	await expect(option.locator("svg")).toBeVisible();
	await assertSelectedContrastAcrossThemesAndViewports(page, option, {
		kind: "option",
	});
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// 6. Roster shows the student with badge "Đã mời"; KPI active count is 0 (with 1 chờ xác nhận).
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();
	await expect(page.getByText("Đã mời")).toBeVisible();
	await expect(page.getByText("chờ xác nhận")).toBeVisible();

	// 7. Click "Kích hoạt" on the roster row and confirm in modal.
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();

	// After activation: badge is "Đang học", KPI count is now 1.
	await expect(page.getByText("Đang học")).toBeVisible();
	const kpi = page
		.locator("div")
		.filter({ hasText: "học viên" })
		.filter({
			has: page.getByText("1", { exact: true }),
		});
	await expect(kpi.first()).toBeVisible();

	// 8. The schedule's lesson series was generated for the active enrollment.
	await page
		.getByRole("tab", { name: "Sessions & practice", exact: true })
		.click();
	await expect(page.getByText("Sắp tới").first()).toBeVisible();
	await expect(page.getByText("0/12").first()).toBeVisible();

	// 9. Re-open the modal: with every org student enrolled, the picker displays empty state
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	await expect(
		dialog.getByText("Tất cả học viên đã được thêm vào lớp.", { exact: true }),
	).toBeVisible();
	await expect(dialog.getByRole("option", { name: STUDENT_NAME })).toHaveCount(
		0,
	);
});

test("class detail → hủy lời mời → row biến mất khỏi roster, có thể mời lại cùng học viên", async ({
	page,
}) => {
	const CLASS_NAME = "E2E Lớp Hủy Lời Mời";
	const STUDENT_NAME = "QC-Cancel E2E";

	const teacherEmail = await signUpViaUi(page);

	// 1. Tạo học viên trước bằng seed
	await seedStudent({ teacherEmail, name: STUDENT_NAME });
	await page.goto("/students");
	await expect(page.getByText(STUDENT_NAME)).toBeVisible();

	// 2. Tạo lớp học
	await page.getByText("Lớp học", { exact: true }).first().click();
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

	// 3. Mời học viên vào lớp
	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const dialog = page.getByRole("dialog");
	const option = dialog.getByRole("option", { name: STUDENT_NAME });
	await option.click();
	await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(dialog).toBeHidden();

	// 4. Roster hiển thị học viên với badge "Đã mời" và nút "Hủy lời mời"
	const row = page.locator("tr", { hasText: STUDENT_NAME });
	await expect(row).toBeVisible();
	await expect(row.getByText("Đã mời")).toBeVisible();
	const cancelBtn = row.getByRole("button", { name: "Hủy lời mời" });
	await expect(cancelBtn).toBeVisible();

	// 5. Bấm Hủy lời mời và xác nhận
	await cancelBtn.click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Hủy lời mời tham gia lớp?" });
	await expect(confirmModal).toBeVisible();
	await confirmModal.getByRole("button", { name: "Hủy lời mời" }).click();
	await expect(confirmModal).toBeHidden();

	// 6. Row biến mất khỏi roster
	await expect(row).toHaveCount(0);

	// 7. Mời lại cùng học viên: mở lại modal, học viên lại xuất hiện trong picker và mời thành công
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const reEnrollDialog = page.getByRole("dialog");
	const reOption = reEnrollDialog.getByRole("option", { name: STUDENT_NAME });
	await expect(reOption).toBeVisible();
	await reOption.click();
	await reEnrollDialog
		.getByRole("button", { name: "Lưu", exact: true })
		.click();
	await expect(reEnrollDialog).toBeHidden();

	// 8. Học viên lại xuất hiện trên roster ở trạng thái Đã mời
	await expect(page.locator("tr", { hasText: STUDENT_NAME })).toBeVisible();
	await expect(
		page.locator("tr", { hasText: STUDENT_NAME }).getByText("Đã mời"),
	).toBeVisible();
});
