import { expect, test } from "@playwright/test";
import { createClient } from "@libsql/client";
import { signUpViaUi } from "./helpers";

/**
 * Issue #269 — the new reading question types compose end to end: summary
 * (text answers) and diagram (https image URL) save to the bank, and the
 * student preview shows the intro option bank + diagram image without ever
 * leaking the answer key.
 * Phase-02 — the structured option bank for the matching types: bank editor,
 * bank-sourced key chips, sentend distinctness, positional delete reset and
 * the snapshot round trip through the prompt bank page.
 */

const DIAGRAM_IMG_ALT = "Ảnh biểu đồ đề Reading";

test("create a ready summary prompt and leak-check the preview", async ({
	page,
}) => {
	const TITLE = "QC-269 Summary";
	const ANSWER_ONE = "zephyr-9";
	const ANSWER_TWO = "quartz-7";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	// Passage 2 → Summary completion (one of the 8 new types)
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page
		.getByRole("button", { name: "Summary completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill(
			"Monsoon rains refill the stepwells each year. Engineers cut tunnels into the rock to channel the flow.",
		);
	await page
		.getByLabel("Hướng dẫn đề")
		.fill("Complete the summary. NO MORE THAN THREE WORDS from the passage.");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Rains refill the ……… each year.");
	await page.getByLabel("Đáp án chấm tự động").first().fill(ANSWER_ONE);
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("Tunnels ……… the water through the rock.");
	await page.getByLabel("Đáp án chấm tự động").nth(1).fill(ANSWER_TWO);

	// Student preview: intro + stems visible, answer key never.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(
		page.getByText("NO MORE THAN THREE WORDS").first(),
	).toBeVisible();
	await expect(page.getByText("Rains refill the").first()).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	expect(previewBody).not.toContain(ANSWER_ONE);
	expect(previewBody).not.toContain(ANSWER_TWO);

	// Back to composing: the draft survives the round trip, then saves ready.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 2/2 đáp án đã khóa")).toBeVisible();

	// Bank lists it; the detail aside shows the intro option bank.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-269 Summary/ }).click();
	await expect(
		page.getByText("NO MORE THAN THREE WORDS").first(),
	).toBeVisible();
});

