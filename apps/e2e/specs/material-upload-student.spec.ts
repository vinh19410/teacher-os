/**
 * Luồng file thật + media của ngân hàng tài liệu và cổng học viên đa-org
 * (#647, nguồn: hậu kiểm độc lập #644):
 *
 * - E1: upload MP3 thật vào ngân hàng bằng PUT raw body với `X-File-Name`
 *   Unicode, tải về đủ byte.
 * - E2: hợp đồng preflight CORS cho `PUT /api/materials/files` (origin hợp lệ
 *   echoes + `PUT`/`X-File-Name` cho phép; origin lạ bị từ chối).
 * - E4: nút «Phát» của giáo viên mở tab `MediaDocument` phát được MP3 dưới
 *   `INLINE_MEDIA_CSP` thật (có `media-src 'self'` + `sandbox
 *   allow-same-origin`, không `allow-scripts`, kèm `COOP: same-origin` và
 *   `Referrer-Policy: no-referrer`).
 * - E3: seed học viên Org A (trước) + lớp 1 buổi; upload PDF thẳng vào buổi
 *   và gắn thêm MP3 từ ngân hàng.
 * - E5: học viên đa-org — mặc định rơi vào org mới nhất (Org B); không có
 *   `?org=` → 404; sau khi đổi sang Org A, `src`/`href` mang `?org=`, audio
 *   nạp được, popup «Mở» phát được và «Tải» về đúng tên + byte.
 * - E6: học viên chỉ thuộc Org B bị chặn 404 khi không kèm `?org=`, bị chặn
 *   403 STUDENT_ORG_MISMATCH khi kèm `?org=` của Org A (#675), và cổng học viên
 *   tự phục hồi khi `localStorage.active_student_org_id` trỏ vào org lạ.
 *
 * Seed bằng API/DB (helpers.ts, helpers-dated-class.ts) để không đụng UI seed.
 */
import { readFileSync } from "node:fs";
import {
	type BrowserContext,
	type Download,
	expect,
	type Page,
	test,
} from "@playwright/test";
import {
	acceptEnrollment,
	orgIdForTeacherEmail,
	seedStudent,
	signUpViaApi,
	verifyStudentEmailFromMailLog,
	vietnamTodayISO,
} from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, STUDENT_ORIGIN, WEB_ORIGIN } from "./origins";

const SPEAKING_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);

/** PDF tối thiểu hợp lệ `%PDF-1.4 … %%EOF` — marker duy nhất theo lần chạy. */
function minimalPdfBytes(marker: string): Buffer {
	return Buffer.from(
		[
			"%PDF-1.4",
			"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
			"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
			"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >> endobj",
			`% ${marker}`,
			"%%EOF",
		].join("\n"),
	);
}

test.describe.configure({ mode: "serial" });

