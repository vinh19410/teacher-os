import { expect, test } from "@playwright/test";
import {
	fillRichEditor,
	seedStudent,
	selectWritingTask2,
	signUpViaApi,
} from "./helpers";
import { API_ORIGIN, LMS_ORIGIN } from "./origins";

/**
 * Issue #208 / #267 / #979 / #983 — Trang Bài tập (redesign theo open-design/assignments.html):
 * KPI tiles, filter dropdowns (Phần thi, Trạng thái, Sắp xếp), skill segmented tabs,
 * search + debounce, drawer/split preview + tab Lịch sử giao, giao đề cho nhiều lớp,
 * nhân bản sang bản nháp, và xóa bản nháp.
 */
test("bank lists prompts with filters, search, and preview", async ({
	page,
}) => {
	await signUpViaApi(page);

	// Seed: 1 ready Task 2 prompt + 1 draft Task 1 prompt via /assignments/new.
	await page.goto("/teacher/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Discuss");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people think QC-208 bank discuss prompt body.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	await page.getByRole("button", { name: "Tạo đề khác" }).click();
	await page.getByRole("button", { name: "Bản nháp" }).first().click();
	await page.getByRole("button", { name: "Task 1 · 150 từ" }).first().click();
	await page.getByLabel("Tiêu đề").fill("QC-208 Bank Chart Draft");
	await fillRichEditor(
		page,
		"Nội dung đề",
		"The chart below shows QC-208 draft chart body.",
	);
	await page.getByRole("button", { name: "Lưu bản nháp" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã lưu bản nháp" }),
	).toBeVisible();

	// /assignments hiển thị trực tiếp danh sách bài tập đã tạo.
	await page.goto("/teacher/assignments");
	await expect(page.getByRole("heading", { name: "Bài tập" })).toBeVisible();

	// Both rows visible + count 2/2.
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();
	await expect(page.getByText(/Hiện 2 \/ 2 đề/).first()).toBeVisible();
	await expect(page.getByText("Sẵn sàng").first()).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();

	// Filter Task 1 via Phần thi select → only the draft row.
	await page.getByLabel("Phần thi").selectOption("writing:task1");
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toHaveCount(0);

	// Search with no match → filter-empty state.
	await page.getByLabel("Tìm đề").fill("zzz-no-match");
	await expect(
		page.getByRole("heading", { name: "Không có đề khớp bộ lọc" }),
	).toBeVisible();
	await expect(
		page.getByText(
			"Thử từ khóa ngắn hơn, chọn kỹ năng khác, hoặc xóa bộ lọc để xem lại toàn bộ ngân hàng.",
		),
	).toBeVisible();

	// "Xóa bộ lọc" resets everything (part, query).
	await page.getByRole("button", { name: "Xóa bộ lọc" }).first().click();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Chart Draft" }),
	).toBeVisible();

	// Click the draft row → preview drawer shows student view & Xem trước CTA.
	await page.getByRole("button", { name: /QC-208 Bank Chart Draft/ }).click();
	await expect(
		page.getByRole("tab", { name: "Đề phía học viên" }),
	).toBeVisible();
	await expect(
		page.getByText(
			"Bản nháp chỉ bạn nhìn thấy. Học viên chưa nhận được đề này.",
		),
	).toBeVisible();

	// Xem trước (#282) → trang riêng góc nhìn học viên (?id=).
	await page.getByRole("button", { name: "Xem trước", exact: true }).click();
	await expect(page).toHaveURL(/\/teacher\/assignments\/preview\?id=/);
	await expect(page.getByText("QC-208 Bank Chart Draft").first()).toBeVisible();
	await expect(page.getByText("Xem trước phía học viên").first()).toBeVisible();
	await page.getByRole("button", { name: "Quay lại danh sách" }).click();
	await expect(page).toHaveURL(/\/teacher\/assignments$/);
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();

	// Persistence: reload keeps the list.
	await page.reload();
	await expect(
		page.getByRole("heading", { name: "QC-208 Bank Discuss" }),
	).toBeVisible();
});

