/**
 * #998 — Gộp tab "Hành trình học" & "Giáo trình", trang chi tiết buổi học viên,
 * cắt PDF sách gốc theo buổi (pdf-lib) và bài tập theo buổi (upload file/link +
 * gắn bài tập tương tác từ Ngân hàng đề).
 *
 * Kèm chụp ảnh POT 3 viewport (1440×900, 768×1024, 375×812) Light/Dark và kiểm
 * tra không tràn ngang (gồm cả reflow 320px).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { createClient } from "@libsql/client";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
	acceptEnrollment,
	addDaysISO,
	orgIdForTeacherEmail,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
	vnWeekdayMon0,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import {
	API_ORIGIN,
	LMS_ORIGIN,
	STUDENT_BASE_URL,
	TEACHER_BASE_URL,
	WEB_ORIGIN,
} from "./origins";

const REPORTS_DIR = fileURLToPath(
	new URL("../../../plans/reports/", import.meta.url),
);
const PASSWORD = "password-8chars";

/**
 * Tạo PDF hợp lệ N trang với bảng xref đúng chuẩn để `pdf-lib` đọc và cắt trang
 * chính xác mà không cần thêm dependency cho gói `e2e`.
 */
function buildValidMultiPagePdf(pageCount: number): Buffer {
	const chunks: string[] = ["%PDF-1.4\n"];
	const offsets: number[] = [0];
	const addObj = (id: number, body: string) => {
		offsets[id] = Buffer.byteLength(chunks.join(""), "utf8");
		chunks.push(`${id} 0 obj\n${body}\nendobj\n`);
	};

	const kids: string[] = [];
	for (let i = 0; i < pageCount; i += 1) {
		kids.push(`${3 + i} 0 R`);
	}
	addObj(1, "<< /Type /Catalog /Pages 2 0 R >>");
	addObj(2, `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`);
	for (let i = 0; i < pageCount; i += 1) {
		addObj(
			3 + i,
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${300 + i * 10} 420] >>`,
		);
	}

	const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
	const totalObjs = 3 + pageCount;
	chunks.push(`xref\n0 ${totalObjs}\n`);
	chunks.push("0000000000 65535 f \n");
	for (let i = 1; i < totalObjs; i += 1) {
		chunks.push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
	}
	chunks.push(
		`trailer\n<< /Size ${totalObjs} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
	);
	return Buffer.from(chunks.join(""), "utf8");
}

async function setTheme(page: Page, theme: "light" | "dark") {
	await page.evaluate((next) => {
		document.documentElement.classList.toggle("dark", next === "dark");
		window.localStorage.setItem("teacher-os-theme", next);
	}, theme);
	await page.waitForTimeout(150);
}

async function assertNoHorizontalOverflow(page: Page, widths: number[]) {
	for (const width of widths) {
		await page.setViewportSize({ width, height: 812 });
		await page.waitForTimeout(150);
		const overflow = await page.evaluate(
			() =>
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		);
		expect(overflow, `overflow at width=${width}`).toBe(false);
	}
}

async function newIsolatedContext(context: BrowserContext) {
	const browser = context.browser();
	if (!browser) throw new Error("Playwright browser is unavailable");
	return browser.newContext();
}