test("#647: upload thật + CORS preflight + «Phát» media + học viên đa-org qua ?org=", async ({
	page,
}) => {
	const stamp = Date.now();
	// Ghim NGÀY BUỔI một mốc duy nhất: gọi rời `vietnamTodayISO()` 6 chỗ có
	// thể lệch qua nửa đêm giờ VN giữa seed và assert (#647 review Kongming).
	const sessionDate = vietnamTodayISO();
	const MP3_NAME = `Bài nghe – Unit 1 (${stamp}).mp3`;
	const PDF_NAME = `Phiếu bài tập – Buổi 1 (${stamp}).pdf`;
	const teacherAEmail = await signUpViaApi(page, {
		name: `Trung tâm Alpha ${stamp}`,
	});
	const orgAId = await orgIdForTeacherEmail(teacherAEmail);

	// ---- E2: hợp đồng preflight CORS (dương + âm) ----
	const preflight = await page.request.fetch(
		`${API_ORIGIN}/api/materials/files`,
		{
			method: "OPTIONS",
			headers: {
				Origin: WEB_ORIGIN,
				"Access-Control-Request-Method": "PUT",
				"Access-Control-Request-Headers": "content-type,x-file-name",
			},
		},
	);
	expect(preflight.status()).toBe(204);
	expect(preflight.headers()["access-control-allow-origin"]).toBe(WEB_ORIGIN);
	expect(preflight.headers()["access-control-allow-credentials"]).toBe("true");
	expect(preflight.headers()["access-control-allow-methods"]).toContain("PUT");
	expect(
		preflight.headers()["access-control-allow-headers"]?.toLowerCase(),
	).toContain("x-file-name");

	const hostilePreflight = await page.request.fetch(
		`${API_ORIGIN}/api/materials/files`,
		{
			method: "OPTIONS",
			headers: {
				Origin: "https://evil.example",
				"Access-Control-Request-Method": "PUT",
				"Access-Control-Request-Headers": "content-type,x-file-name",
			},
		},
	);
	expect(hostilePreflight.headers()["access-control-allow-origin"]).not.toBe(
		"https://evil.example",
	);

	// ---- E1: upload ngân hàng PUT raw body + Unicode X-File-Name ----
	await page.goto("/materials");
	await expect(page.getByTestId("materials-empty")).toBeVisible();
	// Ngân hàng rỗng render đồng thời nút trong PageHead và trong empty state
	// → strict mode bắt buộc .first() (red-team #2).
	await page.getByRole("button", { name: "Tải file lên" }).first().click();
	const uploadDialog = page.getByRole("dialog", { name: "Tải file lên" });
	await uploadDialog.getByLabel("File").setInputFiles({
		name: MP3_NAME,
		mimeType: "audio/mpeg",
		buffer: SPEAKING_SAMPLE,
	});
	const uploadResponsePromise = page.waitForResponse(
		(r) =>
			r.url().includes("/api/materials/files") &&
			r.request().method() === "PUT",
	);
	await uploadDialog
		.getByRole("button", { name: "Tải lên", exact: true })
		.click();
	const uploadResponse = await uploadResponsePromise;
	expect(uploadResponse.status()).toBe(201);
	expect(uploadResponse.request().headers()["x-file-name"]).toBe(
		encodeURIComponent(MP3_NAME),
	);
	const { material: mp3 } = (await uploadResponse.json()) as {
		material: { id: string; title: string };
	};
	expect(mp3.title).toBe(MP3_NAME);
	const bankRow = page
		.getByTestId("material-item")
		.filter({ hasText: MP3_NAME });
	await expect(bankRow).toBeVisible();

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("link", { name: `Tải xuống ${MP3_NAME}` }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toBe(MP3_NAME);
	expect(await readDownloadBytes(download)).toEqual(SPEAKING_SAMPLE);

	// ---- E4: nút «Phát» mở tab inline media — đăng ký listener TRƯỚC click
	// (red-team #3) để không hụt lỗi console nhanh trên loopback. ----
	const popupErrors: string[] = [];
	const context = page.context();
	const onPage = (newPage: Page) => {
		newPage.on("console", (msg) => {
			if (msg.type() === "error") popupErrors.push(msg.text());
		});
		newPage.on("pageerror", (err) => popupErrors.push(String(err)));
	};
	context.on("page", onPage);
	try {
		const [docResponse, popup] = await Promise.all([
			context.waitForEvent(
				"response",
				(r) =>
					r.url().includes(`/api/materials/${mp3.id}/file`) &&
					r.request().resourceType() === "document",
			),
			context.waitForEvent("page"),
			page.getByRole("link", { name: `Phát ${MP3_NAME}` }).click(),
		]);
		expect(docResponse.status()).toBe(200);
		expect(docResponse.headers()["content-disposition"] ?? "").toMatch(
			/^inline;/,
		);
		const csp = docResponse.headers()["content-security-policy"] ?? "";
		expect(csp).toContain("media-src 'self'");
		expect(csp).toContain("sandbox allow-same-origin");
		expect(csp).not.toContain("allow-scripts");
		expect(docResponse.headers()["cross-origin-opener-policy"]).toBe(
			"same-origin",
		);
		expect(docResponse.headers()["referrer-policy"]).toBe("no-referrer");
		// readyState của MediaDocument tùy lúc — poll boolean đến khi element
		// thực sự nạp dữ liệu để phát, không phải 1 lần khẳng định (flaky).
		await expect
			.poll(
				async () =>
					popup.evaluate(() => {
						const el = document.querySelector(
							"video, audio",
						) as HTMLMediaElement | null;
						return (
							!!el && el.readyState >= 1 && el.error === null && el.duration > 0
						);
					}),
				{ timeout: 15_000 },
			)
			.toBe(true);
		await popup.close();
		expect(
			popupErrors.filter(
				(e) =>
					/Content Security Policy/i.test(e) ||
					/CORS/i.test(e) ||
					/Cross-Origin/i.test(e),
			),
		).toEqual([]);
	} finally {
		context.off("page", onPage);
	}

	// ---- E3: seed học viên Org A TRƯỚC, lớp 1 buổi, upload PDF vào buổi ----
	const studentEmail = `materials.647.${stamp}@e2e.test`;
	const stuA = await seedStudent({
		teacherEmail: teacherAEmail,
		name: "Học viên Đa Org",
		email: studentEmail,
		onboarded: true,
	});
	const classAId = await seedDatedClass(page, {
		name: `Lớp Tài liệu ${stamp}`,
		startDate: sessionDate,
		sessionsTotal: 1,
	});
	const enrollResponse = await page.request.post(
		`${API_ORIGIN}/api/classes/${classAId}/enroll`,
		{
			data: { studentId: stuA.id },
			headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
		},
	);
	expect(enrollResponse.status()).toBe(201);
	const { id: enrollmentId } = (await enrollResponse.json()) as {
		id: string;
	};
	await acceptEnrollment(page, enrollmentId);

	await page.goto(`/classes/${classAId}`);
	await page
		.getByRole("tab", { name: "Buổi học & luyện tập", exact: true })
		.click();
	const sessionRow = page.locator("[data-testid='session-row']").first();
	await sessionRow.getByRole("button", { name: /^Tài liệu buổi/ }).click();
	const sessionDialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	const sessionUploadPromise = page.waitForResponse(
		(r) =>
			r.request().method() === "PUT" &&
			r
				.url()
				.includes(
					`/api/classes/${classAId}/sessions/${sessionDate}/materials/files`,
				),
	);
	await sessionDialog
		.getByLabel("Chọn file tải lên cho buổi học")
		.setInputFiles({
			name: PDF_NAME,
			mimeType: "application/pdf",
			buffer: minimalPdfBytes(stamp.toString(36)),
		});
	expect((await sessionUploadPromise).status()).toBe(201);
	await expect(
		sessionDialog.getByTestId("material-item").filter({ hasText: PDF_NAME }),
	).toBeVisible();

	// Gắn thêm MP3 từ ngân hàng vào cùng buổi học.
	await sessionDialog
		.getByRole("button", { name: "Chọn từ ngân hàng" })
		.click();
	const picker = page.getByRole("dialog", {
		name: "Chọn từ ngân hàng tài liệu",
	});
	await picker.getByRole("button", { name: `Gắn ${MP3_NAME}` }).click();
	await expect(
		picker.getByRole("button", { name: `Đã gắn ${MP3_NAME}` }),
	).toBeDisabled();
	await picker.getByRole("button", { name: "Quay lại" }).click();
	const updatedDialog = page.getByRole("dialog", { name: /^Tài liệu buổi/ });
	await expect(
		updatedDialog.getByTestId("material-item").filter({ hasText: MP3_NAME }),
	).toBeVisible();

	// ---- Thiết lập Org B (mới hơn Org A) để rows[0] = Org B ----
	// `signUpViaApi` ghi session cookie vào COOKIE JAR CỦA CONTEXT (`page`
	// chia sẻ jar với context) rồi goto /dashboard — gọi trên context của
	// giáo viên A sẽ LẬT cookie của A sang B. Phải dùng context riêng.
	await new Promise((r) => setTimeout(r, 30));
	const teacherBContext = await newStudentContext(context);
	const teacherBPage = await teacherBContext.newPage();
	const teacherBEmail = await signUpViaApi(teacherBPage, {
		name: `Trung tâm Beta ${stamp}`,
	});
	const orgBId = await orgIdForTeacherEmail(teacherBEmail);
	try {
		await seedStudent({
			teacherEmail: teacherBEmail,
			name: "Học viên Đa Org",
			email: studentEmail,
			onboarded: true,
		});
	} finally {
		await teacherBContext.close();
	}

	// ---- E5: học viên đa-org mở/phát/tải qua ?org= ----
	const studentContext = await newStudentContext(context);
	const studentPage = await studentContext.newPage();
	try {
		await studentPage.goto(`${STUDENT_ORIGIN}/login`);
		await studentPage.locator("#tab-signup").click();
		await studentPage.locator("#signup-name").fill("Học viên Đa Org");
		await studentPage.locator("#signup-email").fill(studentEmail);
		await studentPage.locator("#signup-password").fill("password-8chars");
		await studentPage.locator("#panel-signup button[type='submit']").click();
		await expect(studentPage.getByText("Email chưa được xác thực")).toBeVisible(
			{ timeout: 15_000 },
		);
		await verifyStudentEmailFromMailLog(studentPage, studentEmail);
		await expect(studentPage).toHaveURL(new RegExp(STUDENT_ORIGIN), {
			timeout: 30_000,
		});

		// Precondition: mặc định đang ở org mới nhất (Org B).
		await expect(
			studentPage.locator("[data-testid='org-switcher-trigger']"),
		).toContainText("Trung tâm Beta");

		// Negative control: KHÔNG kèm ?org= / header org → server rơi về
		// rows[0] (Org B) và chặn (404) dù lớp ở Org A.
		const noOrgResponse = await studentPage.request.get(
			`${API_ORIGIN}/api/student/classes/${classAId}/sessions/${sessionDate}/materials/${mp3.id}/file`,
		);
		expect(noOrgResponse.status()).toBe(404);

		// Đổi sang Org A.
		await studentPage.locator("[data-testid='org-switcher-trigger']").click();
		await studentPage
			.locator("[data-testid='org-switcher-menu']")
			.getByRole("menuitem", { name: new RegExp(`Trung tâm Alpha ${stamp}`) })
			.click();
		await studentPage
			.getByTestId("class-card")
			.filter({ hasText: `Lớp Tài liệu ${stamp}` })
			.getByRole("link", { name: `Lớp Tài liệu ${stamp}` })
			.click();
		await expect(
			studentPage.getByRole("heading", {
				level: 1,
				name: `Lớp Tài liệu ${stamp}`,
			}),
		).toBeVisible();
		await studentPage.getByRole("button", { name: "Tài liệu" }).first().click();
		const materialsList = studentPage.getByTestId("lesson-material");
		await expect(materialsList.filter({ hasText: MP3_NAME })).toBeVisible();
		await expect(materialsList.filter({ hasText: PDF_NAME })).toBeVisible();

		// `?org=` phải quyết định định tuyến.
		const audio = studentPage.locator("audio").first();
		await expect(audio).toHaveAttribute(
			"src",
			new RegExp(`org=${encodeURIComponent(orgAId)}`),
		);
		const pdfDownloadLink = studentPage.getByRole("link", {
			name: `Tải ${PDF_NAME}`,
		});
		await expect(pdfDownloadLink).toHaveAttribute(
			"href",
			new RegExp(`org=${encodeURIComponent(orgAId)}`),
		);

		// Audio nạp được dưới CSP mới. `preload="none"` giữ `readyState` ở 0
		// khi chỉ gọi `load()` (Kongming Phase-1 gate), nên phải bật
		// `preload="metadata"` trước khi nạp — không đổi preload của product.
		await audio.evaluate((el) => {
			const media = el as HTMLAudioElement;
			media.preload = "metadata";
			media.load();
		});
		// Poll đến khi audio nạp đủ metadata (không khẳng định 1 lần duy nhất).
		await expect
			.poll(
				async () =>
					audio.evaluate((el) => {
						const media = el as HTMLAudioElement;
						return (
							media.readyState >= 1 &&
							media.error === null &&
							media.duration > 0
						);
					}),
				{ timeout: 15_000 },
			)
			.toBe(true);

		// Popup «Mở» trên dòng MP3 phát được.
		const [studentDocResponse, studentPopup] = await Promise.all([
			studentContext.waitForEvent(
				"response",
				(r) =>
					r.url().includes(`/api/student/classes/${classAId}/sessions/`) &&
					r.url().includes(`/materials/${mp3.id}/file`) &&
					r.request().resourceType() === "document",
			),
			studentContext.waitForEvent("page"),
			studentPage.getByRole("link", { name: `Mở ${MP3_NAME}` }).click(),
		]);
		expect(studentDocResponse.status()).toBe(200);
		expect(studentDocResponse.url()).toContain(
			`org=${encodeURIComponent(orgAId)}`,
		);
		// Khoá chặt nhánh inline media của route học viên (unit test route
		// server chỉ phủ nhánh attachment kind="file").
		expect(studentDocResponse.headers()["content-disposition"] ?? "").toMatch(
			/^inline;/,
		);
		const studentCsp =
			studentDocResponse.headers()["content-security-policy"] ?? "";
		expect(studentCsp).toContain("media-src 'self'");
		expect(studentCsp).not.toContain("allow-scripts");
		expect(studentDocResponse.headers()["referrer-policy"]).toBe("no-referrer");
		await expect
			.poll(
				async () =>
					studentPopup.evaluate(() => {
						const el = document.querySelector(
							"video, audio",
						) as HTMLMediaElement | null;
						return !!el && el.readyState >= 1 && el.error === null;
					}),
				{ timeout: 15_000 },
			)
			.toBe(true);
		await studentPopup.close();

		// «Tải» PDF về đúng tên + byte.
		const studentPdfPromise = studentPage.waitForEvent("download");
		await pdfDownloadLink.click();
		const studentPdf = await studentPdfPromise;
		expect(studentPdf.suggestedFilename()).toBe(PDF_NAME);
		const pdfOnDisk = await studentPdf.path();
		const downloadedPdf = pdfOnDisk
			? readFileSync(pdfOnDisk)
			: await studentPdf.failure();
		expect(downloadedPdf).toEqual(minimalPdfBytes(stamp.toString(36)));

		// ---- E6: học viên chỉ thuộc Org B bị chặn 404 ----
		const otherStudentContext = await newStudentContext(context);
		const otherPage = await otherStudentContext.newPage();
		try {
			const otherStudentEmail = `materials.647.other.${stamp}@e2e.test`;
			await seedStudent({
				teacherEmail: teacherBEmail,
				name: "Học viên Khác Org",
				email: otherStudentEmail,
				onboarded: true,
			});
			await otherPage.goto(`${STUDENT_ORIGIN}/login`);
			await otherPage.locator("#tab-signup").click();
			await otherPage.locator("#signup-name").fill("Học viên Khác Org");
			await otherPage.locator("#signup-email").fill(otherStudentEmail);
			await otherPage.locator("#signup-password").fill("password-8chars");
			await otherPage.locator("#panel-signup button[type='submit']").click();
			await expect(otherPage.getByText("Email chưa được xác thực")).toBeVisible(
				{ timeout: 15_000 },
			);
			await verifyStudentEmailFromMailLog(otherPage, otherStudentEmail);
			await expect(otherPage).toHaveURL(new RegExp(STUDENT_ORIGIN), {
				timeout: 30_000,
			});
			const unauthorizedList = await otherPage.request.get(
				`${API_ORIGIN}/api/student/classes/${classAId}/sessions/${sessionDate}/materials`,
			);
			expect(unauthorizedList.status()).toBe(404);
			const unauthorizedNoOrg = await otherPage.request.get(
				`${API_ORIGIN}/api/student/classes/${classAId}/sessions/${sessionDate}/materials/${mp3.id}/file`,
			);
			expect(unauthorizedNoOrg.status()).toBe(404);
			const unauthorizedWithOrg = await otherPage.request.get(
				`${API_ORIGIN}/api/student/classes/${classAId}/sessions/${sessionDate}/materials/${mp3.id}/file?org=${orgAId}`,
			);
			expect(unauthorizedWithOrg.status()).toBe(403);
			expect(await unauthorizedWithOrg.json()).toMatchObject({
				code: "STUDENT_ORG_MISMATCH",
			});

			// #675: tự phục hồi khi localStorage.active_student_org_id trỏ vào org không thuộc hồ sơ
			await otherPage.evaluate((staleOrg) => {
				localStorage.setItem("active_student_org_id", staleOrg);
			}, orgAId);
			await otherPage.reload();
			await expect(otherPage.getByTestId("org-switcher-single")).toContainText(
				`Trung tâm Beta ${stamp}`,
				{ timeout: 15_000 },
			);
			await expect(
				otherPage.getByText("Không thể truy cập cổng học viên"),
			).toHaveCount(0);
			await expect
				.poll(() =>
					otherPage.evaluate(() =>
						localStorage.getItem("active_student_org_id"),
					),
				)
				.toBe(orgBId);
		} finally {
			await otherStudentContext.close();
		}
	} finally {
		await studentContext.close();
	}
});

/** Đọc toàn bộ byte của một Playwright `Download` qua file tạm của Playwright. */
async function readDownloadBytes(download: Download): Promise<Buffer> {
	const path = await download.path();
	return path ? readFileSync(path) : Buffer.alloc(0);
}

/** Browser luôn có trong Playwright test — guard để tránh `!` (biome). */
async function newStudentContext(context: BrowserContext) {
	const browser = context.browser();
	if (!browser) throw new Error("Playwright browser is unavailable");
	return browser.newContext();
}
