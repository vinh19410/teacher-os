import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { verifyStudentEmailFromMailLog } from "./helpers";
import { type QuizFixture, seedQuizFixture } from "./helpers-quiz";
import { STUDENT_ORIGIN } from "./origins";

/**
 * #283 — Student quiz take & review, end to end on the real portal.
 *
 * Seeding is direct-DB (RT#12, `helpers-quiz.ts`): teacher authoring via UI
 * cannot fit the 120s budget. The student account is REAL auth — portal
 * signup + mail-log email verification (precedent:
 * student-portal-email-verification.spec) — done once in beforeAll; each
 * test signs in through the login form.
 *
 * Two prompts, two widget kinds (one prompt renders one widget kind):
 *  - A "mcq" radio paper drives the full chain: start → answer → autosave
 *    `saved` → reload → resume → submit guard (3 unanswered) → summary
 *    counters (1 đúng / 1 sai / 3 bỏ) → detail chips + Đáp án + Giải thích
 *    → overview row flips to review.
 *  - B "sent" typed-blank paper drives the leak-check (independently named
 *    test, 3 layers: take body text, GET-quiz JSON keys, in-progress
 *    summary GET) and the drain variant (submit before the autosave lands).
 */
const PASSWORD = "password-8chars";
const runToken = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const studentEmail = `quiz.taker.${runToken}@test.local`;

const NOTE_A =
	"Hoạt động buổi sáng của An là chạy bộ quanh hồ, và người đi mua sách cùng An chiều nay là mẹ của An.";

/** Key/alts/note strings that must never appear on the take surface. The
 * note deliberately contains keys — it proves the note-withhold rule too. */
const QUIZ_LEAK_STRINGS = [
	"dragonfruit",
	"dragon fruit",
	"pitaya",
	"món ngon",
	"món ăn",
	"khí hậu ẩm",
	"ẩm ướt",
	"thanh long",
];

let fixture: QuizFixture;
let assignmentMcqId = "";
let assignmentClozeId = "";
let assignmentMixedId = "";
const titleMcq = "Trắc nghiệm đọc: Một ngày của An";
const titleCloze = "Đọc điền từ: Trái cây lạ";
const titleMixed = "Đề trộn dạng: Hồ Gươm";
const titleLegacy = "Đề 1 dạng: Tháp Rùa";
const titleSplit = "Đề dài: Hồ Gươm bản đầy đủ";
const titleIntroSections = "Đề intro chia cụm: Văn Miếu";
const titleTfngNote = "Đề T/F/NG không khai dạng: Cổ Loa";
const titleWriting = "Đề writing: marriage and age";
const titleSpeaking = "Đề speaking: a place you like";
const titleSpeakingRemove = "Đề speaking: a person you admire";
/** MP3 thật (1 giây im lặng) để thẻ <audio> load được metadata. */
const SPEAKING_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);

interface CapturedJson {
	url: string;
	status: number;
	json: unknown;
}

/** Every JSON key reachable in a payload (arrays walked, objects expanded). */
function collectKeys(
	value: unknown,
	acc: Set<string> = new Set(),
): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) collectKeys(item, acc);
	} else if (value !== null && typeof value === "object") {
		for (const [key, child] of Object.entries(value)) {
			acc.add(key);
			collectKeys(child, acc);
		}
	}
	return acc;
}

/** Collect JSON bodies of matching GET responses while the test runs. */
function captureJsonGets(page: Page, urlPart: string): CapturedJson[] {
	const captured: CapturedJson[] = [];
	page.on("response", (res) => {
		if (res.request().method() !== "GET") return;
		if (!res.url().includes(urlPart)) return;
		void res
			.json()
			.then((json) =>
				captured.push({ url: res.url(), status: res.status(), json }),
			)
			.catch(() => {
				// non-JSON body — nothing to leak-check
			});
	});
	return captured;
}

/** Sign in through the portal login form (fresh context → sign-in tab). */
async function signIn(page: Page): Promise<void> {
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#signin-email").fill(studentEmail);
	await page.locator("#signin-password").fill(PASSWORD);
	await page.locator("#panel-signin button[type='submit']").click();
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
}

/** Open the take screen for `title`; start the attempt if the gate dialog
 * shows (first entry), then wait for the paper. */
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

/** Thả 1 file lên dropzone bằng DataTransfer thật (drag & drop, #305). */
async function dropMediaFile(
	page: Page,
	name: string,
	type: string,
	bytes: Buffer,
): Promise<void> {
	const dataTransfer = await page.evaluateHandle(
		({ base64, fileName, fileType }) => {
			const binary = Uint8Array.from(atob(base64), (char) =>
				char.charCodeAt(0),
			);
			const transfer = new DataTransfer();
			transfer.items.add(new File([binary], fileName, { type: fileType }));
			return transfer;
		},
		{ base64: bytes.toString("base64"), fileName: name, fileType: type },
	);
	const dropzone = page.getByRole("button", { name: /Kéo thả file/ });
	await dropzone.dispatchEvent("dragenter", { dataTransfer });
	await dropzone.dispatchEvent("drop", { dataTransfer });
}

