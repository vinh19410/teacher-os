import { expect, type Locator, type Page, test } from "@playwright/test";
import { PROFILE_ORIGIN } from "./origins";

const VIEWPORTS = [
	{ name: "mobile-375x812", width: 375, height: 812 },
	{ name: "mobile-428x926", width: 428, height: 926 },
	{ name: "tablet-768x1024", width: 768, height: 1024 },
	{ name: "desktop-1440x900", width: 1440, height: 900 },
] as const;

type LightboxMetrics = Awaited<ReturnType<typeof measureLightbox>>;

async function measureLightbox(page: Page) {
	return page.evaluate(() => {
		const dlg = document.getElementById("imgModal") as HTMLDialogElement | null;
		const header = dlg?.querySelector(".modal-header") as HTMLElement | null;
		const img = document.getElementById("modalImg") as HTMLImageElement | null;
		if (!dlg || !header || !img) {
			throw new Error("Missing lightbox elements");
		}
		const dlgBox = dlg.getBoundingClientRect();
		const headerBox = header.getBoundingClientRect();
		const imgBox = img.getBoundingClientRect();
		return {
			dlgBox: {
				left: dlgBox.left,
				right: dlgBox.right,
				top: dlgBox.top,
				bottom: dlgBox.bottom,
				width: dlgBox.width,
				height: dlgBox.height,
			},
			headerBox: {
				bottom: headerBox.bottom,
			},
			imgBox: {
				left: imgBox.left,
				right: imgBox.right,
				top: imgBox.top,
				bottom: imgBox.bottom,
				width: imgBox.width,
				height: imgBox.height,
			},
			naturalWidth: img.naturalWidth,
			naturalHeight: img.naturalHeight,
			scrollWidth: dlg.scrollWidth,
			clientWidth: dlg.clientWidth,
		};
	});
}

async function waitForModalImageLoaded(page: Page) {
	await page.waitForFunction(() => {
		const img = document.getElementById("modalImg") as HTMLImageElement | null;
		return Boolean(
			img?.complete && img.naturalWidth > 0 && img.naturalHeight > 0,
		);
	});
}

async function waitForTriggerThumbLoaded(trigger: Locator) {
	await trigger.scrollIntoViewIfNeeded();
	await expect
		.poll(async () =>
			trigger.evaluate((el) => {
				const img = el.querySelector("img");
				return Boolean(img?.complete && img.naturalWidth > 0);
			}),
		)
		.toBe(true);
}

function assertContainedAndProportional(metrics: LightboxMetrics) {
	const renderedRatio = metrics.imgBox.width / metrics.imgBox.height;
	const naturalRatio = metrics.naturalWidth / metrics.naturalHeight;
	expect(Math.abs(renderedRatio - naturalRatio)).toBeLessThan(0.02);
	expect(metrics.imgBox.top).toBeGreaterThanOrEqual(
		metrics.headerBox.bottom - 1,
	);
	expect(metrics.imgBox.bottom).toBeLessThanOrEqual(metrics.dlgBox.bottom + 1);
	expect(metrics.imgBox.left).toBeGreaterThanOrEqual(metrics.dlgBox.left - 1);
	expect(metrics.imgBox.right).toBeLessThanOrEqual(metrics.dlgBox.right + 1);
	expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function expectModalReset(imgModal: Locator, modalImg: Locator) {
	await expect(imgModal).not.toBeVisible();
	await expect(modalImg).not.toHaveAttribute("src");
	await expect(modalImg).not.toHaveAttribute("width");
	await expect(modalImg).not.toHaveAttribute("height");
}

test.describe("Profile certificate lightbox modal (#706)", () => {
	for (const vp of VIEWPORTS) {
		test(`renders full certificate images without clipping on ${vp.name}`, async ({
			page,
		}) => {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			await page.goto(PROFILE_ORIGIN, { waitUntil: "domcontentloaded" });

			await page.locator("#co-my-la-ai").scrollIntoViewIfNeeded();

			const uolTrigger = page.locator(
				'[data-lightbox-src*="cert-uol-coursera-2022.png"]',
			);
			await waitForTriggerThumbLoaded(uolTrigger);
			await uolTrigger.click();

			const imgModal = page.locator("#imgModal");
			const modalTitle = page.locator("#imgModalTitle");
			const modalImg = page.locator("#modalImg");

			await expect(imgModal).toBeVisible();
			await expect(modalTitle).toContainText(
				"Chứng chỉ University of London (2022)",
			);
			await waitForModalImageLoaded(page);

			const uolMetrics = await measureLightbox(page);
			expect(uolMetrics.imgBox.width).toBeGreaterThanOrEqual(
				Math.floor(uolMetrics.dlgBox.width * 0.75),
			);
			expect(uolMetrics.imgBox.height).toBeGreaterThanOrEqual(200);
			assertContainedAndProportional(uolMetrics);

			// Clicking inside .modal-body must not trigger backdrop close.
			await imgModal.locator(".modal-body").click({ position: { x: 8, y: 8 } });
			await expect(imgModal).toBeVisible();

			// Clicking outside the dialog bounding box closes the modal.
			expect(uolMetrics.dlgBox.left).toBeGreaterThan(4);
			await page.mouse.click(2, 2);
			await expectModalReset(imgModal, modalImg);

			// Clicking the close button closes and clears attributes.
			await uolTrigger.click();
			await expect(imgModal).toBeVisible();
			await page.locator("#closeImgModal").click();
			await expectModalReset(imgModal, modalImg);

			// Verify a tall portrait certificate as well.
			const vinschoolTrigger = page.locator(
				'[data-lightbox-src*="cert-vinschool-2017.png"]',
			);
			await waitForTriggerThumbLoaded(vinschoolTrigger);
			await vinschoolTrigger.click();

			await expect(imgModal).toBeVisible();
			await waitForModalImageLoaded(page);

			const vinschoolMetrics = await measureLightbox(page);
			expect(vinschoolMetrics.imgBox.height).toBeGreaterThanOrEqual(350);
			assertContainedAndProportional(vinschoolMetrics);

			// Escape closes and returns focus to the triggering button.
			await page.keyboard.press("Escape");
			await expectModalReset(imgModal, modalImg);
			await expect(vinschoolTrigger).toBeFocused();
		});
	}
});
