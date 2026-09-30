import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";
import { fillRichEditor, signUpViaUi } from "./helpers";

/**
 * Issue #269 — the new reading question types compose end to end: summary
 * (text answers) and diagram (https image URL) save to the bank, and the
 * student preview shows the intro option bank + diagram image without ever
 * leaking the answer key.
 * Phase-02 — the structured option bank for the matching types: bank editor,
 * bank-sourced key chips, sentend distinctness, positional delete reset and
 * the snapshot round trip through the prompt bank page.
 */

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
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Monsoon rains refill the stepwells each year. Engineers cut tunnels into the rock to channel the flow.",
	);
	await fillRichEditor(
		page,
		"Hướng dẫn đề",
		"Complete the summary. NO MORE THAN THREE WORDS from the passage.",
	);
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

	// The pin editor needs a REAL loaded image box for percent math — serve
	// a deterministic 200×100 image for the pasted URL.
	const svgImage = (width: number, height: number) =>
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#3b82f6"/></svg>`;
	await page.route("**/qc-269-diagram.png", (route) =>
		route.fulfill({
			contentType: "image/svg+xml",
			body: svgImage(200, 100),
		}),
	);
	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page
		.getByRole("button", { name: "Diagram label completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"The boiler heated the water until it drove the crankshaft below.",
	);
	await fillRichEditor(
		page,
		"Hướng dẫn đề",
		"Label the diagram. ONE WORD ONLY from the passage.",
	);
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
	await expect(page.getByText("Thiếu ảnh hoặc ghim nhãn")).toBeVisible();

	await page.getByLabel("Ảnh biểu đồ (URL)").fill(IMAGE_URL);
	// Phase-04 FR3: the image hosts the pin editor — click to pin Q1.
	const pinSurface = page.getByRole("application", {
		name: "Ảnh đề — bấm để đặt ghim nhãn",
	});
	await pinSurface.click({ position: { x: 60, y: 40 } });
	await expect(
		page.getByRole("button", { name: "Chọn câu 1 tại ghim" }),
	).toBeVisible();

	// Student preview renders the pinned image + intro, never the key.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	await expect(page.getByLabel("Điền đáp án câu 1")).toBeVisible();
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
	// Ready also demands a pin on every question (phase-04 FR2) — the save
	// stays blocked until the image is labeled again.
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeDisabled();
	await page
		.getByRole("application", { name: "Ảnh đề — bấm để đặt ghim nhãn" })
		.click({ position: { x: 60, y: 40 } });
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 1/1 đáp án đã khóa")).toBeVisible();

	// Bank detail: the pinned image survives the snapshot round-trip —
	// the aside draws the numbered pin overlay (phase-04 FR5/FR7).
	await page.goto("/assignments");
	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: /QC-269 Diagram/ }).click();
	await expect(page.getByLabel("Điền đáp án câu 1")).toBeVisible();
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
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"The great exhibitors of the nineteenth century shaped engineering.",
	);

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
		await page
			.getByRole("textbox", {
				name: `Mục ${String.fromCharCode(65 + index)}`,
				exact: true,
			})
			.fill(entry);
	}

	// Ready without a bank-sized coverage is blocked — with the typed bank and
	// keyed answers it saves. Keys are chips sourced FROM the bank (A–E only).
	const keyAnswers = ["A", "B", "C", "A"];
	for (const [index, answer] of keyAnswers.entries()) {
		await page
			.getByRole("button", { name: `Câu ${27 + index}: ${answer}` })
			.click();
	}
	await expect(page.getByRole("button", { name: "Câu 27: F" })).toHaveCount(0);
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
	await page.getByRole("button", { name: "Matching sentence endings" }).click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Every ending fragment completes exactly one sentence.",
	);
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
	await page
		.getByRole("textbox", { name: "Mục A", exact: true })
		.fill("to raise heavy barges over ridges.");
	await page
		.getByRole("textbox", { name: "Mục B", exact: true })
		.fill("when railways took the freight.");
	await page
		.getByRole("textbox", { name: "Mục C", exact: true })
		.fill("after the great frost fair.");

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
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Deleting a row renumbers the labels — old keys must not re-bind.",
	);
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
		await page
			.getByRole("textbox", { name: `Mục ${label}`, exact: true })
			.fill(`Option ${label} content`);
	}
	await page.getByRole("button", { name: "Câu 27: A" }).click();
	await page.getByRole("button", { name: "Câu 28: C" }).click();

	// Delete row B: the later key (Câu 28 was C ≥ B's position) must reset —
	// silently re-binding C onto "Option D content" is the red-team #4 bug.
	await page.getByRole("button", { name: "Xóa mục B" }).click();
	await expect(page.getByRole("button", { name: "Câu 27: A" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	await expect(page.getByRole("button", { name: "Câu 28: C" })).toHaveAttribute(
		"aria-pressed",
		"false",
	);
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
	await expect(page.getByText("Match the headings i–ii").first()).toBeVisible();
	await expect(
		page.getByText("Thiếu ngân hàng lựa chọn").first(),
	).toBeVisible();
});

test("summary composes via click-to-blank: 4 clicked words become 4 keyed questions and 4 preview inputs (phase-03 FR1/FR2/FR5)", async ({
	page,
}) => {
	const TITLE = "QC-273 Cloze summary";
	const PASSAGE =
		"Engineers raised the dams to store monsoon water for the dry season.";
	// The four words the teacher will click — each unique in the text so the
	// role selectors stay unambiguous, and each absent from the UI chrome so
	// the preview leak-check can rely on their absence.
	const WORDS = ["raised", "dams", "store", "dry"];

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page
		.getByRole("button", { name: "Summary completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	// The passage must NOT contain the four words the teacher will blank —
	// the preview renders the passage verbatim and the leak-check relies on
	// the answers appearing nowhere in the student paper.
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"Victorian builders changed the landscape of the city forever.",
	);
	await fillRichEditor(
		page,
		"Hướng dẫn đề",
		"Complete the summary. NO MORE THAN THREE WORDS from the passage.",
	);

	// Paste → tokenize → click four words → apply. Zero typing of answers.
	await page.getByLabel("Dán đoạn văn bản").fill(PASSAGE);
	await page.getByRole("button", { name: "Chọn chỗ trống" }).click();
	for (const word of WORDS) {
		await page.getByRole("button", { name: `Chọn từ: ${word}` }).click();
	}
	await expect(page.getByText("4/40 chỗ trống")).toBeVisible();
	await page.getByRole("button", { name: "Áp vào câu hỏi" }).click();

	// The grid now carries the four markered stems with auto-generated keys.
	await expect(page.getByText("4/40 câu")).toBeVisible();
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("Engineers ____");
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();

	// Student preview: exactly 4 blank inputs in the right word positions,
	// and none of the clicked words (the answers) leak into the paper.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	const blanks = page.locator('input[aria-label^="Điền đáp án câu"]');
	await expect(blanks).toHaveCount(4);
	await expect(page.getByText("Engineers").first()).toBeVisible();
	await expect(page.getByText("monsoon water for the").first()).toBeVisible();
	await expect(page.getByText("season.").first()).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	for (const word of WORDS) {
		expect(previewBody).not.toContain(word);
	}

	// Back: the draft survives, then saves ready with all four keys locked.
	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await expect(page.getByLabel("Tiêu đề")).toHaveValue(TITLE);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 4/4 đáp án đã khóa")).toBeVisible();
});

test("tablecomp composes via the grid: 2×3 table with 2 blanks previews as labeled rows (phase-03 FR4/FR5)", async ({
	page,
}) => {
	const TITLE = "QC-273 Table grid";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page.getByRole("button", { name: "Table completion" }).click();

	// exact: the grid editor adds its own "Tiêu đề cột/hàng" labels.
	await page.getByLabel("Tiêu đề", { exact: true }).fill(TITLE);
	await fillRichEditor(
		page,
		"Đoạn đọc",
		"The table lists Victorian inventions and their dates.",
	);
	await fillRichEditor(
		page,
		"Hướng dẫn đề",
		"Complete the table. ONE WORD ONLY from the passage.",
	);

	// Grow the default 2×2 grid to 2×3 and fill titles + two data cells.
	await page.getByRole("button", { name: "Thêm cột" }).click();
	await page.getByLabel("Tiêu đề cột 1").fill("Invention");
	await page.getByLabel("Tiêu đề cột 2").fill("Year");
	await page.getByLabel("Tiêu đề hàng 1").fill("Steam engine");
	// exact: each cell also carries a "Tạo chỗ trống ô …" toggle button.
	await page.getByLabel("Ô hàng 1 cột 1", { exact: true }).fill("piston");
	await page.getByLabel("Ô hàng 1 cột 2", { exact: true }).fill("1769");
	await page
		.getByRole("button", { name: "Tạo chỗ trống ô hàng 1 cột 1" })
		.click();
	await page
		.getByRole("button", { name: "Tạo chỗ trống ô hàng 1 cột 2" })
		.click();
	await expect(page.getByText("2/40 ô trống")).toBeVisible();
	await page.getByRole("button", { name: "Áp vào bảng" }).click();

	// Two marker-exempt [table] stems land in the grid with captured answers.
	await expect(page.getByText("2/40 câu")).toBeVisible();
	await expect(
		page.getByLabel("Nội dung câu hỏi phía học viên").first(),
	).toHaveValue("[table] r1 c1: Steam engine / Invention");
	await expect(
		page.getByRole("button", { name: "Lưu vào ngân hàng" }).first(),
	).toBeEnabled();

	// Student preview: labeled "Hàng — Cột" rows, never the grid answers.
	await page.getByRole("button", { name: "Xem trước" }).click();
	await expect(page).toHaveURL(/\/assignments\/preview$/);
	const blanks = page.locator('input[aria-label^="Điền đáp án câu"]');
	await expect(blanks).toHaveCount(2);
	await expect(page.getByText("Hàng 1 — Cột 1:").first()).toBeVisible();
	await expect(page.getByText("Hàng 1 — Cột 2:").first()).toBeVisible();
	await expect(
		page.getByText("Steam engine / Invention").first(),
	).toBeVisible();
	const previewBody = await page.locator("body").innerText();
	expect(previewBody).not.toContain("piston");
	expect(previewBody).not.toContain("1769");

	await page.getByRole("button", { name: "Quay lại soạn đề" }).click();
	await expect(page).toHaveURL(/\/assignments\/new$/);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();
	await expect(page.getByText("Tự động · 2/2 đáp án đã khóa")).toBeVisible();
});

test("cloze apply is blocked above the caps: over 40 blanks and a 500-char segment (phase-03 FR2/FR7)", async ({
	page,
}) => {
	const TITLE = "QC-273 Cloze caps";

	await signUpViaUi(page);
	await page.goto("/assignments/new");

	await page.getByRole("button", { name: "Reading", exact: true }).click();
	await page.getByRole("button", { name: "Passage 2" }).click();
	await page
		.getByRole("button", { name: "Summary completion" })
		.first()
		.click();

	await page.getByLabel("Tiêu đề").fill(TITLE);
	await fillRichEditor(page, "Đoạn đọc", "Cap check passage.");
	// No items yet — apply must stay blocked before the grid grows.
	await expect(page.getByText("1/40 câu")).toBeVisible();

	// Raw mode: 41 blanks → the 40-blank cap blocks apply with a message.
	await page.getByRole("button", { name: "Cú pháp thô" }).click();
	const fortyOne = Array.from({ length: 41 }, (_, i) => `w${i} *k${i}*`).join(
		" ",
	);
	await page.getByLabel("Văn bản cú pháp thô").fill(fortyOne);
	await expect(page.getByText("Tìm thấy 41 chỗ trống")).toBeVisible();
	await expect(page.getByText("Tối đa 40 chỗ trống")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Áp vào câu hỏi" }),
	).toBeDisabled();
	await expect(page.getByText("1/40 câu")).toBeVisible();

	// A single segment longer than the 500-char stem cap blocks too.
	const longSegment = `${"word ".repeat(110)}*key*`;
	await page.getByLabel("Văn bản cú pháp thô").fill(longSegment);
	await expect(page.getByText("vượt quá 500 ký tự")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Áp vào câu hỏi" }),
	).toBeDisabled();
	await expect(page.getByText("1/40 câu")).toBeVisible();

	// A valid small paste unlocks apply — the caps are the only gate here.
	await page
		.getByLabel("Văn bản cú pháp thô")
		.fill("Water fills the *well* each year.");
	await expect(page.getByText("Tìm thấy 1 chỗ trống")).toBeVisible();
	await expect(
		page.getByRole("button", { name: "Áp vào câu hỏi" }),
	).toBeEnabled();
});