test.beforeAll(async ({ browser }) => {
	fixture = await seedQuizFixture({
		orgName: `Quiz E2E ${runToken}`,
		className: `Lớp Quiz ${runToken}`,
		studentName: "Quiz Taker",
		studentEmail,
		prompts: [
			{
				title: titleMcq,
				skill: "reading",
				part: "p3",
				type: "mcq",
				note: NOTE_A,
				passage:
					"<p>An là học sinh chăm chỉ. Sáng nào An cũng chạy bộ quanh hồ trước khi đến lớp. Chiều nay An sẽ đi mua sách cùng mẹ của mình.</p>",
				intro: "<p>Đọc đoạn văn và chọn đáp án đúng cho mỗi câu hỏi.</p>",
				questions: [
					{
						stem: "Theo đoạn văn, An làm gì vào mỗi buổi sáng?",
						opts: [
							"Đi mua sách",
							"Chạy bộ quanh hồ",
							"Đến lớp muộn",
							"Ngủ nướng",
						],
						answer: "B",
						alts: "",
					},
					{
						stem: "Chiều nay An sẽ đi mua sách cùng ai?",
						opts: ["Bạn cùng lớp", "Cô giáo", "Mẹ của An", "Một mình"],
						answer: "C",
						alts: "",
					},
					{
						stem: "An chạy bộ trước khi làm gì?",
						opts: ["Đi ngủ", "Đến lớp", "Ăn tối", "Xem tivi"],
						answer: "B",
						alts: "",
					},
					{
						stem: "An được mô tả là người như thế nào?",
						opts: ["Chăm chỉ", "Lười biếng", "Nghiêm khắc", "Vui tính"],
						answer: "A",
						alts: "",
					},
					{
						stem: "Bài đọc chủ yếu nói về điều gì?",
						opts: [
							"Một ngày của An",
							"Một chuyến du lịch",
							"Một bữa tiệc",
							"Một trận bóng",
						],
						answer: "A",
						alts: "",
					},
				],
			},
			{
				title: titleCloze,
				skill: "reading",
				part: "p1",
				type: "sent",
				note: "Loại quả này là thanh long, tiếng Anh: dragonfruit (tên thay thế: dragon fruit / pitaya).",
				passage:
					"<p>Ở Trung Mỹ có một loại trái cây mọc trực tiếp trên thân cây xương rồng. Vỏ ngoài sần sùi nhưng bên trong lại rất ngọt và mọng nước.</p>",
				intro: "<p>Đọc đoạn văn và điền từ vào chỗ trống.</p>",
				questions: [
					{
						stem: "Tên tiếng Anh thông dụng của loại trái cây này là ____.",
						opts: null,
						answer: "dragonfruit",
						alts: "dragon fruit / pitaya",
					},
					{
						stem: "Người dân dùng loại trái cây này để chế biến ____.",
						opts: null,
						answer: "món ngon",
						alts: "món ăn",
					},
					{
						stem: "Cây này phát triển tốt ở nơi có ____.",
						opts: null,
						answer: "khí hậu ẩm",
						alts: "ẩm ướt",
					},
				],
			},
			{
				// #286 — đề trộn dạng trong 1 prompt: cụm tfng (1–2) + note (3–4).
				title: titleMixed,
				skill: "reading",
				part: "p1",
				type: "note",
				note: "Đề trộn dạng để kiểm tra header cụm.",
				passage:
					"<p>Hồ Gươm nằm ở trung tâm Hà Nội. Xung quanh hồ có nhiều cây xanh cổ thụ.</p>",
				intro: "<p>Ghi chú: đọc kỹ đoạn văn trước khi làm bài.</p>",
				questions: [
					{
						stem: "Hồ Gươm nằm ở ngoại thành Hà Nội.",
						opts: null,
						answer: "FALSE",
						alts: "",
						type: "tfng",
					},
					{
						stem: "Xung quanh hồ có cây xanh.",
						opts: null,
						answer: "TRUE",
						alts: "",
						type: "tfng",
					},
					{
						stem: "Hồ này được đặt tên là ____.",
						opts: null,
						answer: "Gươm",
						alts: "",
					},
					{
						stem: "Xung quanh hồ có nhiều cây ____.",
						opts: null,
						answer: "xanh",
						alts: "cổ thụ",
					},
				],
			},
			{
				// #286 — đề legacy 1 type dành riêng cho test header đơn (các đề
				// khác bị test trước nộp hết, link đổi sang "Xem lại kết quả").
				title: titleLegacy,
				skill: "reading",
				part: "p1",
				type: "shortans",
				note: "Đề 1 dạng.",
				passage: "<p>Tháp Rùa nằm giữa Hồ Gươm.</p>",
				questions: [
					{
						stem: "Tháp Rùa nằm ở đâu?",
						opts: null,
						answer: "Hồ Gươm",
						alts: "giữa Hồ Gươm",
					},
					{
						stem: "Tháp nằm ____ Hồ Gươm.",
						opts: null,
						answer: "giữa",
						alts: "",
					},
				],
			},
			{
				// #286 — đề reading dài cho test split-pane: passage + bài làm
				// đều tràn chiều cao pane để kiểm tra cuộn độc lập.
				title: titleSplit,
				skill: "reading",
				part: "p1",
				type: "sent",
				note: "Đề dài cho split-pane.",
				passage: `<p>${Array.from(
					{ length: 30 },
					(_, i) =>
						`Đoạn văn thứ ${i + 1} kể về lịch sử Hồ Gươm và những truyền thuyết xung quanh ngôi đền cổ bên kia hồ.`,
				).join("</p><p>")}</p>`,
				questions: Array.from({ length: 8 }, (_, i) => ({
					stem: `Theo đoạn văn, hồ có tên gọi là thứ ____ ${i + 1}.`,
					opts: null,
					answer: `năm ${i + 1}`,
					alts: "",
				})),
			},
			{
				// #301 — đề intro chia cụm: giáo viên dán các khối "Questions X–Y"
				// vào intro, KHÔNG khai type từng câu (đề cũ) — instruction của
				// giáo viên phải hiện ngay trên đúng nhóm câu của nó. Phần tử CUỐI
				// mảng để không lệch index assignmentIds[0..2] đang dùng.
				title: titleIntroSections,
				skill: "reading",
				part: "p1",
				type: "note",
				note: "Đề intro chia cụm.",
				passage:
					"<p>Văn Miếu được xây năm 1070. Đây là trường đại học đầu tiên của Việt Nam.</p>",
				intro:
					"<p>Đọc kỹ đoạn văn.</p><p>Questions 1–2</p><p>Write TRUE or FALSE for each statement.</p><p>Questions 3–4 · Flow-chart completion — Write ONE WORD ONLY from the passage for each answer.</p>",
				questions: [
					{
						stem: "Văn Miếu được xây năm ____.",
						opts: null,
						answer: "1070",
						alts: "",
					},
					{
						stem: "Đây là trường đại học ____ của Việt Nam.",
						opts: null,
						answer: "đầu tiên",
						alts: "",
					},
					{
						stem: "Văn Miếu được xây vào thế ____.",
						opts: null,
						answer: "11",
						alts: "",
					},
					{
						stem: "Trường nằm tại thành phố ____.",
						opts: null,
						answer: "Hà Nội",
						alts: "",
					},
				],
			},
			{
				// #303 — đề note, câu 1–2 KHÔNG khai type và stem không có ____ (đáp án
				// TRUE / NOT GIVEN): server suy ra tfng nên học viên có radio để chọn.
				// Phần tử CUỐI mảng để không lệch các index assignmentIds đang dùng.
				title: titleTfngNote,
				skill: "reading",
				part: "p1",
				type: "note",
				note: "Đề T/F/NG không khai dạng.",
				passage:
					"<p>Thành Cổ Loa được xây dựng vào thế kỷ thứ ba trước Công nguyên. Thành có ba vòng thành đất đắp quanh kinh đô.</p>",
				intro:
					"<p>Đọc kỹ đoạn văn.</p><p>Questions 1–2</p><p>Write TRUE, FALSE or NOT GIVEN for each statement.</p><p>Questions 3–4 · Note completion — Write ONE WORD ONLY from the passage for each answer.</p>",
				questions: [
					{
						stem: "Thành Cổ Loa được xây vào thế kỷ thứ ba trước Công nguyên.",
						opts: null,
						answer: "TRUE",
						alts: "",
					},
					{
						stem: "Thành Cổ Loa được xây để chống giặc phương Bắc.",
						opts: null,
						answer: "NOT GIVEN",
						alts: "",
					},
					{
						stem: "Thành có ____ vòng thành đất.",
						opts: null,
						answer: "ba",
						alts: "",
					},
					{
						stem: "Các vòng thành bao quanh ____.",
						opts: null,
						answer: "kinh đô",
						alts: "",
					},
				],
			},
			{
				// #304 — đề Writing prompt-only: textarea bài viết + đếm từ +
				// guard nộp thiếu từ + summary hiện bài. Phần tử CUỐI mảng để
				// không lệch index assignmentIds[0..2] đang dùng.
				title: titleWriting,
				skill: "writing",
				part: "task1",
				type: "chart",
				note: "Đề Writing sample.",
				passage: "",
				prompt:
					"<p>The graph shows the proportion of marriages and the median age of first marriages in Australia between 1960 and 2000. Summarise the information by selecting and reporting the main features.</p>",
				questions: [],
			},
			{
				// #305 — đề Speaking Part 2: cue card + intro + upload file bài
				// nói. Phần tử CUỐI mảng để không lệch index assignmentIds.
				title: titleSpeaking,
				skill: "speaking",
				part: "part2",
				type: "place",
				// "Hướng dẫn thêm" (note) — ô giáo viên thật sự nhập cho Speaking.
				note: "<p>Hãy ghi âm trong một lần, không cắt ghép.</p>",
				passage: "",
				cueTopic: "a place you like to visit",
				cuePoints: "where it is\nwhen you go there\nwhy you like it",
				questions: [],
			},
			{
				title: titleSpeakingRemove,
				skill: "speaking",
				part: "part2",
				type: "person",
				note: "",
				passage: "",
				cueTopic: "a person you admire",
				cuePoints: "who the person is\nwhy you admire them",
				questions: [],
			},
		],
	});
	assignmentMcqId = fixture.assignmentIds[0] ?? "";
	assignmentClozeId = fixture.assignmentIds[1] ?? "";
	assignmentMixedId = fixture.assignmentIds[2] ?? "";

	// Real portal signup once: signup → verify screen → mail-log link →
	// auto sign-in → overview (onboarding pre-set by the seed).
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.goto(`${STUDENT_ORIGIN}/login`);
	await page.locator("#tab-signup").click();
	await page.locator("#signup-name").fill("Quiz Taker");
	await page.locator("#signup-email").fill(studentEmail);
	await page.locator("#signup-password").fill(PASSWORD);
	await page.locator("#panel-signup button[type='submit']").click();
	await expect(page.getByText("Email chưa được xác thực")).toBeVisible({
		timeout: 15_000,
	});

	// Mail-log link → confirmation page CTA → gate routes into the portal.
	await verifyStudentEmailFromMailLog(page, studentEmail);

	// Seeded student has onboarding_completed_at → overview, no wizard.
	await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`), {
		timeout: 30_000,
	});
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();
	await context.close();
});

test.describe("Student quiz take & review", () => {
	test("take → autosave survives reload → submit guard → summary → detail → overview review row", async ({
		page,
	}) => {
		// beforeunload guard must never block the mid-attempt reload below
		// (answers are saved first); accept() keeps the navigation going.
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		// Overview row pre-submit: "Làm bài" link + Chưa nộp badge.
		const row = page.getByRole("link", { name: `Làm bài: ${titleMcq}` });
		await expect(row).toBeVisible();
		await expect(row.getByText("Chưa nộp")).toBeVisible();

		await openPaper(page, titleMcq);
		await expect(page).toHaveURL(
			new RegExp(`/learn/quizzes/${assignmentMcqId}`),
		);
		const progress = page.getByTestId("navigator-progress");
		await expect(progress).toHaveText("Đã trả lời 0/5 câu");

		// 1 radio correct (B), 1 radio wrong (A when key is C), 3 skipped.
		await page
			.locator('[data-question="0"] label', { hasText: "Chạy bộ quanh hồ" })
			.click();
		await page
			.locator('[data-question="1"] label', { hasText: "Bạn cùng lớp" })
			.click();
		await expect(progress).toHaveText("Đã trả lời 2/5 câu");

		// Deterministic terminal autosave state — reload only after `saved`.
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		await page.reload();
		const resumeDialog = page.getByRole("alertdialog", {
			name: "Tiếp tục bài làm",
		});
		await expect(resumeDialog).toBeVisible();
		await resumeDialog.getByRole("button", { name: "Tiếp tục" }).click();
		await expect(
			page.locator('[data-question="0"] input[value="B"]'),
		).toBeChecked();
		await expect(
			page.locator('[data-question="1"] input[value="A"]'),
		).toBeChecked();
		await expect(progress).toHaveText("Đã trả lời 2/5 câu");

		// Submit guard counts exactly the 3 unanswered questions.
		await page.getByRole("button", { name: "Nộp bài" }).click();
		const guard = page.getByRole("alertdialog", {
			name: "Bạn còn câu hỏi chưa làm",
		});
		await expect(guard).toContainText("Bạn còn 3 câu hỏi chưa làm.");
		await guard.getByRole("button", { name: "Nộp bài" }).click();

		// Summary counters: 1 đúng / 1 sai / 3 bỏ.
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("1");
		await expect(page.getByTestId("attempt-correct")).toHaveText("1");
		await expect(page.getByTestId("attempt-wrong")).toHaveText("1");
		await expect(page.getByTestId("attempt-skipped")).toHaveText("3");

		const list = page.getByTestId("attempt-compact-list");
		await expect(list.locator("li")).toHaveCount(5);
		await expect(
			list.locator("li").nth(0).locator("[data-verdict]"),
		).toHaveText("B");
		await expect(list.locator("li").nth(0)).toContainText("Đáp án: B");
		await expect(
			list.locator("li").nth(1).locator("[data-verdict='wrong']"),
		).toHaveText("A");
		await expect(list.locator("li").nth(1)).toContainText("Đáp án: C");
		for (const index of [2, 3, 4]) {
			await expect(
				list.locator("li").nth(index).locator("[data-verdict='skipped']"),
			).toHaveText("—");
		}

		// Detail: verdict chips + Đáp án + Giải thích (note reveal). The
		// review-mode navigator line lives on this screen, not the summary.
		await page.getByRole("link", { name: "Xem giải thích chi tiết" }).click();
		await expect(page).toHaveURL(/\/detail$/);
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đúng 1 câu · Sai 1 · Bỏ qua 3",
		);
		const q1 = page.locator('[data-question="0"]');
		await expect(q1.getByTestId("quiz-review-item")).toHaveAttribute(
			"data-verdict",
			"correct",
		);
		// Verdict block highlight (#351): fieldset câu tô theo verdict (locator
		// fieldset-scoped — data-question cũng nằm trên nút navigator).
		await expect(page.locator('fieldset[data-question="0"]')).toHaveAttribute(
			"data-verdict",
			"correct",
		);
		await expect(q1.getByTestId("quiz-review-chip")).toHaveText("Đúng");
		await expect(q1.getByText("Đáp án: B")).toBeVisible();
		const q2 = page.locator('[data-question="1"]');
		await expect(q2.getByTestId("quiz-review-item")).toHaveAttribute(
			"data-verdict",
			"wrong",
		);
		// Wrong chip shows the student's own answer so the mistake is visible.
		await expect(q2.getByTestId("quiz-review-chip")).toHaveText("A");
		await expect(q2.getByText("Đáp án: C")).toBeVisible();
		// Câu sai: hàng đáp án đúng được đánh dấu (#351).
		await expect(q2.getByText("Đáp án đúng")).toBeVisible();
		const q3 = page.locator('[data-question="2"]');
		await expect(q3.getByTestId("quiz-review-item")).toHaveAttribute(
			"data-verdict",
			"skipped",
		);
		await expect(q3.getByTestId("quiz-review-chip")).toHaveText("Chưa trả lời");
		// Bỏ qua: key vẫn được đánh dấu (chỉ verdict=correct ẩn nhãn).
		await expect(q3.getByText("Đáp án đúng")).toBeVisible();

		await q1.getByText("Giải thích").click();
		await expect(q1.getByText(NOTE_A)).toBeVisible();

		// Overview row flips to the review state after submit.
		await page.goto(`${STUDENT_ORIGIN}/`);
		const reviewedRow = page.getByRole("link", {
			name: `Xem lại kết quả: ${titleMcq}`,
		});
		await expect(reviewedRow).toBeVisible();
		await expect(reviewedRow.getByText("Đã nộp")).toBeVisible();
		await reviewedRow.click();
		// Submitted attempt → take loader redirects straight to the summary.
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toBeVisible();
	});

	test("does not leak the answer key to the take screen and counts an answer submitted before autosave", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		const quizGets = captureJsonGets(
			page,
			`/api/student/assignments/${assignmentClozeId}/quiz`,
		);
		const attemptGets = captureJsonGets(page, "/api/student/attempts/");
		let startedAttemptId = "";
		page.on("response", (res) => {
			if (
				res.request().method() === "POST" &&
				res
					.url()
					.endsWith(`/api/student/assignments/${assignmentClozeId}/quiz/start`)
			) {
				void res
					.json()
					.then((json) => {
						const attemptId = (json as { attemptId?: string }).attemptId;
						if (attemptId) startedAttemptId = attemptId;
					})
					.catch(() => {});
			}
		});

		await openPaper(page, titleCloze);
		await expect(page).toHaveURL(
			new RegExp(`/learn/quizzes/${assignmentClozeId}`),
		);
		expect(startedAttemptId, "start POST returned an attemptId").not.toBe("");
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 0/3 câu",
		);

		// Layer (a): take body text carries no answer strings.
		const takeBody = await page.locator("body").innerText();
		for (const secret of QUIZ_LEAK_STRINGS) {
			expect(takeBody, `take body leaked "${secret}"`).not.toContain(secret);
		}

		// Layer (b): GET quiz payloads carry no answer/alts/note keys.
		expect(quizGets.length).toBeGreaterThan(0);
		for (const captured of quizGets) {
			const keys = collectKeys(captured.json);
			for (const banned of [
				"answer",
				"alts",
				"note",
				"verdict",
				"key",
				"transcript",
			]) {
				expect(keys.has(banned), `quiz GET leaked key "${banned}"`).toBe(false);
			}
		}

		// Layer (c): summary GET while in_progress → 409 gate, no key, and the
		// route redirects to the overview instead of rendering a partial.
		await page.goto(
			`${STUDENT_ORIGIN}/learn/quizzes/attempt/${startedAttemptId}`,
		);
		await expect(page).toHaveURL(new RegExp(`${STUDENT_ORIGIN}/$`));
		// captureJsonGets push body async (res.json().then) — poll thay vì
		// assert tức thời để không đua với microtask capture (flake khi máy load).
		await expect
			.poll(() => attemptGets.filter((c) => c.status === 409).length, {
				timeout: 5_000,
			})
			.toBeGreaterThan(0);
		const inProgressGets = attemptGets.filter((c) => c.status === 409);
		for (const captured of inProgressGets) {
			const keys = collectKeys(captured.json);
			for (const banned of [
				"answer",
				"alts",
				"note",
				"verdict",
				"key",
				"items",
			]) {
				expect(keys.has(banned), `409 body leaked key "${banned}"`).toBe(false);
			}
		}

		// Back into the paper (empty answers → no resume dialog), fill blanks:
		// Q1 via an accepted ALT, Q2 wrong, both awaited to terminal `saved`.
		await openPaper(page, titleCloze);
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 0/3 câu",
		);
		await page.getByLabel("Điền đáp án câu 1").fill("dragon fruit");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);
		await page.getByLabel("Điền đáp án câu 2").fill("món mặn");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 2/3 câu",
		);

		// Drain variant: fill the LAST question and submit immediately — the
		// 3/3 gate only proves local state, the PATCH is still racing the
		// 600ms debounce when Nộp bài is clicked.
		await page.getByLabel("Điền đáp án câu 3").fill("khí hậu ẩm");
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 3/3 câu",
		);
		await page.getByRole("button", { name: "Nộp bài" }).click();

		// Counters: the alt answer AND the pre-save last answer both count.
		await expect(page).toHaveURL(
			new RegExp(`/learn/quizzes/attempt/${startedAttemptId}`),
		);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("2");
		await expect(page.getByTestId("attempt-correct")).toHaveText("2");
		await expect(page.getByTestId("attempt-wrong")).toHaveText("1");
		await expect(page.getByTestId("attempt-skipped")).toHaveText("0");

		const list = page.getByTestId("attempt-compact-list");
		await expect(list.locator("li")).toHaveCount(3);
		await expect(
			list.locator("li").nth(0).locator("[data-verdict='correct']"),
		).toHaveText("dragon fruit");
		await expect(list.locator("li").nth(0)).toContainText(
			"Đáp án: dragonfruit",
		);
		await expect(
			list.locator("li").nth(1).locator("[data-verdict='wrong']"),
		).toHaveText("món mặn");
		await expect(list.locator("li").nth(1)).toContainText("Đáp án: món ngon");
		await expect(
			list.locator("li").nth(2).locator("[data-verdict='correct']"),
		).toHaveText("khí hậu ẩm");
		await expect(list.locator("li").nth(2)).toContainText("Đáp án: khí hậu ẩm");
	});

	// #286 — đề trộn dạng: header cụm + instruction chuẩn đặt ngay trên từng
	// cụm; câu tfng trong đề note có pill lựa chọn; review cùng cấu trúc.
	test("mixed-type paper renders per-cluster instruction headers and typed widgets", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleMixed);
		await expect(page).toHaveURL(
			new RegExp(`/learn/quizzes/${assignmentMixedId}`),
		);
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 0/4 câu",
		);

		// 2 cụm: Questions 1–2 (tfng) + Questions 3–4 (note) — mỗi cụm có
		// nhãn dạng bài + instruction chuẩn phía trên câu của nó.
		const tfngSection = page.locator(
			'section[aria-label="Questions 1–2 · True / False / Not Given"]',
		);
		const noteSection = page.locator(
			'section[aria-label="Questions 3–4 · Note completion"]',
		);
		await expect(tfngSection).toBeVisible();
		await expect(noteSection).toBeVisible();
		await expect(
			tfngSection.getByText(
				"Do the following statements agree with the information given in the passage?",
			),
		).toBeVisible();
		await expect(
			noteSection.getByText(
				"Complete the notes below. Choose NO MORE THAN THREE WORDS from the passage for each answer.",
			),
		).toBeVisible();

		// Câu tfng trả lời bằng pill TRUE/FALSE/NOT GIVEN (hết lỗi "không có
		// chỗ nhập"); câu note vẫn là ô điền.
		await page
			.locator('[data-question="0"] label', { hasText: "FALSE" })
			.click();
		await page
			.locator('[data-question="1"] label', { hasText: "TRUE" })
			.click();
		await page.getByLabel("Điền đáp án câu 3").fill("Gươm");
		await page.getByLabel("Điền đáp án câu 4").fill("cổ thụ");
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 4/4 câu",
		);
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		await page.getByRole("button", { name: "Nộp bài" }).click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("4");

		// Review screen giữ nguyên cấu trúc cụm đã làm + split-pane như take.
		await page.getByRole("link", { name: "Xem giải thích chi tiết" }).click();
		await expect(page).toHaveURL(/\/detail$/);
		await expect(
			page.locator(
				'section[aria-label="Questions 1–2 · True / False / Not Given"]',
			),
		).toBeVisible();
		await expect(
			page.locator('section[aria-label="Questions 3–4 · Note completion"]'),
		).toBeVisible();
		await expect(page.getByTestId("reading-passage-pane")).toBeVisible();
		await expect(page.getByTestId("reading-work-pane")).toBeVisible();
	});

	// #286 — reading split-pane: passage trái / bài làm phải, cuộn độc lập ở
	// viewport rộng; xếp chồng ở viewport hẹp.
	test("reading paper splits into two independently scrolling panes on wide viewports", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleSplit);
		const passagePane = page.getByTestId("reading-passage-pane");
		const workPane = page.getByTestId("reading-work-pane");
		await expect(passagePane).toBeVisible();
		await expect(workPane).toBeVisible();

		// Desktop (≥ lg): 2 pane nằm cạnh nhau — passage bên trái.
		const passageBox = await passagePane.boundingBox();
		const workBox = await workPane.boundingBox();
		expect(passageBox?.x).toBeLessThan(workBox?.x ?? Number.POSITIVE_INFINITY);

		// Cuộn độc lập (input wheel thật của user): cuộn pane đọc — pane làm
		// và trang đứng yên; rồi cuộn pane làm — pane đọc giữ nguyên vị trí.
		await passagePane.hover();
		await page.mouse.wheel(0, 600);
		await expect
			.poll(() => passagePane.evaluate((el) => el.scrollTop))
			.toBeGreaterThan(0);
		expect(await workPane.evaluate((el) => el.scrollTop)).toBe(0);
		expect(
			await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0),
		).toBe(0);
		const passageScrolled = await passagePane.evaluate((el) => el.scrollTop);
		await workPane.hover();
		await page.mouse.wheel(0, 600);
		await expect
			.poll(() => workPane.evaluate((el) => el.scrollTop))
			.toBeGreaterThan(0);
		expect(await passagePane.evaluate((el) => el.scrollTop)).toBe(
			passageScrolled,
		);

		// Viewport hẹp (< lg): xếp chồng — 2 pane cùng cột trái.
		await page.setViewportSize({ width: 375, height: 667 });
		const stackedPassage = await passagePane.boundingBox();
		const stackedWork = await workPane.boundingBox();
		expect(Math.round(stackedPassage?.x ?? -1)).toBe(
			Math.round(stackedWork?.x ?? -2),
		);
	});

	// #286 — đề cũ 1 type: đúng 1 header cụm duy nhất, không vỡ cấu trúc cũ.
	test("single-type legacy paper shows exactly one cluster header", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleLegacy);
		await expect(
			page.locator(
				'section[aria-label="Questions 1–2 · Short-answer questions"]',
			),
		).toBeVisible();
		await expect(page.locator("article section")).toHaveCount(1);
	});

	// #301 — intro dán các khối "Questions X–Y": mỗi instruction của giáo
	// viên hiện ngay trên đúng nhóm câu (take lẫn review), đề cũ không khai
	// type từng câu vẫn được tách.
	test("intro pasted with Questions markers renders each instruction above its own question range", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleIntroSections);
		const s1 = page.locator('section[aria-label="Questions 1–2"]');
		const s2 = page.locator('section[aria-label="Questions 3–4"]');
		await expect(s1).toBeVisible();
		await expect(s2).toBeVisible();
		await expect(
			s1.getByText("Write TRUE or FALSE for each statement."),
		).toBeVisible();
		await expect(
			s2.getByText("Write ONE WORD ONLY from the passage for each answer.", {
				exact: false,
			}),
		).toBeVisible();
		await expect(s1.locator("[data-question]")).toHaveCount(2);
		await expect(s2.locator("[data-question]")).toHaveCount(2);
		// Preamble render đúng 1 lần ở đầu trang.
		await expect(page.getByText("Đọc kỹ đoạn văn.")).toHaveCount(1);
		// Navigator phẳng: không tab nhóm, đủ nút số câu theo thứ tự.
		await expect(page.getByRole("tab")).toHaveCount(0);
		await expect(page.locator("footer button[data-question]")).toHaveCount(4);

		await page.getByLabel("Điền đáp án câu 1").fill("1070");
		await page.getByLabel("Điền đáp án câu 2").fill("đầu tiên");
		await page.getByLabel("Điền đáp án câu 3").fill("11");
		await page.getByLabel("Điền đáp án câu 4").fill("Hà Nội");
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);
		await page.getByRole("button", { name: "Nộp bài" }).click();
		await page.getByRole("link", { name: "Xem giải thích chi tiết" }).click();
		await expect(page).toHaveURL(/\/detail$/);
		await expect(
			page.locator('section[aria-label="Questions 1–2"]'),
		).toBeVisible();
		await expect(
			page.locator('section[aria-label="Questions 3–4"]'),
		).toBeVisible();
	});

	// #304 — Writing paper: textarea bài viết + autosave + đếm từ theo mục
	// tiêu Task 1 + guard nộp thiếu từ + summary hiện lại bài đã nộp.
	test("writing paper: essay autosaves with live word count, survives reload and SPA return, guards a short submit, and shows on summary", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleWriting);
		// Empty-state cũ biến mất, textarea essay hiện ra.
		await expect(page.getByText("không có câu hỏi tự chấm")).toHaveCount(0);
		const textarea = page.getByLabel("Bài viết của bạn");
		await expect(textarea).toBeVisible();
		await expect(page.getByTestId("essay-word-count")).toHaveText("0");

		// Gõ bài: đếm từ live (7 từ) + mục tiêu Task 1, autosave về "saved".
		const draft = "The graph shows a clear upward trend.";
		await textarea.fill(draft);
		await expect(page.getByTestId("essay-word-count")).toHaveText("7");
		await expect(page.getByTestId("navigator-progress")).toContainText(
			"7 từ · tối thiểu 150",
		);
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		// Hard reload → resume dialog → tiếp tục: bài còn nguyên.
		await page.reload();
		const resume = page.getByRole("alertdialog", { name: "Tiếp tục bài làm" });
		await expect(resume).toBeVisible();
		await resume.getByRole("button", { name: "Tiếp tục" }).click();
		await expect(textarea).toHaveValue(draft);

		// SPA-return (RT red-team G): Thoát về overview rồi vào lại đề trong
		// cửa sổ staleTime 60s — query bị invalidate sau dispose nên loader
		// đọc essay MỚI từ server, vẫn hiện resume dialog và giữ nguyên bài.
		await page.getByRole("link", { name: "Thoát" }).click();
		await page.getByRole("link", { name: `Làm bài: ${titleWriting}` }).click();
		const resumeAgain = page.getByRole("alertdialog", {
			name: "Tiếp tục bài làm",
		});
		await expect(resumeAgain).toBeVisible();
		await resumeAgain.getByRole("button", { name: "Tiếp tục" }).click();
		await expect(page.getByLabel("Bài viết của bạn")).toHaveValue(draft);

		// Nộp thiếu từ → guard dialog copy riêng Writing; xác nhận vẫn nộp.
		await page.getByRole("button", { name: "Nộp bài" }).click();
		const guard = page.getByRole("alertdialog", {
			name: "Bài viết chưa đủ số từ",
		});
		await expect(guard).toBeVisible();
		await guard.getByRole("button", { name: "Nộp bài" }).click();

		// Summary: hiện bài + số từ, không còn score card / link chi tiết.
		await expect(
			page.getByRole("heading", { name: "Bài viết của bạn" }),
		).toBeVisible();
		await expect(page.getByText(draft)).toBeVisible();
		await expect(page.getByTestId("essay-summary-count")).toContainText("7 từ");
		await expect(
			page.getByRole("link", { name: "Xem giải thích chi tiết" }),
		).toHaveCount(0);
	});

	// #303 — câu T/F/NG nằm trong đề type điền chữ, không khai type riêng và
	// không có marker: vẫn có radio để chọn; navigator phẳng nằm ngoài pane
	// "Bài làm", trải full chiều ngang.
	test("markerless TRUE/NOT GIVEN questions in a note paper get radios and the navigator spans the full width", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);

		await openPaper(page, titleTfngNote);
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 0/4 câu",
		);

		const q1 = page.locator('[data-question="0"]');
		const q2 = page.locator('[data-question="1"]');
		const trueRadio = q1.getByRole("radio", { name: "TRUE", exact: true });
		await expect(trueRadio).toBeVisible();
		await expect(
			q1.getByRole("radio", { name: "FALSE", exact: true }),
		).toBeVisible();
		await expect(q1.getByRole("radio", { name: "NOT GIVEN" })).toBeVisible();

		// Navigator: không tab, đủ 4 nút, nằm ngoài pane "Bài làm" và rộng
		// bằng viewport (không còn bị chặn max-w).
		await expect(page.getByRole("tab")).toHaveCount(0);
		await expect(page.locator("footer button[data-question]")).toHaveCount(4);
		await expect(
			page.locator('section[aria-label="Bài làm"] footer'),
		).toHaveCount(0);
		const navBox = await page
			.getByTestId("navigator-progress")
			.locator("xpath=ancestor::footer")
			.boundingBox();
		const viewport = page.viewportSize();
		expect(navBox?.width ?? 0).toBeGreaterThanOrEqual(
			(viewport?.width ?? Number.POSITIVE_INFINITY) - 1,
		);

		await trueRadio.check();
		await q2.getByRole("radio", { name: "NOT GIVEN" }).check();
		await page.getByLabel("Điền đáp án câu 3").fill("ba");
		await page.getByLabel("Điền đáp án câu 4").fill("kinh đô");
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Đã trả lời 4/4 câu",
		);
		await expect(page.getByTestId("save-state")).toHaveAttribute(
			"data-state",
			"saved",
		);

		await page.getByRole("button", { name: "Nộp bài" }).click();
		await expect(page).toHaveURL(/\/learn\/quizzes\/attempt\//);
		await expect(page.getByTestId("attempt-correct-count")).toHaveText("4");

		await page.getByRole("link", { name: "Xem giải thích chi tiết" }).click();
		await expect(page).toHaveURL(/\/detail$/);
		const reviewQ1 = page.locator('[data-question="0"]');
		await expect(reviewQ1.getByTestId("quiz-review-item")).toHaveAttribute(
			"data-verdict",
			"correct",
		);
		await expect(
			reviewQ1.getByRole("radio", { name: "TRUE", exact: true }),
		).toBeChecked();
	});

	// #305 — Speaking: đề đúng theo part + hướng dẫn, kéo-thả file bài nói,
	// từ chối file sai định dạng, file còn sau reload, thay file, nộp và
	// nghe lại trên summary.
	test("speaking paper: drag-and-drop upload, survives reload, replace, submit and play back on summary", async ({
		page,
	}) => {
		page.on("dialog", (dialog) => void dialog.accept());
		await signIn(page);
		await openPaper(page, titleSpeaking);

		await expect(
			page.getByText("Describe a place you like to visit."),
		).toBeVisible();
		await expect(page.getByText("You should say:")).toBeVisible();
		await expect(page.getByText("Hãy ghi âm trong một lần")).toBeVisible();
		const guide = page.getByRole("region", { name: "Hướng dẫn làm bài" });
		await expect(guide).toContainText("1 phút chuẩn bị");
		await expect(page.getByText("không có câu hỏi tự chấm")).toHaveCount(0);
		const submitButton = page.getByRole("button", { name: "Nộp bài" });
		await expect(submitButton).toBeDisabled();
		await expect(page.getByTestId("navigator-progress")).toHaveText(
			"Chưa tải file bài nói",
		);

		// Kéo-thả file thật → tải lên → player + Xoá, nút Nộp mở.
		await dropMediaFile(
			page,
			"speaking-sample.mp3",
			"audio/mpeg",
			SPEAKING_SAMPLE,
		);
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"speaking-sample.mp3",
		);
		await expect(page.getByRole("button", { name: "Xoá" })).toBeVisible();
		await expect(page.getByLabel("Bản ghi bài nói")).toBeAttached();
		await expect(submitButton).toBeEnabled();

		// "Thay file" bằng PDF → bị từ chối ở client, file cũ còn nguyên.
		await page.getByTestId("speaking-replace-input").setInputFiles({
			name: "bai-lam.pdf",
			mimeType: "application/pdf",
			buffer: Buffer.from("%PDF-1.4 not audio"),
		});
		await expect(page.getByText("Định dạng không hỗ trợ")).toBeVisible();
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"speaking-sample.mp3",
		);

		// Reload: file vẫn còn; "Nghe lại" tải blob qua API.
		await page.reload();
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"speaking-sample.mp3",
		);
		await page.getByRole("button", { name: "Nghe lại bài nói" }).click();
		await expect(page.locator('audio[src^="blob:"]')).toBeAttached();

		// Thay file hợp lệ: tên mới thay tên cũ.
		await page.getByTestId("speaking-replace-input").setInputFiles({
			name: "answer-v2.mp3",
			mimeType: "audio/mpeg",
			buffer: SPEAKING_SAMPLE,
		});
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"answer-v2.mp3",
		);

		// Nộp → summary hiện bài nói, nghe lại được, không có score card.
		await submitButton.click();
		await expect(
			page.getByRole("heading", { name: "Bài nói của bạn" }),
		).toBeVisible();
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"answer-v2.mp3",
		);
		await expect(
			page.getByText("Giáo viên sẽ chấm bài nói của bạn."),
		).toBeVisible();
		await expect(
			page.getByRole("link", { name: "Xem giải thích chi tiết" }),
		).toHaveCount(0);
		await page.getByRole("button", { name: "Nghe lại bài nói" }).click();
		await expect(page.locator('audio[src^="blob:"]')).toBeAttached();
	});

	test("speaking paper: removing the file disables submit again", async ({
		page,
	}) => {
		await signIn(page);
		await openPaper(page, titleSpeakingRemove);
		const submitButton = page.getByRole("button", { name: "Nộp bài" });

		await dropMediaFile(
			page,
			"speaking-sample.mp3",
			"audio/mpeg",
			SPEAKING_SAMPLE,
		);
		await expect(submitButton).toBeEnabled();

		await page.getByRole("button", { name: "Xoá" }).click();
		const confirm = page.getByRole("alertdialog", {
			name: "Xoá file bài nói?",
		});
		await confirm.getByRole("button", { name: "Xoá" }).click();

		await expect(
			page.getByRole("button", { name: /Kéo thả file/ }),
		).toBeVisible();
		await expect(page.getByTestId("speaking-media-name")).toHaveCount(0);
		await expect(submitButton).toBeDisabled();
		await expect(
			page.getByText("Tải file bài nói lên để nộp bài."),
		).toBeVisible();
	});

	test("speaking paper: leaving mid-upload asks first, cancel returns to the dropzone, retry succeeds", async ({
		page,
	}) => {
		await signIn(page);
		await openPaper(page, titleSpeakingRemove);

		// Giữ PUT lại trong trình duyệt: upload treo ở trạng thái đang tải.
		let release: () => void = () => undefined;
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		await page.route("**/api/student/attempts/*/media", async (route) => {
			if (route.request().method() !== "PUT") return route.continue();
			await held;
			await route.continue().catch(() => undefined);
		});

		await dropMediaFile(
			page,
			"speaking-sample.mp3",
			"audio/mpeg",
			SPEAKING_SAMPLE,
		);
		await expect(page.getByRole("progressbar")).toBeVisible();
		const submitButton = page.getByRole("button", { name: "Nộp bài" });
		await expect(submitButton).toBeDisabled();

		// "Thoát" trong lúc đang tải → hỏi xác nhận; Ở lại thì vẫn ở take screen.
		await page.getByRole("link", { name: "Thoát" }).click();
		const leave = page.getByRole("alertdialog", {
			name: "Đang tải file bài nói",
		});
		await expect(leave).toBeVisible();
		await leave.getByRole("button", { name: "Ở lại" }).click();
		await expect(leave).toHaveCount(0);
		await expect(page.getByRole("progressbar")).toBeVisible();

		// Hủy → về dropzone, chưa có file, vẫn không nộp được.
		await page.getByRole("button", { name: "Hủy" }).click();
		await expect(
			page.getByRole("button", { name: /Kéo thả file/ }),
		).toBeVisible();
		await expect(page.getByTestId("speaking-media-name")).toHaveCount(0);
		await expect(submitButton).toBeDisabled();

		// Bỏ chặn mạng, tải lại → thành công.
		release();
		await page.unroute("**/api/student/attempts/*/media");
		await dropMediaFile(
			page,
			"speaking-sample.mp3",
			"audio/mpeg",
			SPEAKING_SAMPLE,
		);
		await expect(page.getByTestId("speaking-media-name")).toHaveText(
			"speaking-sample.mp3",
		);
		await expect(submitButton).toBeEnabled();
	});
});
