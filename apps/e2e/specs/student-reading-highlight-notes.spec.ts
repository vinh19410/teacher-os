import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { seedQuizFixture } from "./helpers-quiz";
import { LMS_ORIGIN, STUDENT_BASE_URL } from "./origins";

const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `reading.hl.${runToken}@test.local`;
const readingTitle = "IELTS Reading: The History of Tea";

const RICH_PASSAGE = [
	"<h2>The History of Tea</h2>",
	"<p>The story of tea begins in <strong>ancient China</strong> over five thousand years ago, when Emperor Shen Nung discovered leaves drifting into boiling water.</p>",
	"<blockquote>Tea soon evolved from a medicinal tonic into an <em>essential daily ritual</em> across Asian and European trade routes.</blockquote>",
	"<p>By the seventeenth century, maritime merchants introduced dried tea leaves to London coffee houses, sparking unprecedented demand.</p>",
	"<ul><li>Green tea: minimally oxidised leaves</li><li>Black tea: fully oxidised for long ocean voyages</li></ul>",
	"<table><thead><tr><th>Century</th><th>Milestone</th></tr></thead><tbody><tr><td>17th</td><td>Arrived in Britain</td></tr><tr><td>19th</td><td>Plantations in India</td></tr></tbody></table>",
].join("");

async function signIn(page: Page): Promise<void> {
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signin").click();
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

async function openPaper(page: Page, title: string): Promise<void> {
	await page.getByRole("link", { name: `Làm bài: ${title}` }).click();
	const paper = page.getByTestId("navigator-progress");
	const startDialog = page.getByRole("alertdialog", {
		name: "Bắt đầu làm bài",
	});
	await expect(paper.or(startDialog)).toBeVisible();
	if (await startDialog.isVisible()) {
		await startDialog.getByRole("button", { name: "Bắt đầu" }).click();
	}
	await expect(paper).toBeVisible();
}

/** Programmatically selects the substring `needle` inside `[data-testid="reading-passage-content"]`
 * and returns its bounding box so real pointer/contextmenu events can target it. */
async function selectPassageSubstring(
	page: Page,
	needle: string,
): Promise<{ x: number; y: number }> {
	return page.evaluate((targetText) => {
		const root = document.querySelector<HTMLElement>(
			'[data-testid="reading-passage-content"]',
		);
		if (!root) throw new Error("reading-passage-content not found");

		const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
			acceptNode(node) {
				const parent = node.parentElement;
				if (parent?.closest("[data-reading-ui]")) {
					return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			},
		});

		const nodes: Array<{ node: Text; start: number; end: number }> = [];
		let full = "";
		let current = walker.nextNode();
		while (current) {
			const textNode = current as Text;
			const start = full.length;
			full += textNode.data;
			nodes.push({ node: textNode, start, end: full.length });
			current = walker.nextNode();
		}

		const idx = full.indexOf(targetText);
		if (idx < 0) {
			throw new Error(`Substring "${targetText}" not found in passage`);
		}
		const endIdx = idx + targetText.length;

		let startNode: Text | null = null;
		let startOff = 0;
		let endNode: Text | null = null;
		let endOff = 0;
		for (const entry of nodes) {
			if (!startNode && idx >= entry.start && idx < entry.end) {
				startNode = entry.node;
				startOff = idx - entry.start;
			}
			if (endIdx > entry.start && endIdx <= entry.end) {
				endNode = entry.node;
				endOff = endIdx - entry.start;
				break;
			}
		}
		if (!startNode || !endNode) {
			throw new Error("Could not map selection endpoints");
		}

		startNode.parentElement?.scrollIntoView({
			block: "center",
			inline: "nearest",
		});

		const range = document.createRange();
		range.setStart(startNode, startOff);
		range.setEnd(endNode, endOff);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
		const rects = Array.from(range.getClientRects()).filter(
			(r) => r.width > 0 && r.height > 0,
		);
		const rect = rects[0] ?? range.getBoundingClientRect();
		return {
			x: Math.round(rect.left + rect.width / 2),
			y: Math.round(rect.top + rect.height / 2),
		};
	}, needle);
}

test.beforeAll(async ({ browser }) => {
	await seedQuizFixture({
		orgName: `Reading HL E2E ${runToken}`,
		className: `Lớp Reading HL ${runToken}`,
		studentName: "Reading Student",
		studentEmail,
		prompts: [
			{
				title: readingTitle,
				skill: "reading",
				part: "p1",
				type: "tfng",
				note: "Đoạn 1 nêu trà bắt nguồn từ Trung Quốc cổ đại hơn 5000 năm trước.",
				passage: RICH_PASSAGE,
				intro:
					"<p>Do the following statements agree with the information given in the passage?</p>",
				questions: [
					{
						stem: "Tea originated in ancient China more than 5,000 years ago.",
						opts: null,
						answer: "TRUE",
						alts: "",
					},
					{
						stem: "Green tea leaves are fully oxidised for ocean voyages.",
						opts: null,
						answer: "FALSE",
						alts: "",
					},
				],
			},
		],
	});

	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${LMS_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Reading Student");
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});
	await verifyStudentEmailFromMailLog(page, studentEmail);
	await expect(page).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
	await context.close();
});