test("create a ready diagram prompt with an https image URL", async ({
	page,
}) => {
	const TITLE = "QC-269 Diagram";
	const IMAGE_URL = "https://example.com/qc-269-diagram.png";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page
		.getByRole("button", { name: "Diagram label completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill("The boiler heated the water until it drove the crankshaft below.");
	await page
		.getByLabel("Hướng dẫn đề")
		.fill("Label the diagram. ONE WORD ONLY from the passage.");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Part 4 of the machine.");
	// "piston" is the key but never appears in the passage → leak-check-able.
	await page.getByLabel("Đáp án chấm tự động").first().fill("piston");

	// Ready is blocked until the diagram carries its image URL.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await expect(page.getByText("Thiếu ảnh biểu đồ")).toBeVisible();

	await page.getByLabel("Ảnh biểu đồ (URL)").fill(IMAGE_URL);
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();

	// Student preview renders the image + intro, never the key.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();
	await expect(page.getByText("ONE WORD ONLY").first()).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	expect(previewBody).not.toContain("piston");

	// Round trip keeps the URL; then the prompt saves ready.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveValue(IMAGE_URL);

	// Switching type away wipes the URL (red-team #5): a diagram URL must
	// never ride along into another type's prompt. Composed content resets
	// with it (long-standing type-change semantics). Phase-01 FR5 adds a
	// confirm for type changes with authored content — the teacher accepts.
	page.on("dialog", (dialog) => {
		// Accept only the type-change confirm — an unexpected dialog must
		// dismiss loudly, not get swallowed into a false pass.
		void (dialog.message().includes("Đổi dạng đề")
			? dialog.accept()
			: dialog.dismiss());
	});
	await page.getByRole("button", { name: "Note completion" }).first().click();
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveCount(0);
	await page.getByRole("button", { name: "Diagram label completion" }).click();
	await expect(page.getByLabel("Ảnh biểu đồ (URL)")).toHaveValue("");

	// Re-compose and save ready.
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("Part 4 of the machine.");
	await page.getByLabel("Đáp án chấm tự động").first().fill("piston");
	await page.getByLabel("Ảnh biểu đồ (URL)").fill(IMAGE_URL);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 1/1 đáp án đã khóa")).toBeVisible();

	// Bank detail: the diagram image is visible in the preview aside too.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-269 Diagram/ }).click();
	await expect(page.locator(`img[alt="${DIAGRAM_IMG_ALT}"]`)).toBeVisible();
});

test("create a ready features prompt with a 5-item bank and round-trip it through the bank page", async ({
	page,
}) => {
	const TITLE = "QC-271 Features bank";
	const BANK = [
		"Brunel the engineer",
		"Darwin the naturalist",
		"Curie the physicist",
		"Ada the mathematician",
		"Audubon the illustrator",
	];

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 3" }).click();
	await page.getByRole("button", { name: "Matching features" }).click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill("The great exhibitors of the nineteenth century shaped engineering.");

	// Four questions (p3 → Câu 27–30).
	for (let i = 0; i < 3; i += 1) {
		await page.getByRole("button", { name: "Thêm câu" }).click();
	}
	const stems = [
		"27 Built the Clifton bridge",
		"28 Sailed to the Galápagos",
		"29 Discovered radium",
		"30 Wrote about the first computer",
	];
	for (const [index, stem] of stems.entries()) {
		await page
			.getByLabel("Nội dung câu hỏi phía học viên")
			.nth(index)
			.fill(stem);
	}

	// The bank panel only appears for bankable types — five typed rows.
	await expect(
		page.getByText("Ngân hàng lựa chọn", { exact: true }),
	).toBeVisible();
	for (let i = 0; i < BANK.length; i += 1) {
		await page.getByRole("button", { name: "Thêm mục" }).click();
	}
	for (const [index, entry] of BANK.entries()) {
		await page.getByRole("textbox", { name: `Mục ${String.fromCharCode(65 + index)}`, exact: true }).fill(entry);
	}

	// Ready without a bank-sized coverage is blocked — with the typed bank and
	// keyed answers it saves. Keys are chips sourced FROM the bank (A–E only).
	const keyAnswers = ["A", "B", "C", "A"];
	for (const [index, answer] of keyAnswers.entries()) {
		await page
			.getByRole("button", { name: `Câu ${27 + index}: ${answer}` })
			.click();
	}
	await expect(
		page.getByRole("button", { name: "Câu 27: F" }),
	).toHaveCount(0);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 4/4 đáp án đã khóa")).toBeVisible();

	// Round trip through the SNAPSHOT read path: reload the bank page, open
	// the prompt, and the labeled bank must render in the preview aside.
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-271 Features bank/ }).click();
	await expect(
		page.getByText("Ngân hàng lựa chọn", { exact: true }),
	).toBeVisible();
	for (const entry of BANK) {
		await expect(page.getByText(entry).first()).toBeVisible();
	}
});

test("sentend blocks a second question from keying an already-used label", async ({
	page,
}) => {
	const TITLE = "QC-271 Sentend distinct";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page
		.getByRole("button", { name: "Matching sentence endings" })
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill("Every ending fragment completes exactly one sentence.");
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("14 The locks were invented");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("15 The canals declined");

	for (let i = 0; i < 3; i += 1) {
		await page.getByRole("button", { name: "Thêm mục" }).click();
	}
	await page.getByRole("textbox", { name: "Mục A", exact: true }).fill("to raise heavy barges over ridges.");
	await page.getByRole("textbox", { name: "Mục B", exact: true }).fill("when railways took the freight.");
	await page.getByRole("textbox", { name: "Mục C", exact: true }).fill("after the great frost fair.");

	// First question keys A; the second question's A chip is then disabled —
	// each option is used exactly once (formal sentend rule).
	await page.getByRole("button", { name: "Câu 14: A" }).click();
	await expect(page.getByRole("button", { name: "Câu 15: A" })).toBeDisabled();
	await expect(page.getByRole("button", { name: "Câu 15: B" })).toBeEnabled();
	await page.getByRole("button", { name: "Câu 15: B" }).click();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
});

