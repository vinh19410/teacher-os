import { expect, type Page, test } from "@playwright/test";
import { signUpViaUi } from "./helpers";

/**
 * Design "IELTS Full Test Builder" (phase-06 Task 6.1) — the whole
 * authoring flow on a fresh D1 (boot.ts wipes the DB every run, so this
 * spec self-seeds everything it needs):
 *
 * 1. Compose TWO reading parts through the standalone composer at
 *    `/assignments/new`: Passage 1 ready (tfng chips) + Passage 2 draft
 *    (headings roman chips — bankable types cap ready saves at 8
 *    questions, so a 14-question part can only be saved as a draft).
 * 2. Build the test at `/assignments/tests/new`: header + 2 parts from
 *    the bank + 1 part composed inline in the builder slot (lockPart
 *    ynng) → 3 slots, 40 questions. Numbering must come from
 *    computeTestRanges, NOT the static part catalog: the inline Passage 3
 *    composer chips say "Câu 27" (static catalog) while the slot badge
 *    must say 29–40 (p1+p2 carry 28 real questions).
 * 3. Answers checking: paste a 40-line key with 2 deliberately wrong
 *    lines → exactly 2 mismatches → fix the 2 lines → Apply patches the
 *    2 source prompts → 40/40 match.
 * 4. Save (→ edit route) → full-test preview ("Questions 1–40", all 3
 *    passages, no answer leakage) → back → reload → slots + corrected
 *    key persist from the server snapshot.
 */
const TITLE = "Reading - Test E2E - Trainer 2";
const P1_TITLE = "E2E Reading P1 — Otters";
const P2_TITLE = "E2E Reading P2 — Glass";
const P3_TITLE = "E2E Reading P3 — Migration";

/** Intended final key (index 0 = Q1). Authored prompts deliberately hold
 * wrong answers at Q5/Q33; the first paste holds DIFFERENT wrong values
 * there, so the "fix 2 lines" step makes real edits before Apply. */
const P1_KEY = [
	"TRUE",
	"FALSE",
	"NOT GIVEN",
	"TRUE",
	"TRUE",
	"FALSE",
	"NOT GIVEN",
	"TRUE",
	"FALSE",
	"NOT GIVEN",
	"TRUE",
	"FALSE",
	"NOT GIVEN",
	"TRUE",
];
const P2_KEY = [
	"i",
	"ii",
	"iii",
	"iv",
	"v",
	"vi",
	"vii",
	"viii",
	"i",
	"ii",
	"iii",
	"iv",
	"v",
	"vi",
];
const P3_KEY = [
	"YES",
	"NO",
	"NOT GIVEN",
	"YES",
	"YES",
	"NO",
	"NOT GIVEN",
	"YES",
	"NO",
	"NOT GIVEN",
	"YES",
	"NO",
];
const INTENDED_KEY = [...P1_KEY, ...P2_KEY, ...P3_KEY];

const P1_AUTHORED = [...P1_KEY];
P1_AUTHORED[4] = "NOT GIVEN"; // Q5 seeded wrong (key says TRUE)
const P3_AUTHORED = [...P3_KEY];
P3_AUTHORED[4] = "NOT GIVEN"; // Q33 seeded wrong (key says YES)

const keyLines = (wrong: Record<number, string>) =>
	INTENDED_KEY.map(
		(answer, index) => `${index + 1}. ${wrong[index + 1] ?? answer}`,
	).join("\n");

/** Soạn 1 part reading qua composer `/assignments/new` rồi lưu vào ngân
 * hàng. `qStart` là số câu tĩnh CỦA PART (chip "Câu n: đáp án"). */
