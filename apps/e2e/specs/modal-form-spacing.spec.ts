import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

const REPORT_DIR = path.resolve(
	process.cwd(),
	"../../plans/reports/screenshots-416-modal-spacing",
);

test.beforeAll(() => {
	if (!fs.existsSync(REPORT_DIR)) {
		fs.mkdirSync(REPORT_DIR, { recursive: true });
	}
});

const VIEWPORTS = [
	{ name: "desktop", width: 1440, height: 900 },
	{ name: "tablet", width: 768, height: 1024 },
	{ name: "mobile", width: 375, height: 812 },
];

test("Modal 'Tạo syllabus mới' spacing và DOM measurements trên 3 viewports (issue #416)", async ({
	page,
}) => {
	await signUpViaUi(page);

	await page.goto("/syllabus");
	await page.getByRole("button", { name: "+ Tạo syllabus" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(100);

		// Chụp ảnh bằng chứng
		await dialog.screenshot({
			path: path.join(REPORT_DIR, `add-syllabus-${vp.name}.png`),
		});

		// Đo DOM bằng getBoundingClientRect
		const metrics = await dialog.evaluate((d) => {
			const form = d.querySelector("form");
			if (!form) return null;

			// Direct children of form
			const children = Array.from(form.children).filter(
				(el) =>
					(el as HTMLElement).offsetWidth > 0 &&
					(el as HTMLElement).offsetHeight > 0,
			);
			const gaps: Array<{ prev: string; next: string; gap: number }> = [];
			for (let i = 0; i < children.length - 1; i++) {
				const c1 = children[i];
				const c2 = children[i + 1];
				if (!c1 || !c2) continue;
				const r1 = c1.getBoundingClientRect();
				const r2 = c2.getBoundingClientRect();
				gaps.push({
					prev: (c1 as HTMLElement).innerText.split("\n")[0] ?? "",
					next: (c2 as HTMLElement).innerText.split("\n")[0] ?? "",
					gap: Math.round(r2.top - r1.bottom),
				});
			}

			// Label to control inside first field
			const firstField = children[0];
			const label = firstField?.querySelector("label");
			const input = firstField?.querySelector("input");
			let labelToControl = null;
			if (label && input) {
				labelToControl = Math.round(
					input.getBoundingClientRect().top -
						label.getBoundingClientRect().bottom,
				);
			}

			return { gaps, labelToControl, childCount: children.length };
		});

		expect(metrics).not.toBeNull();
		if (!metrics) return;

		// Root font-size là 14px (globals.css:222) -> gap-4 = 1rem = 14px chuẩn
		for (const g of metrics.gaps) {
			expect(g.gap).toBe(14);
		}
		// Label -> control trong Field: gap-2 = 0.5rem = 7px chuẩn
		expect(metrics.labelToControl).toBe(7);
	}
	// 1. Khi chưa có lỗi/notice: wrapper trạng thái rỗng và bị ẩn hoàn toàn (empty:hidden)
	const emptyHiddenState = await dialog.evaluate((d) => {
		const wrapper = d.querySelector("form div.empty\\:hidden");
		if (!wrapper) return null;
		const style = window.getComputedStyle(wrapper);
		return {
			display: style.display,
			height: (wrapper as HTMLElement).offsetHeight,
		};
	});
	expect(emptyHiddenState).toEqual({ display: "none", height: 0 });

	// 2. Trigger error bằng cách bấm nút Tạo khi để trống tên
	await dialog.getByRole("button", { name: "Tạo", exact: true }).click();
	const alert = dialog.getByRole("alert").first();
	await expect(alert).toBeVisible();

	// 3. Khi có lỗi: Field error nằm trong Field (gap-2 = 7px dưới input, 14px đến field sau)
	// Và wrapper lỗi submit (div.empty:hidden) hiện ra cách field trước 14px (gap-4)
	const errorMetrics = await dialog.evaluate((d) => {
		const firstField = d.querySelector("form")?.firstElementChild;
		const input = firstField?.querySelector("input");
		const alertEl = firstField?.querySelector('[role="alert"]');
		const nextField = firstField?.nextElementSibling;
		const wrapper = d.querySelector("form div.empty\\:hidden");
		const prevOfWrapper = wrapper?.previousElementSibling;

		let wrapperGap = null;
		if (wrapper && prevOfWrapper) {
			const rPrev = prevOfWrapper.getBoundingClientRect();
			const rWrap = wrapper.getBoundingClientRect();
			wrapperGap = Math.round(rWrap.top - rPrev.bottom);
		}

		return {
			inputToAlert:
				input && alertEl
					? Math.round(
							alertEl.getBoundingClientRect().top -
								input.getBoundingClientRect().bottom,
						)
					: null,
			alertToNextField:
				alertEl && nextField
					? Math.round(
							nextField.getBoundingClientRect().top -
								alertEl.getBoundingClientRect().bottom,
						)
					: null,
			wrapperGap,
			wrapperDisplay: wrapper ? window.getComputedStyle(wrapper).display : null,
		};
	});

	expect(errorMetrics).not.toBeNull();
	if (errorMetrics) {
		expect(errorMetrics.inputToAlert).toBe(7);
		expect(errorMetrics.alertToNextField).toBe(14);
		expect(errorMetrics.wrapperDisplay).toBe("flex");
		expect(errorMetrics.wrapperGap).toBe(14);
	}

	await dialog.screenshot({
		path: path.join(REPORT_DIR, "add-syllabus-with-error.png"),
	});

	// Keyboard: Escape đóng modal
	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("Modal 'Tạo lớp mới' TemplatePicker 'Lớp trống' không bị khoảng hở kép (issue #416)", async ({
	page,
}) => {
	await signUpViaUi(page);

	await page.goto("/classes");
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(100);

		await dialog.screenshot({
			path: path.join(REPORT_DIR, `add-class-${vp.name}.png`),
		});

		const templateGap = await dialog.evaluate((d) => {
			const form = d.querySelector("form");
			if (!form) return null;
			const children = Array.from(form.children);
			const templateIdx = children.findIndex((c) =>
				c.textContent?.includes("Template giáo trình"),
			);
			if (templateIdx === -1 || templateIdx >= children.length - 1) return null;
			const templateEl = children[templateIdx];
			const nextEl = children[templateIdx + 1];
			if (!templateEl || !nextEl) return null;
			const r1 = templateEl.getBoundingClientRect();
			const r2 = nextEl.getBoundingClientRect();
			return {
				gap: Math.round(r2.top - r1.bottom),
				templateClass: templateEl.className,
				nextClass: nextEl.className,
			};
		});

		expect(templateGap).not.toBeNull();
		if (templateGap) {
			// gap-4 = 1rem = 14px (root font-size 14px)
			expect(templateGap.gap).toBe(14);
		}
	}

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});

test("Modal 'Mời học viên' (form đã bỏ class trùng) nhận đúng gap-4 = 14px từ Modal body", async ({
	page,
}) => {
	await signUpViaUi(page);

	await page.goto("/students");
	await page.getByRole("button", { name: "Mời học viên" }).click();

	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();

	for (const vp of VIEWPORTS) {
		await page.setViewportSize({ width: vp.width, height: vp.height });
		await page.waitForTimeout(100);

		await dialog.screenshot({
			path: path.join(REPORT_DIR, `invite-student-${vp.name}.png`),
		});

		const gaps = await dialog.evaluate((d) => {
			const form = d.querySelector("form#invite-student-form");
			if (!form) return null;
			const children = Array.from(form.children).filter(
				(el) =>
					(el as HTMLElement).offsetWidth > 0 &&
					(el as HTMLElement).offsetHeight > 0,
			);
			const measured: number[] = [];
			for (let i = 0; i < children.length - 1; i++) {
				const c1 = children[i];
				const c2 = children[i + 1];
				if (!c1 || !c2) continue;
				const r1 = c1.getBoundingClientRect();
				const r2 = c2.getBoundingClientRect();
				measured.push(Math.round(r2.top - r1.bottom));
			}
			return measured;
		});

		expect(gaps).not.toBeNull();
		if (gaps) {
			for (const gap of gaps) {
				// 14px chuẩn gap-4
				expect(gap).toBe(14);
			}
		}
	}

	await page.keyboard.press("Escape");
	await expect(dialog).toBeHidden();
});