test("deleting a middle bank row resets the keys at or after that position", async ({
	page,
}) => {
	const TITLE = "QC-271 Bank row delete";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 3" }).click();
	await page.getByRole("button", { name: "Matching features" }).click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await page
		.getByLabel("Đoạn đọc")
		.fill("Deleting a row renumbers the labels — old keys must not re-bind.");
	await page.getByRole("button", { name: "Thêm câu" }).click();
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.first()
		.fill("27 The engineer");
	await page
		.getByLabel("Nội dung câu hỏi phía học viên")
		.nth(1)
		.fill("28 The naturalist");

	for (let i = 0; i < 5; i += 1) {
		await page.getByRole("button", { name: "Thêm mục" }).click();
	}
	for (const label of ["A", "B", "C", "D", "E"]) {
		await page.getByRole("textbox", { name: `Mục ${label}`, exact: true }).fill(`Option ${label} content`);
	}
	await page.getByRole("button", { name: "Câu 27: A" }).click();
	await page.getByRole("button", { name: "Câu 28: C" }).click();

	// Delete row B: the later key (Câu 28 was C ≥ B's position) must reset —
	// silently re-binding C onto "Option D content" is the red-team #4 bug.
	await page.getByRole("button", { name: "Xóa mục B" }).click();
	await expect(
		page.getByRole("button", { name: "Câu 27: A" }),
	).toHaveAttribute("aria-pressed", "true");
	await expect(
		page.getByRole("button", { name: "Câu 28: C" }),
	).toHaveAttribute("aria-pressed", "false");
	await expect(
		page.getByText("Thiếu đáp án chấm tự động").first(),
	).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();

	// Re-key the shifted label, then the prompt saves ready again.
	await page.getByRole("button", { name: "Câu 28: B" }).click();
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
});

test("a legacy prompt without a bank previews with the intro fallback and a missing-bank warning", async ({
	page,
}) => {
	const TITLE = "QC-271 Legacy headings";
	const email = await signUpViaUi(page);

	// Seed a pre-phase-02 row directly: no option_bank value → column default
	// "[]", bank stored in the intro free text (the old authoring habit).
	const client = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	// The org bootstrap lands server-side right after sign-up — retry until
	// the membership row exists, never insert with a garbage org id.
	let orgId = "";
	for (let attempt = 0; attempt < 30 && !orgId; attempt += 1) {
		const orgRow = await client.execute({
			sql: `SELECT m.org_id AS id FROM membership m JOIN user u ON u.id = m.user_id
				WHERE lower(u.email) = lower(?) ORDER BY m.created_at, m.id LIMIT 1`,
			args: [email],
		});
		orgId = String(orgRow.rows[0]?.id ?? "");
		if (!orgId) await new Promise((resolve) => setTimeout(resolve, 200));
	}
	expect(orgId, "org membership after sign-up").toBeTruthy();
	await client.execute({
		sql: `INSERT INTO assignment_prompt (id, org_id, task, genre, skill, part, type, title, band, source, prompt, intro, passage, transcript, cue_topic, cue_points, audio_name, image_url, questions, note, status, created_at)
			VALUES (?, ?, 'p2', 'headings', 'reading', 'p2', 'headings', ?, '7.0', '', '', ?, 'Legacy passage text.', '', '', '', '', '[]', '[]', '', 'ready', ?)`,
		args: [
			crypto.randomUUID(),
			orgId,
			TITLE,
			"Questions 14–15\nMatch the headings i–ii with the paragraphs.",
			Date.now(),
		],
	});
	client.close();

	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-271 Legacy headings/ }).click();
	// Old intro fallback still renders — and the silence is broken loudly.
	await expect(
		page.getByText("Match the headings i–ii").first(),
	).toBeVisible();
	await expect(
		page.getByText("Thiếu ngân hàng lựa chọn").first(),
	).toBeVisible();
});