test("#998: giáo viên cắt PDF sách gốc & giao bài theo buổi → học viên xem tab Hành trình học gộp & trang chi tiết buổi", async ({
	page,
	context,
}) => {
	test.setTimeout(120_000);
	const stamp = Date.now();
	const today = vietnamTodayISO();
	const startDate = addDaysISO(today, 1);
	const className = `IELTS Writing K998 ${stamp}`;
	const promptTitle = `Writing Task 2 — Giáo dục (${stamp})`;
	const studentEmail = `student.998.${stamp}@test.local`;
	const studentName = "Nguyễn Minh Anh";

	// 1. Tạo giáo viên + template giáo trình 2 module / 3 bài
	const teacherEmail = await signUpViaApi(page, {
		name: `Cô Lan ${stamp}`,
	});
	const orgId = await orgIdForTeacherEmail(teacherEmail);

	const tplRes = await page.request.post(
		`${API_ORIGIN}/api/syllabus-templates`,
		{
			data: {
				name: `Giáo trình IELTS Writing ${stamp}`,
				type: "ielts",
				level: "Band 6.5",
				skills: ["Writing"],
				description: "Lộ trình luyện viết học thuật 2 chặng",
				totalLessons: 3,
				modules: [
					{
						title: "Module 1: Nền tảng Task 2",
						description: "Cấu trúc đoạn văn và mở bài",
						lessons: [
							{
								title: "Bài 1: Mở bài & Luận điểm chính",
								objectives:
									"Phân tích đề bài và viết mở bài đủ 2 câu rõ lập trường.",
								materials: "Ghi chú nội bộ GV: kiểm tra lỗi thì",
								kind: "lesson",
							},
							{
								title: "Bài 2: Phát triển thân bài PEEL",
								objectives: "Triển khai luận cứ kèm ví dụ cụ thể.",
								materials: "",
								kind: "lesson",
							},
						],
					},
					{
						title: "Module 2: Luyện đề thực chiến",
						description: "Viết bài hoàn chỉnh có bấm giờ",
						lessons: [
							{
								title: "Bài 3: Thi thử giữa kỳ",
								objectives: "Hoàn thành bài viết 250 từ trong 40 phút.",
								materials: "",
								kind: "midterm",
							},
						],
					},
				],
			},
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(tplRes.status()).toBe(201);
	const { id: templateId } = (await tplRes.json()) as { id: string };

	// 2. Tạo lớp gắn giáo trình + thêm học viên + kích hoạt ghi danh
	const classId = await seedDatedClass(page, {
		name: className,
		templateId,
		startDate,
		schedule: {
			days: [vnWeekdayMon0(startDate), (vnWeekdayMon0(startDate) + 2) % 7],
			start: "19:00",
			end: "20:30",
		},
		sessionsTotal: 3,
	});
	const st = await seedStudent({
		teacherEmail,
		name: studentName,
		email: studentEmail,
		onboarded: true,
	});
	const enrollRes = await page.request.post(
		`${API_ORIGIN}/api/classes/${classId}/enroll`,
		{
			data: { studentId: st.id },
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(enrollRes.status()).toBe(201);
	const { id: enrollmentId } = (await enrollRes.json()) as { id: string };
	await acceptEnrollment(page, enrollmentId);

	// Tạo sẵn 1 đề Ready trong Ngân hàng đề để giao gắn buổi qua UI giáo viên
	const db = createClient({
		url: `file:${new URL("../local.db", import.meta.url).pathname}`,
	});
	await db.execute("PRAGMA busy_timeout = 5000;");
	await db.execute({
		sql: `INSERT INTO assignment_prompt (
			id, org_id, task, genre, skill, part, type, title, band, source, prompt, status, created_at
		) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		args: [
			crypto.randomUUID(),
			orgId,
			"task2",
			"opinion",
			"writing",
			"task2",
			"opinion",
			promptTitle,
			"6.5",
			"Cambridge 18",
			"<p>Some people believe university education should be free for all students.</p>",
			"ready",
			Date.now(),
		],
	});
	db.close();

	// 3. Giáo viên mở trang chi tiết lớp, cắt PDF sách gốc 6 trang → tr. 2–4 cho buổi 1
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(`${TEACHER_BASE_URL}/classes/${classId}`);
	await expect(
		page.getByRole("heading", { level: 1, name: className }),
	).toBeVisible({ timeout: 20_000 });

	await page.getByRole("button", { name: "Cắt sách theo buổi" }).click();
	const sliceDialog = page.getByRole("dialog", {
		name: "Cắt bài giảng từ sách PDF gốc",
	});
	await expect(sliceDialog).toBeVisible();

	const sixPagePdf = buildValidMultiPagePdf(6);
	await sliceDialog.getByLabel("Chọn file sách PDF từ máy tính").setInputFiles({
		name: "Cambridge-IELTS-18-Writing.pdf",
		mimeType: "application/pdf",
		buffer: sixPagePdf,
	});
	await expect(sliceDialog.getByTestId("slice-book-loaded")).toContainText(
		"6 trang",
	);

	const firstRow = sliceDialog.getByTestId(`slice-row-${startDate}`);
	await firstRow.getByLabel("Từ trang").fill("2");
	await firstRow.getByLabel("Đến trang").fill("4");

	if (process.env.CAPTURE_POT === "1") {
		await page.screenshot({
			path: `${REPORTS_DIR}998-teacher-slice-book-1440-light.png`,
			fullPage: true,
		});
	}

	await sliceDialog
		.getByRole("button", { name: /Cắt & gắn bài giảng/ })
		.click();
	await expect(sliceDialog).toBeHidden({ timeout: 20_000 });

	// 4. Giáo viên mở modal Tài liệu buổi 1, kiểm tra Bài giảng đã cắt, upload bài tập & giao bài tương tác gắn buổi
	const firstSessionRow = page.getByTestId("session-row").first();
	await firstSessionRow.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const matDialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(matDialog).toBeVisible();
	await expect(matDialog).toContainText(
		"Cambridge-IELTS-18-Writing.pdf · tr. 2–4",
	);

	// Chuyển tab Bài tập buổi học -> tải file PDF bài tập + thêm link bài tập
	await matDialog.getByRole("tab", { name: /Bài tập buổi học/ }).click();
	await matDialog.getByLabel("Chọn file tải lên cho buổi học").setInputFiles({
		name: "phieu-bai-tap-buoi-1.pdf",
		mimeType: "application/pdf",
		buffer: buildValidMultiPagePdf(1),
	});
	await expect(matDialog).toContainText("phieu-bai-tap-buoi-1", {
		timeout: 15_000,
	});

	await matDialog.getByRole("button", { name: "Thêm liên kết" }).click();
	const linkDialog = page.getByRole("dialog", {
		name: "Thêm liên kết bài tập",
	});
	await linkDialog.getByLabel("Tiêu đề").fill("Link nộp dàn ý Google Docs");
	await linkDialog
		.getByLabel("Đường dẫn")
		.fill("https://docs.google.com/document/d/demo-998");
	await linkDialog.getByRole("button", { name: "Thêm liên kết" }).click();
	await expect(matDialog).toContainText("Link nộp dàn ý Google Docs");

	if (process.env.CAPTURE_POT === "1") {
		await page.screenshot({
			path: `${REPORTS_DIR}998-teacher-session-homework-1440-light.png`,
			fullPage: true,
		});
	}

	// Bấm "Giao bài từ ngân hàng đề" -> mở AssignClassPromptModal đã chọn sẵn buổi 1
	await matDialog
		.getByRole("button", { name: "Giao bài từ ngân hàng đề" })
		.click();
	const assignDialog = page.getByRole("dialog", {
		name: new RegExp(`Giao bài tập · ${className}`),
	});
	await expect(assignDialog).toBeVisible();
	await expect(
		assignDialog.getByLabel("Gắn với buổi học (không bắt buộc)"),
	).toHaveValue(startDate);
	await assignDialog
		.getByRole("button")
		.filter({ hasText: promptTitle })
		.click();
	await assignDialog.getByRole("button", { name: "Giao bài tập" }).click();
	await expect(assignDialog).toBeHidden({ timeout: 15_000 });

	// 5. Học viên đăng nhập & xác minh tab gộp + trang chi tiết buổi học
	const studentContext = await newIsolatedContext(context);
	const studentPage = await studentContext.newPage();
	try {
		await studentPage.setViewportSize({ width: 1440, height: 900 });
		await studentPage.goto(`${LMS_ORIGIN}/login`);
		await studentPage.locator("#tab-signup").click();
		await studentPage.locator("#signup-name").fill(studentName);
		await studentPage.locator("#signup-email").fill(studentEmail);
		await studentPage.locator("#signup-password").fill(PASSWORD);
		await studentPage.locator("#panel-signup button[type='submit']").click();
		await expect(studentPage.getByText("Email chưa được xác thực")).toBeVisible(
			{ timeout: 15_000 },
		);
		await verifyStudentEmailFromMailLog(studentPage, studentEmail);
		await expect(studentPage).toHaveURL(new RegExp(`^${STUDENT_BASE_URL}/?$`), {
			timeout: 30_000,
		});

		await studentPage
			.getByTestId("class-card")
			.filter({ hasText: className })
			.getByRole("link", { name: className })
			.click();
		await expect(
			studentPage.getByRole("heading", { level: 1, name: className }),
		).toBeVisible();

		// Chỉ còn 3 tab gộp (không còn tab Giáo trình)
		const tabs = studentPage.getByRole("tab");
		await expect(tabs).toHaveCount(3);
		await expect(tabs).toHaveText([
			"Hành trình học",
			"Bài tập",
			"Tài liệu chung",
		]);
		await expect(
			studentPage.getByTestId("journey-syllabus-header"),
		).toContainText(`Giáo trình IELTS Writing ${stamp}`);
		await expect(
			studentPage.getByText("Module 1: Nền tảng Task 2"),
		).toBeVisible();
		await expect(
			studentPage.getByText("Module 2: Luyện đề thực chiến"),
		).toBeVisible();
		await expect(studentPage.getByText("1 bài giảng")).toBeVisible();
		await expect(studentPage.getByText("3 bài tập")).toBeVisible();
		// Không bao giờ rò ghi chú nội bộ giáo viên
		await expect(studentPage.locator("body")).not.toContainText(
			"Ghi chú nội bộ GV",
		);

		// Kiểm tra tràn ngang & chụp POT tab Hành trình học (3 viewport + Dark)
		if (process.env.CAPTURE_POT === "1") {
			await setTheme(studentPage, "light");
			await studentPage.setViewportSize({ width: 1440, height: 900 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-journey-1440-light.png`,
				fullPage: true,
			});
			await setTheme(studentPage, "dark");
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-journey-1440-dark.png`,
				fullPage: true,
			});
			await setTheme(studentPage, "light");
			await studentPage.setViewportSize({ width: 768, height: 1024 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-journey-768-light.png`,
				fullPage: true,
			});
			await studentPage.setViewportSize({ width: 375, height: 812 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-journey-375-light.png`,
				fullPage: true,
			});
		}
		await assertNoHorizontalOverflow(studentPage, [1440, 768, 375, 320]);
		await studentPage.setViewportSize({ width: 1440, height: 900 });

		// Bấm vào Buổi 1 mở trang chi tiết buổi học
		await studentPage.getByTestId(`session-link-${startDate}`).click();
		await expect(studentPage).toHaveURL(
			`${STUDENT_BASE_URL}/classes/${classId}/sessions/${startDate}`,
		);
		await expect(studentPage.getByText("Buổi 1/3")).toBeVisible();
		await expect(
			studentPage.getByText("Module 1: Nền tảng Task 2"),
		).toBeVisible();
		await expect(
			studentPage.getByText(
				"Phân tích đề bài và viết mở bài đủ 2 câu rõ lập trường.",
			),
		).toBeVisible();

		// Xác minh Bài giảng cắt đúng trang 2–4 (chỉ chứa 3 trang trong file PDF tải về)
		const lecturesSection = studentPage.getByTestId("session-lectures-section");
		await expect(lecturesSection).toContainText("Trang 2–4");
		await expect(lecturesSection).toContainText(
			"Từ sách: Cambridge-IELTS-18-Writing.pdf",
		);
		const downloadPromise = studentPage.waitForEvent("download");
		await lecturesSection.getByRole("link", { name: /^Tải/ }).first().click();
		const download = await downloadPromise;
		const filePath = await download.path();
		expect(filePath).toBeTruthy();
		const downloadedBuf = readFileSync(filePath as string);
		const downloadedText = downloadedBuf.toString("latin1");
		expect(downloadedText.startsWith("%PDF-")).toBe(true);
		// pdf-lib nén object stream bằng FlateDecode; giải nén stream để kiểm đúng /Count 3 (chỉ 3 trang đã cắt, không phải 6 trang sách gốc)
		let unpackedText = downloadedText;
		const streamStart = downloadedBuf.indexOf(Buffer.from("stream\n"));
		const streamEnd =
			streamStart >= 0
				? downloadedBuf.indexOf(Buffer.from("\nendstream"), streamStart)
				: -1;
		if (streamStart >= 0 && streamEnd > streamStart) {
			try {
				unpackedText += inflateSync(
					downloadedBuf.subarray(streamStart + 7, streamEnd),
				).toString("latin1");
			} catch {
				// Fallback to raw text when uncompressed
			}
		}
		expect(unpackedText).toContain("/Count 3");
		expect(unpackedText).not.toContain("/Count 6");

		// Xác minh Bài tập của buổi: cả bài tập tương tác lẫn file/link upload
		const hwSection = studentPage.getByTestId("session-homework-section");
		await expect(hwSection).toContainText(promptTitle);
		await expect(
			hwSection.getByRole("link", { name: `Làm bài: ${promptTitle}` }),
		).toBeVisible();
		await expect(hwSection).toContainText("phieu-bai-tap-buoi-1");
		await expect(hwSection).toContainText("Link nộp dàn ý Google Docs");

		if (process.env.CAPTURE_POT === "1") {
			await setTheme(studentPage, "light");
			await studentPage.setViewportSize({ width: 1440, height: 900 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-session-1440-light.png`,
				fullPage: true,
			});
			await setTheme(studentPage, "dark");
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-session-1440-dark.png`,
				fullPage: true,
			});
			await setTheme(studentPage, "light");
			await studentPage.setViewportSize({ width: 768, height: 1024 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-session-768-light.png`,
				fullPage: true,
			});
			await studentPage.setViewportSize({ width: 375, height: 812 });
			await studentPage.screenshot({
				path: `${REPORTS_DIR}998-student-session-375-light.png`,
				fullPage: true,
			});
		}
		await assertNoHorizontalOverflow(studentPage, [1440, 768, 375, 320]);
		await studentPage.setViewportSize({ width: 1440, height: 900 });

		// Điều hướng sang Buổi tiếp theo -> quay lại lớp
		await studentPage
			.getByRole("navigation", { name: "Chuyển buổi học" })
			.getByRole("link", { name: /Buổi tiếp theo/ })
			.click();
		await expect(studentPage.getByText("Buổi 2/3")).toBeVisible();
		await studentPage
			.getByRole("link", { name: `Quay lại ${className}` })
			.click();
		await expect(studentPage).toHaveURL(
			`${STUDENT_BASE_URL}/classes/${classId}`,
		);
	} finally {
		await studentContext.close();
	}
});