test("bank supports direct class assignment (#983), history tab (#979), duplicate, and draft deletion", async ({
	page,
}) => {
	const CLASS_NAME = "E2E Bank Class 983";
	const STUDENT_NAME = "HV Bank 983";
	const PROMPT_TITLE = "QC-983 Bank Writing Ready";

	const teacherEmail = await signUpViaApi(page);
	await seedStudent({ teacherEmail, name: STUDENT_NAME });

	// Create class and activate 1 student
	await page.getByText("Lớp học", { exact: true }).first().click();
	await page.getByRole("button", { name: "+ Tạo lớp" }).click();
	const classDialog = page.getByRole("dialog");
	await classDialog.getByLabel("Tên lớp *").fill(CLASS_NAME);
	await classDialog
		.getByRole("button", { name: "Writing", exact: true })
		.click();
	await classDialog.getByRole("button", { name: "T2", exact: true }).click();
	await classDialog.getByRole("button", { name: "T4", exact: true }).click();
	await classDialog
		.getByRole("button", { name: "Tạo lớp", exact: true })
		.click();
	await expect(classDialog).toBeHidden();

	await page.getByText(CLASS_NAME).click();
	await page.getByRole("tab", { name: "Học viên", exact: true }).click();
	await page.getByRole("button", { name: "+ Thêm học viên vào lớp" }).click();
	const enrollDialog = page.getByRole("dialog");
	await enrollDialog.getByRole("option", { name: STUDENT_NAME }).click();
	await enrollDialog.getByRole("button", { name: "Lưu", exact: true }).click();
	await expect(enrollDialog).toBeHidden();
	await page.getByRole("button", { name: "Kích hoạt" }).click();
	const confirmModal = page
		.getByRole("dialog")
		.filter({ hasText: "Kích hoạt học viên?" });
	await confirmModal.getByRole("button", { name: "Kích hoạt" }).click();
	await expect(confirmModal).toBeHidden();

	// Create ready prompt
	await page.goto("/teacher/assignments/new");
	await selectWritingTask2(page);
	await page.getByLabel("Tiêu đề").fill(PROMPT_TITLE);
	await fillRichEditor(
		page,
		"Nội dung đề",
		"Some people believe technology improves communication.",
	);
	await page.getByRole("button", { name: "Lưu vào ngân hàng" }).first().click();
	await expect(
		page.getByRole("heading", { name: "Đã thêm vào ngân hàng" }),
	).toBeVisible();

	// Assign directly from /teacher/assignments (#983)
	await page.goto("/teacher/assignments");
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await page.getByRole("button", { name: "Giao cho lớp" }).last().click();

	const assignModal = page.getByRole("dialog", { name: "Giao đề cho lớp" });
	await expect(assignModal).toBeVisible();
	await assignModal.getByLabel(new RegExp(CLASS_NAME)).check();
	await assignModal.getByRole("button", { name: "Giao đề" }).click();
	await expect(assignModal).toBeHidden();

	// History tab displays real class assignment (#979) and survives reload
	await expect(page.getByText(CLASS_NAME).first()).toBeVisible();
	await expect(page.getByText("Đã nộp 0/1").first()).toBeVisible();
	await expect(page.getByText("Đang mở").first()).toBeVisible();

	await page.reload();
	await expect(page.getByText("Đã giao 1 lớp").first()).toBeVisible();
	await page.getByRole("button", { name: new RegExp(PROMPT_TITLE) }).click();
	await page.getByRole("tab", { name: "Lịch sử giao" }).click();
	await expect(page.getByText(CLASS_NAME).first()).toBeVisible();

	// Duplicate prompt as draft
	await page.getByRole("button", { name: "Nhân bản" }).last().click();
	const dupTitle = `${PROMPT_TITLE} (bản sao)`;
	await expect(page.getByRole("heading", { name: dupTitle })).toBeVisible();

	await page.reload();
	await expect(page.getByRole("heading", { name: dupTitle })).toBeVisible();
	await expect(page.getByText("Bản nháp").first()).toBeVisible();

	// Delete duplicated draft permanently
	await page.getByRole("button", { name: dupTitle }).click();
	await page.getByRole("button", { name: "Xóa nháp" }).click();
	const deleteDialog = page.getByRole("dialog", { name: "Xóa bản nháp?" });
	await expect(deleteDialog).toBeVisible();
	await deleteDialog.getByRole("button", { name: "Xóa bản nháp" }).click();
	await expect(deleteDialog).toBeHidden();
	await expect(page.getByRole("heading", { name: dupTitle })).toHaveCount(0);

	await page.reload();
	await expect(page.getByRole("heading", { name: dupTitle })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: PROMPT_TITLE })).toBeVisible();
});

test("bank student paper preview hides band and secret answer keys (#847)", async ({
	page,
}) => {
	await signUpViaApi(page);
	const res = await page.request.post(`${API_ORIGIN}/api/assignments/prompts`, {
		data: {
			skill: "reading",
			part: "p2",
			type: "summary",
			title: "QC-847 Reading Leak Guard",
			band: "7.5",
			source: "Cambridge 19",
			prompt: "",
			passage: "Passage text QC-847 solar collectors heat water.",
			intro: "Complete the summary below.",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			questions: [
				{
					stem: "Solar panels convert ____ into electricity.",
					opts: null,
					answer: "SECRET_BANK_ANSWER",
					alts: "SECRET_BANK_ALT",
				},
			],
			optionBank: [],
			note: "",
			status: "ready",
		},
		headers: { "Content-Type": "application/json", Origin: LMS_ORIGIN },
	});
	expect(res.status()).toBe(201);

	await page.goto("/teacher/assignments");
	await page.getByRole("button", { name: /QC-847 Reading Leak Guard/ }).click();
	const panel = page.getByRole("tabpanel");
	await expect(panel).toContainText("Passage text QC-847");
	await expect(panel).toContainText("Solar panels convert");
	await expect(panel).not.toContainText("SECRET_BANK_ANSWER");
	await expect(panel).not.toContainText("SECRET_BANK_ALT");
	await expect(panel).not.toContainText("Band 7.5");
});