test.describe("Reading highlight & note tools (#881)", () => {
	test("highlight cross-tag text, attach/edit note via right-click, survive reload, verify 3 viewports + dark mode, and view readonly after submit", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await page.setViewportSize({ width: 1440, height: 900 });
		await signIn(page);
		await openPaper(page, readingTitle);

		const passagePane = page.getByTestId("reading-passage-pane");
		const passageContent = page.getByTestId("reading-passage-content");
		await expect(passageContent).toBeVisible();

		// 1. Highlight across <strong> boundary via floating selection toolbar
		const pt1 = await selectPassageSubstring(page, "begins in ancient China");
		await passageContent.dispatchEvent("pointerdown", {
			button: 0,
			clientX: pt1.x,
			clientY: pt1.y,
		});
		await page.evaluate(({ x, y }) => {
			window.dispatchEvent(
				new PointerEvent("pointerup", { button: 0, clientX: x, clientY: y }),
			);
		}, pt1);
		const toolbar = page.getByRole("toolbar", { name: "Công cụ bài đọc" });
		await expect(toolbar).toBeVisible();
		await toolbar.getByRole("button", { name: "Tô sáng" }).click();
		await expect(toolbar).toHaveCount(0);
		await expect(passageContent.locator("mark.reading-hl")).toHaveCount(2);

		// 2. Right-click context menu on a second phrase (inside blockquote) -> attach Vietnamese note
		const pt2 = await selectPassageSubstring(page, "essential daily ritual");
		await page.mouse.click(pt2.x, pt2.y, { button: "right" });
		const menu = page.getByRole("menu", { name: "Menu bài đọc" });
		await expect(menu).toBeVisible();
		await menu.getByRole("menuitem", { name: "Ghi chú" }).click();

		const popover = page.getByRole("dialog", { name: "Ghi chú bài đọc" });
		await expect(popover).toBeVisible();
		await popover
			.locator("textarea")
			.fill("Ý chính đoạn 2: vai trò văn hoá của trà");
		await popover.getByRole("button", { name: "Lưu ghi chú" }).click();
		await expect(popover).toHaveCount(0);

		// Verify note indicator icon has zero text nodes and header badge reads "2"
		const noteTrigger = passageContent.locator("[data-note-trigger]").first();
		await expect(noteTrigger).toBeVisible();
		expect(await noteTrigger.textContent()).toBe("");
		const notesToggle = passagePane.getByRole("button", { name: "Ghi chú" });
		await expect(notesToggle.locator('span[aria-hidden="true"]')).toHaveText(
			"2",
		);

		// 3. Open Notes Panel, jump to note, and edit note text
		await notesToggle.click();
		const notesPanel = page.getByTestId("reading-notes-panel");
		await expect(notesPanel).toBeVisible();
		await expect(
			notesPanel.getByText("Ý chính đoạn 2: vai trò văn hoá của trà"),
		).toBeVisible();

		await noteTrigger.click();
		await expect(popover).toBeVisible();
		await popover
			.locator("textarea")
			.fill("Ý chính đoạn 2 (đã cập nhật): trà phổ biến toàn cầu");
		await popover.getByRole("button", { name: "Lưu ghi chú" }).click();
		await expect(popover).toHaveCount(0);

		// Answer Q1 so resume dialog triggers on reload too
		await page
			.locator('[data-question="0"] label', { hasText: "TRUE" })
			.click();
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		// 4. Reload -> resume -> verify both highlights & edited note persist
		await page.reload();
		const resumeDialog = page.getByRole("alertdialog", {
			name: "Tiếp tục bài làm",
		});
		await expect(resumeDialog).toBeVisible();
		// Highlights are visible without flicker behind resume dialog too
		await expect(passageContent.locator("mark.reading-hl")).toHaveCount(3);
		await resumeDialog.getByRole("button", { name: "Tiếp tục" }).click();
		await expect(
			passagePane
				.getByRole("button", { name: "Ghi chú" })
				.locator('span[aria-hidden="true"]'),
		).toHaveText("2");

		// 5. Verify 3 viewports + 320px reflow + Light/Dark mode (optional POT capture when CAPTURE_POT=1)
		const potDir = resolve(
			fileURLToPath(new URL(".", import.meta.url)),
			"../../../plans/reports",
		);
		const capturePot = process.env.CAPTURE_POT === "1";
		if (capturePot) {
			mkdirSync(potDir, { recursive: true });
		}

		// Open Notes Panel for desktop light & dark POT screenshots
		await passagePane.getByRole("button", { name: "Ghi chú" }).click();
		await expect(page.getByTestId("reading-notes-panel")).toBeVisible();

		const viewports: ReadonlyArray<{
			label: string;
			width: number;
			height: number;
			capture: boolean;
		}> = [
			{ label: "1440", width: 1440, height: 900, capture: true },
			{ label: "768", width: 768, height: 1024, capture: true },
			{ label: "375", width: 375, height: 812, capture: true },
			{ label: "320", width: 320, height: 640, capture: false },
		];

		for (const vp of viewports) {
			await page.setViewportSize({ width: vp.width, height: vp.height });
			const overflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(overflow, `horizontal overflow at ${vp.label}px light`).toBe(
				false,
			);
			if (capturePot && vp.capture) {
				await page.screenshot({
					path: resolve(potDir, `881-reading-highlight-${vp.label}-light.png`),
				});
			}
			if (vp.width === 320) {
				// Verify 3-button floating toolbar (overlaps existing highlight) stays inside 320px viewport
				const pt320 = await selectPassageSubstring(
					page,
					"begins in ancient China",
				);
				await passageContent.dispatchEvent("pointerdown", {
					button: 0,
					clientX: pt320.x,
					clientY: pt320.y,
				});
				await page.evaluate(({ x, y }) => {
					window.dispatchEvent(
						new PointerEvent("pointerup", {
							button: 0,
							clientX: x,
							clientY: y,
						}),
					);
				}, pt320);
				await expect(toolbar).toBeVisible();
				await expect(
					toolbar.getByRole("button", { name: "Bỏ tô sáng" }),
				).toBeVisible();
				const tbBox = await toolbar.boundingBox();
				expect(tbBox).not.toBeNull();
				if (tbBox) {
					expect(tbBox.x).toBeGreaterThanOrEqual(0);
					expect(tbBox.x + tbBox.width).toBeLessThanOrEqual(320.5);
				}
				const overflow320 = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(
					overflow320,
					"horizontal overflow with 3-btn toolbar at 320px",
				).toBe(false);
				await page.keyboard.press("Escape");
				await expect(toolbar).toHaveCount(0);
			}
		}

		// Dark mode check + desktop 1440 dark POT screenshot
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.evaluate(() => {
			document.documentElement.classList.add("dark");
		});
		const darkOverflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(darkOverflow, "horizontal overflow at 1440px dark").toBe(false);
		if (capturePot) {
			// Open note popover in dark mode for clear visual proof of popover contrast
			await passageContent.locator("[data-note-trigger]").first().click();
			await expect(popover).toBeVisible();
			await page.screenshot({
				path: resolve(potDir, "881-reading-highlight-1440-dark.png"),
			});
			await page.keyboard.press("Escape");
			await expect(popover).toHaveCount(0);
		}
		await page.evaluate(() => {
			document.documentElement.classList.remove("dark");
		});

		// 6. Submit (1 unanswered -> QuizSubmitGuardDialog works cleanly even if popover was open)
		await passageContent.locator("[data-note-trigger]").first().click();
		await expect(popover).toBeVisible();
		await page.getByRole("button", { name: "Nộp bài" }).click();
		// Outside click closed popover; submit guard modal is visible & unblocked
		await expect(popover).toHaveCount(0);
		const guard = page.getByRole("alertdialog", {
			name: "Bạn còn câu hỏi chưa làm",
		});
		await expect(guard).toBeVisible();
		await guard.getByRole("button", { name: "Nộp bài" }).click();

		// 7. Review detail screen shows highlights & note in READ-ONLY mode
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await page.getByRole("link", { name: "Xem chi tiết bài làm" }).click();
		await expect(page).toHaveURL(/\/detail$/);
		await expect(passageContent.locator("mark.reading-hl")).toHaveCount(3);
		await expect(
			passagePane.getByRole("button", { name: "Xoá tất cả" }),
		).toHaveCount(0);

		await passageContent.locator("[data-note-trigger]").first().click();
		const roPopover = page.getByRole("dialog", { name: "Ghi chú bài đọc" });
		await expect(roPopover).toBeVisible();
		await expect(roPopover).toContainText(
			"Ý chính đoạn 2 (đã cập nhật): trà phổ biến toàn cầu",
		);
		await expect(roPopover.locator("textarea")).toHaveCount(0);
		await expect(
			roPopover.getByRole("button", { name: "Lưu ghi chú" }),
		).toHaveCount(0);
	});
});