async function composeReadingPart(
	page: Page,
	opts: {
		title: string;
		passage2?: boolean;
		draft?: boolean;
		count: number;
		qStart: number;
		answers: string[];
	},
) {
	await page.goto("/assignments/new");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	if (opts.passage2) {
		await page.getByRole("button", { name: "Passage 2", exact: true }).click();
	}
	if (opts.draft) {
		await page.getByRole("button", { name: "Bản nháp" }).first().click();
	}
	await page.getByLabel("Tiêu đề").fill(opts.title);
	await page
		.getByLabel("Đoạn đọc")
		.fill(`Passage body for ${opts.title}. It has no answers inside.`);

	const stems = page.getByLabel("Nội dung câu hỏi phía học viên");
	const chip = (number: number, answer: string) =>
		page.getByRole("button", { name: `Câu ${number}: ${answer}`, exact: true });
	await stems.first().fill(`Statement 1 of ${opts.title}`);
	await chip(opts.qStart, opts.answers[0] ?? "").click();
	for (let i = 1; i < opts.count; i++) {
		await page.getByRole("button", { name: "Thêm câu" }).click();
		await stems.nth(i).fill(`Statement ${i + 1} of ${opts.title}`);
		await chip(opts.qStart + i, opts.answers[i] ?? "").click();
	}

	const saveName = opts.draft ? "Lưu bản nháp" : "Lưu vào ngân hàng";
	await page.getByRole("button", { name: saveName }).first().click();
	await expect(
		page.getByRole("heading", {
			name: opts.draft ? "Đã lưu bản nháp" : "Đã thêm vào ngân hàng",
		}),
	).toBeVisible();
	await page.getByRole("button", { name: "Tạo đề khác" }).click();
}

test("build a 3-part/40-question reading test end-to-end", async ({ page }) => {
	test.setTimeout(300_000);
	const confirmMessages: string[] = [];
	page.on("dialog", (dialog) => {
		confirmMessages.push(dialog.message());
		void dialog.accept();
	});

	await signUpViaUi(page);

	// --- Seed the two bank parts (D1 was wiped by boot.ts). ---
	await composeReadingPart(page, {
		title: P1_TITLE,
		count: P1_KEY.length,
		qStart: 1,
		answers: P1_AUTHORED,
	});
	await composeReadingPart(page, {
		title: P2_TITLE,
		passage2: true,
		draft: true,
		count: P2_KEY.length,
		qStart: 14,
		answers: P2_KEY,
	});

	// --- Build the full test. ---
	await page.goto("/assignments/tests/new");
	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page.getByLabel("Time limit").fill("60:00");
	// Inputs with a datalist expose their placeholder as the accessible
	// name (role combobox) — the Field label stays unassociated.
	await page
		.getByPlaceholder("VD: Cambridge IELTS 18")
		.fill("IELTS Trainer 2 Academic");
	await page.getByPlaceholder("VD: TEST 5").fill("TEST 5");

	// Slots render in preset order — the FIRST empty slot is always the
	// next one to fill, so ".first()" walks p1 → p2 deterministically.
	await page.getByRole("button", { name: "Chọn từ ngân hàng" }).first().click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: P1_TITLE })
		.click();
	await expect(page.getByText("1/3 parts · 14 questions")).toBeVisible();
	await expect(page.getByText("Câu 1–14").first()).toBeVisible();

	await page.getByRole("button", { name: "Chọn từ ngân hàng" }).first().click();
	await page
		.getByRole("dialog")
		.getByRole("button", { name: P2_TITLE })
		.click();
	await expect(page.getByText("2/3 parts · 28 questions")).toBeVisible();
	await expect(page.getByText("Câu 15–28").first()).toBeVisible();

	// Third part composed inline in the builder (composer lockPart). The
	// composer chips number from the static catalog (27…), the slot must
	// still land at 29–40 — computeTestRanges is the only numbering source.
	await page.getByRole("button", { name: "Soạn mới" }).first().click();
	await expect(page.getByText("Soạn mới part — Passage 3")).toBeVisible();
	// The header form also has a "Tiêu đề" field — the composer is last.
	await page.getByLabel("Tiêu đề").last().fill(P3_TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill(`Passage body for ${P3_TITLE}. It has no answers inside.`);
	const stems = page.getByLabel("Nội dung câu hỏi phía học viên");
	await stems.first().fill(`Statement 1 of ${P3_TITLE}`);
	await page.getByRole("button", { name: "Câu 27: YES", exact: true }).click();
	for (let i = 1; i < P3_AUTHORED.length; i++) {
		await page.getByRole("button", { name: "Thêm câu" }).click();
		await stems.nth(i).fill(`Statement ${i + 1} of ${P3_TITLE}`);
		await page
			.getByRole("button", {
				name: `Câu ${27 + i}: ${P3_AUTHORED[i]}`,
				exact: true,
			})
			.click();
	}
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).click();
	await expect(page.getByText("3/3 parts · 40 questions")).toBeVisible();
	await expect(page.getByText("Câu 29–40").first()).toBeVisible();

	// --- Answers checking: paste → 2 mismatches → fix → apply → all match. ---
	await page.getByRole("button", { name: "Soát đáp án" }).click();
	await expect(page.getByText("View All Answers — 40 câu")).toBeVisible();
	const keyBox = page.getByLabel("Nội dung key dán vào");

	// Two deliberately wrong lines (different from the seeded wrong
	// answers, so the fix step below edits them for real).
	await keyBox.fill(keyLines({ 5: "FALSE", 33: "NO" }));
	await expect(page.getByText("Compare — 38 match, 2 mismatch")).toBeVisible();
	await expect(page.locator('li[data-status="mismatch"]')).toHaveCount(2);

	// Fix the 2 lines to the intended key — now they differ from the
	// prompts' seeded answers and Apply has exactly 2 real changes.
	await keyBox.fill(keyLines({}));
	await expect(page.getByText("Sẽ đổi 2 câu ở 2 part:")).toBeVisible();
	await expect(page.getByText(/Passage 1: câu 5/)).toBeVisible();
	await expect(page.getByText(/Passage 3: câu 33/)).toBeVisible();

	await page.getByRole("button", { name: "Áp dụng 2 thay đổi" }).click();
	// The success notice ("Đã ghi N câu…") lives inside the
	// changes>0 branch — a successful apply zeroes the diff and unmounts
	// it in the same refresh render, so the durable proof is the
	// recomputed compare + the patched grid below.
	await expect(page.getByText("Compare — 40 match, 0 mismatch")).toBeVisible();
	await expect(
		page.getByText("Key khớp toàn bộ — không có gì để ghi."),
	).toBeVisible();
	// The grid reflects the patched answers (Q5 TRUE, Q33 YES).
	await expect(
		page.locator('div[title="TRUE"]').filter({ hasText: "Q5" }),
	).toBeVisible();
	await expect(
		page.locator('div[title="YES"]').filter({ hasText: "Q33" }),
	).toBeVisible();
	expect(confirmMessages.length).toBeGreaterThan(0);

	// --- Save → edit route (parts snapshot-persisted server-side). ---
	await page.getByRole("button", { name: "Tạo bộ đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/tests\/[^/]+$/, {
		timeout: 30_000,
	});
	await expect(page.getByText("3/3 parts · 40 questions")).toBeVisible();

	// --- Full-test preview: student paper, continuous numbering, no key. ---
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/tests\/preview$/, {
		// First-ever hit compiles the lazily-loaded preview route on the
		// cold vite dev server — can outrun the default 15s expect timeout.
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: TITLE })).toBeVisible();
	await expect(page.getByText("Time: 60 minutes")).toBeVisible();
	await expect(page.getByText("Questions 1–40")).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "READING PASSAGE 1" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "READING PASSAGE 2" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "READING PASSAGE 3" }),
	).toBeVisible();
	await expect(page.getByText(P1_TITLE).first()).toBeVisible();
	await expect(page.getByText(P3_TITLE).first()).toBeVisible();
	// Answers never leak into the student-facing paper.
	await expect(page.getByText("TRUE", { exact: true })).toHaveCount(0);
	await expect(page.getByText("YES", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Đáp án đúng")).toHaveCount(0);

	await page.getByRole("button", { name: "Quay lại soạn" }).click();
	await expect(page).toHaveURL(/\/assignments\/tests\/[^/]+$/);
	await expect(page.getByText("3/3 parts · 40 questions")).toBeVisible();

	// --- Reload: slots + applied key survive from the server snapshot. ---
	await page.reload();
	await expect(page.getByText("3/3 parts · 40 questions")).toBeVisible();
	await expect(page.getByText("Câu 1–14").first()).toBeVisible();
	await expect(page.getByText("Câu 29–40").first()).toBeVisible();
	await page.getByRole("button", { name: "Soát đáp án" }).click();
	await expect(page.getByText("View All Answers — 40 câu")).toBeVisible();
	await page.getByLabel("Nội dung key dán vào").fill(keyLines({}));
	await expect(page.getByText("Compare — 40 match, 0 mismatch")).toBeVisible();
	await expect(
		page.getByText("Key khớp toàn bộ — không có gì để ghi."),
	).toBeVisible();
});
