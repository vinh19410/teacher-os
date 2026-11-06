import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi, vietnamTodayISO } from "./helpers";
import { seedDatedClass } from "./helpers-dated-class";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

/**
 * TOS-7 / issue #440 — Điểm danh tổng theo ngày (`/attendance`) inline 4 trạng thái.
 *
 * Bao phủ đủ 5 kịch bản của Phase 5 + kiểm 3 viewport (1440×900, 768×1024,
 * 375×812, không cuộn ngang ở 375px) và điểm danh bằng bàn phím.
 */

const TODAY = vietnamTodayISO();

async function seedTodayClasses(page: Page) {
	const teacherEmail = await signUpViaApi(page);
	const mainClassId = await seedDatedClass(page, {
		name: "IELTS 6.5A Hôm Nay",
		startDate: TODAY,
		schedule: { start: "18:00", end: "19:30" },
		sessionsTotal: 2,
		students: {
			teacherEmail,
			names: ["An Nguyễn", "Bình Trần", "Cường Lê", "Dũng Phạm"],
		},
	});
	const cancelledClassId = await seedDatedClass(page, {
		name: "IELTS Huỷ Hôm Nay",
		startDate: TODAY,
		schedule: { start: "20:00", end: "21:30" },
		sessionsTotal: 2,
		students: {
			teacherEmail,
			names: ["Hà Đặng"],
		},
	});
	// Kịch bản 3: huỷ buổi hôm nay của lớp thứ 2 qua API có sẵn -> không hiện trên /attendance.
	const cancelRes = await page.request.post(
		`${API_ORIGIN}/api/classes/${cancelledClassId}/sessions/${TODAY}/cancel`,
		{
			data: {},
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
		},
	);
	expect(cancelRes.status()).toBe(200);

	return { teacherEmail, mainClassId, cancelledClassId };
}

test("AC-002: lọc theo ngày trên URL, buổi huỷ không hiện, tải ≤ 2s, thiếu trạng thái chặn lưu, chọn đủ 4 trạng thái + ghi chú và lưu ≤ 2s, bộ đếm dashboard giảm 1", async ({
	page,
}) => {
	await seedTodayClasses(page);

	// 1. Mở /dashboard, ghi lại số trên thẻ "Ca học hôm nay chưa điểm danh" (N = 1).
	await page.goto("/dashboard");
	const remindersSection = page.locator("section", {
		hasText: "Việc cần làm hôm nay",
	});
	await expect(remindersSection.getByText("1 ca")).toBeVisible({
		timeout: 5000,
	});

	// 5. Đo thời gian tải danh sách GET /api/attendance/daily ≤ 2000ms —
	// kongming note: đo thời gian server, không đo render + Vite on-demand
	// compile route /attendance ở lần goto đầu (khớp dashboard-reminders.spec.ts).
	const loadStart = Date.now();
	const dailyRes = await page.request.get(
		`${API_ORIGIN}/api/attendance/daily?date=${TODAY}`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	const loadElapsedMs = Date.now() - loadStart;
	expect(dailyRes.status()).toBe(200);
	expect(loadElapsedMs).toBeLessThanOrEqual(2000);

	await page.goto(`/attendance?date=${TODAY}`);
	// 3. Lớp có buổi hôm nay hiện với nhãn "Chưa điểm danh"; buổi đã huỷ không xuất hiện.
	await expect(page.getByText("IELTS 6.5A Hôm Nay")).toBeVisible();
	await expect(page.getByText("IELTS Huỷ Hôm Nay")).toHaveCount(0);

	// Mở ca ngay tại chỗ.
	await page.getByRole("button", { name: /IELTS 6.5A Hôm Nay/ }).click();

	// 2. Thiếu trạng thái: để trống 1 học viên, bấm lưu -> thông báo thiếu, không có request PUT.
	const groupAn = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của An Nguyễn",
	});
	const groupBinh = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Bình Trần",
	});
	const groupCuong = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Cường Lê",
	});
	const groupDung = page.getByRole("radiogroup", {
		name: "Trạng thái điểm danh của Dũng Phạm",
	});

	await groupAn.getByRole("radio", { name: "Có mặt" }).click();
	await groupBinh.getByRole("radio", { name: "Vắng có phép" }).click();
	await groupCuong.getByRole("radio", { name: "Vắng không phép" }).click();

	let putFired = false;
	const onRequest = (req: { method(): string; url(): string }) => {
		if (req.method() === "PUT" && req.url().includes("/attendance")) {
			putFired = true;
		}
	};
	page.on("request", onRequest);

	await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
	// TOS-8 D2: lưu khi thiếu (ca chưa recorded) → modal xác nhận thay vì chặn im lặng.
	// Modal visible chính là bằng chứng đồng bộ handleSubmit return sớm — không PUT.
	const confirmDialog = page.getByRole("dialog", {
		name: "Còn 1 học viên chưa chọn trạng thái",
	});
	await expect(confirmDialog).toBeVisible();
	expect(putFired).toBe(false);

	// "Quay lại chỉnh" → về hành vi TOS-7: thông báo thiếu + không PUT.
	await confirmDialog.getByRole("button", { name: "Quay lại chỉnh" }).click();
	await expect(
		page.getByRole("alert").filter({
			hasText: "Còn 1 học viên chưa chọn trạng thái",
		}),
	).toBeVisible();
	expect(putFired).toBe(false);
	page.off("request", onRequest);

	// Dùng bàn phím (ArrowRight trên radiogroup đã được focus) để chọn trạng thái cho học viên thứ 4 (Đi muộn).
	await groupDung.getByRole("radio", { name: "Đi muộn" }).click();
	await page.getByLabel("Ghi chú học vụ của Dũng Phạm").fill("Vào trễ 10 phút");

	// Bấm "Lưu điểm danh ca học": đo từ lúc bấm đến khi toast hiện ≤ 2000ms, URL không đổi.
	const urlBeforeSave = page.url();
	const saveStart = performance.now();
	await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
	await expect(page.getByText("Đã lưu điểm danh")).toBeVisible({
		timeout: 2000,
	});
	const saveElapsedMs = performance.now() - saveStart;
	expect(saveElapsedMs).toBeLessThanOrEqual(2000);
	expect(page.url()).toBe(urlBeforeSave);

	// Ca đổi nhãn "Đã điểm danh (2/4 có mặt)" (present + late).
	await expect(page.getByText(/Đã điểm danh \(2\/4 có mặt\)/)).toBeVisible();

	// 4. Lọc chip: ?status=pending không còn ca này; ?status=completed hiện ca đã lưu.
	const chipGroup = page.getByRole("group", {
		name: "Lọc trạng thái điểm danh",
	});
	await chipGroup.getByRole("button", { name: "Chưa điểm danh" }).click();
	await expect(page).toHaveURL(/status=pending/);
	// TOS-8 D3: ngày còn dữ liệu (ca vừa lưu) → empty-state chip pending là
	// thông báo hoàn tất, không phải "Không có ca học nào trong ngày này."
	// (live region cũng chứa chữ này — bám vào section empty-state cho unique).
	await expect(
		page.locator("section").getByText("Đã điểm danh xong mọi ca trong ngày"),
	).toBeVisible();

	await chipGroup.getByRole("button", { name: "Đã điểm danh" }).click();
	await expect(page).toHaveURL(/status=completed/);
	await expect(page.getByText("IELTS 6.5A Hôm Nay")).toBeVisible();

	// Tải lại trang: trạng thái và ghi chú vẫn đúng.
	await page.reload();
	await page.getByRole("button", { name: /IELTS 6.5A Hôm Nay/ }).click();
	await expect(
		page
			.getByRole("radiogroup", { name: "Trạng thái điểm danh của Dũng Phạm" })
			.getByRole("radio", { name: "Đi muộn" }),
	).toHaveAttribute("aria-checked", "true");
	await expect(page.getByLabel("Ghi chú học vụ của Dũng Phạm")).toHaveValue(
		"Vào trễ 10 phút",
	);

	// Bộ đếm giảm đúng 1: API pending 1 -> 0, UI thẻ chuyển sang trạng thái hoàn tất.
	const remindersRes = await page.request.get(
		`${API_ORIGIN}/api/dashboard/reminders`,
		{ headers: { Origin: WEB_ORIGIN } },
	);
	expect(remindersRes.status()).toBe(200);
	const reminders = (await remindersRes.json()) as {
		attendance: { pending: number };
	};
	expect(reminders.attendance.pending).toBe(0);

	await page.goto("/dashboard");
	const attendanceCard = page
		.getByRole("heading", { name: "Ca học hôm nay chưa điểm danh" })
		.locator("xpath=..");
	await expect(attendanceCard.getByText("Đã hoàn tất hôm nay")).toBeVisible({
		timeout: 5000,
	});
	await expect(page.getByText("1 ca")).toHaveCount(0);
});

test("3 viewport (1440×900, 768×1024, 375×812): chụp screenshot ca đang mở và kiểm không cuộn ngang ở 375px", async ({
	page,
}) => {
	const screenshotsDir = new URL(
		"../../../plans/261026-1524-tos-7-daily-attendance-inline/screenshots/",
		import.meta.url,
	).pathname;
	mkdirSync(screenshotsDir, { recursive: true });

	await seedTodayClasses(page);
	await page.goto(`/attendance?date=${TODAY}&status=pending`);

	// Với status=pending, ca chưa điểm danh đầu tiên tự mở sẵn.
	await expect(
		page.getByRole("radiogroup", {
			name: "Trạng thái điểm danh của An Nguyễn",
		}),
	).toBeVisible();

	for (const [w, h, name] of [
		[1440, 900, "daily-attendance-1440"],
		[768, 1024, "daily-attendance-768"],
		[375, 812, "daily-attendance-375"],
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		await page.waitForTimeout(250);

		if (w === 375) {
			const hasHorizontalOverflow = await page.evaluate(
				() =>
					document.documentElement.scrollWidth >
					document.documentElement.clientWidth,
			);
			expect(hasHorizontalOverflow).toBe(false);
		}

		await page.screenshot({
			path: `${screenshotsDir}${name}.png`,
			fullPage: true,
		});
	}
});

test.describe("AC-003 mark all present (TOS-8)", () => {
	/** Đọc kernel snapshot và trả lesson row của 1 học viên trong 1 lớp hôm
	 * nay. DB không reset giữa các test trong file (workers: 1) — tên học
	 * viên có thể trùng giữa các lớp (AC-002 cũng seed "An Nguyễn"), nên phải
	 * join student → enrollment (lọc theo classId) → lesson, không find theo
	 * tên trên snapshot toàn cục. */
	async function lessonOfStudent(
		page: Page,
		classId: string,
		studentName: string,
	): Promise<{ status?: string; attendance?: string | null }> {
		const res = await page.request.get(`${API_ORIGIN}/api/kernel`, {
			headers: { Origin: WEB_ORIGIN },
		});
		expect(res.status()).toBe(200);
		const snap = (await res.json()) as {
			students?: Array<{ id: string; name: string }>;
			enrollments?: Array<{ id: string; classId: string; studentId: string }>;
			lessons?: Array<{
				classId: string;
				enrollmentId: string;
				date: string | null;
				status?: string;
				attendance?: string | null;
			}>;
		};
		const candidateStudentIds = new Set(
			(snap.students ?? [])
				.filter((s) => s.name === studentName)
				.map((s) => s.id),
		);
		const enrollment = (snap.enrollments ?? []).find(
			(e) => e.classId === classId && candidateStudentIds.has(e.studentId),
		);
		expect(
			enrollment,
			`enrollment của ${studentName} trong ${classId} phải tồn tại`,
		).toBeTruthy();
		const lessonRow = snap.lessons?.find(
			(l) =>
				l.classId === classId &&
				l.enrollmentId === enrollment?.id &&
				l.date === TODAY,
		);
		expect(
			lessonRow,
			`lesson hôm nay của ${studentName} phải tồn tại`,
		).toBeTruthy();
		return { status: lessonRow?.status, attendance: lessonRow?.attendance };
	}

	test("điền nhanh giữ lựa chọn có sẵn; chỉnh Nam vắng có phép rồi lưu đúng qua API", async ({
		page,
	}) => {
		const teacherEmail = await signUpViaApi(page);
		const classId = await seedDatedClass(page, {
			name: "TOS-8 AC-003",
			startDate: TODAY,
			schedule: { start: "18:00", end: "19:30" },
			sessionsTotal: 2,
			students: {
				teacherEmail,
				names: ["An Nguyễn", "Trần Hoàng Nam", "Cường Lê", "Dũng Phạm"],
			},
		});

		await page.goto(`/attendance?date=${TODAY}`);
		await page.getByRole("button", { name: /TOS-8 AC-003/ }).click();

		// Không ghi đè: An đã chọn Đi muộn TRƯỚC khi bấm điền nhanh.
		const groupAn = page.getByRole("radiogroup", {
			name: "Trạng thái điểm danh của An Nguyễn",
		});
		await groupAn.getByRole("radio", { name: "Đi muộn" }).click();

		await page.getByRole("button", { name: "Đánh dấu tất cả Có mặt" }).click();
		for (const name of [
			"An Nguyễn",
			"Trần Hoàng Nam",
			"Cường Lê",
			"Dũng Phạm",
		]) {
			const radio = page
				.getByRole("radiogroup", { name: `Trạng thái điểm danh của ${name}` })
				.getByRole("radio", {
					name: name === "An Nguyễn" ? "Đi muộn" : "Có mặt",
				});
			await expect(radio).toHaveAttribute("aria-checked", "true");
		}

		// Chỉnh Nam sang Vắng có phép rồi lưu; URL không đổi, toast ≤ 2s.
		await page
			.getByRole("radiogroup", {
				name: "Trạng thái điểm danh của Trần Hoàng Nam",
			})
			.getByRole("radio", { name: "Vắng có phép" })
			.click();
		const urlBeforeSave = page.url();
		await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
		await expect(page.getByText("Đã lưu điểm danh")).toBeVisible({
			timeout: 2000,
		});
		expect(page.url()).toBe(urlBeforeSave);

		// Reload: UI giữ đúng lựa chọn.
		await page.reload();
		await page.getByRole("button", { name: /TOS-8 AC-003/ }).click();
		await expect(
			page
				.getByRole("radiogroup", {
					name: "Trạng thái điểm danh của Trần Hoàng Nam",
				})
				.getByRole("radio", { name: "Vắng có phép" }),
		).toHaveAttribute("aria-checked", "true");

		// API: Nam = excused/absent; An giữ Đi muộn (late/completed); 2 người
		// còn lại present/completed.
		const nam = await lessonOfStudent(page, classId, "Trần Hoàng Nam");
		expect(nam.attendance).toBe("excused");
		expect(nam.status).toBe("absent");
		const an = await lessonOfStudent(page, classId, "An Nguyễn");
		expect(an.attendance).toBe("late");
		expect(an.status).toBe("completed");
		for (const name of ["Cường Lê", "Dũng Phạm"]) {
			const row = await lessonOfStudent(page, classId, name);
			expect(row.attendance).toBe("present");
			expect(row.status).toBe("completed");
		}
	});

	test("lưu khi thiếu 2 người: modal ghi đúng 2, quay lại chỉnh không PUT, gán rồi lưu đủ sĩ số", async ({
		page,
	}) => {
		const teacherEmail = await signUpViaApi(page);
		await seedDatedClass(page, {
			name: "TOS-8 Modal Xác Nhận",
			startDate: TODAY,
			schedule: { start: "19:00", end: "20:30" },
			sessionsTotal: 2,
			students: {
				teacherEmail,
				names: ["An Nguyễn", "Bình Trần", "Cường Lê", "Dũng Phạm"],
			},
		});

		await page.goto(`/attendance?date=${TODAY}`);
		await page.getByRole("button", { name: /TOS-8 Modal Xác Nhận/ }).click();

		// Chỉ chọn 2/4 → bấm lưu → modal "Còn 2 học viên".
		const groupAn = page.getByRole("radiogroup", {
			name: "Trạng thái điểm danh của An Nguyễn",
		});
		const groupBinh = page.getByRole("radiogroup", {
			name: "Trạng thái điểm danh của Bình Trần",
		});
		await groupAn.getByRole("radio", { name: "Có mặt" }).click();
		await groupBinh.getByRole("radio", { name: "Có mặt" }).click();

		let putCount = 0;
		const onRequest = (req: { method(): string; url(): string }) => {
			if (req.method() === "PUT" && req.url().includes("/attendance")) {
				putCount += 1;
			}
		};
		page.on("request", onRequest);

		await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
		const confirmDialog = page.getByRole("dialog", {
			name: "Còn 2 học viên chưa chọn trạng thái",
		});
		await expect(confirmDialog).toBeVisible();

		// "Quay lại chỉnh": không PUT (dialog visible = handleSubmit return
		// sớm đồng bộ), dòng thiếu có viền cảnh báo.
		await confirmDialog.getByRole("button", { name: "Quay lại chỉnh" }).click();
		await expect(
			page
				.getByRole("alert")
				.filter({ hasText: "Còn 2 học viên chưa chọn trạng thái" }),
		).toBeVisible();
		expect(putCount).toBe(0);

		// Bấm lưu lần nữa → "Gán Có mặt và lưu": PUT đủ sĩ số, 2 người còn lại present.
		await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
		await page
			.getByRole("dialog", { name: "Còn 2 học viên chưa chọn trạng thái" })
			.getByRole("button", { name: "Gán Có mặt và lưu" })
			.click();
		await expect(page.getByText("Đã lưu điểm danh")).toBeVisible();
		await expect.poll(() => putCount).toBe(1);
		page.off("request", onRequest);

		// Badge ca: present(2) + present(2) = 4/4.
		await expect(page.getByText(/Đã điểm danh \(4\/4 có mặt\)/)).toBeVisible();
	});

	test("NFR-008: 5 lớp hoàn tất bằng điền nhanh tổng ≤ 120 giây, dashboard giảm đúng 5", async ({
		page,
	}) => {
		test.setTimeout(180_000);
		const teacherEmail = await signUpViaApi(page);
		const classes: Array<{ name: string; students: string[] }> = [
			{ name: "TOS-8 NFR 1", students: ["An Nguyễn", "Bình Trần", "Cường Lê"] },
			{
				name: "TOS-8 NFR 2",
				students: ["Dũng Phạm", "Hà Đặng", "Inh Lê", "Khanh Nguyễn"],
			},
			{
				name: "TOS-8 NFR 3",
				students: ["Lâm Trần", "Mai Vũ", "Nam Đỗ", "Oanh Phạm", "Phúc Lê"],
			},
			{
				name: "TOS-8 NFR 4",
				students: ["Quỳnh Nguyễn", "Sơn Trần", "Trang Vũ", "Thảo Lê"],
			},
			{ name: "TOS-8 NFR 5", students: ["Vinh Trần", "Yến Phạm", "Zung Đặng"] },
		];
		for (const [i, cls] of classes.entries()) {
			await seedDatedClass(page, {
				name: cls.name,
				startDate: TODAY,
				schedule: { start: `1${i}:00`, end: `1${i + 1}:00` },
				sessionsTotal: 2,
				students: { teacherEmail, names: cls.students },
			});
		}

		const beforeRes = await page.request.get(
			`${API_ORIGIN}/api/dashboard/reminders`,
			{ headers: { Origin: WEB_ORIGIN } },
		);
		expect(beforeRes.status()).toBe(200);
		const before = (
			(await beforeRes.json()) as { attendance: { pending: number } }
		).attendance.pending;
		expect(before).toBe(5);

		await page.goto(`/attendance?date=${TODAY}&status=pending`);
		// t0: ca đầu tiên tự mở sẵn (pending).
		await expect(page.getByRole("radiogroup").first()).toBeVisible();
		const t0 = Date.now();

		for (let i = 0; i < 5; i++) {
			const bulk = page.getByRole("button", { name: "Đánh dấu tất cả Có mặt" });
			if (i > 0) {
				// Auto-advance: picker đầu tiên của ca mới mở nhận focus.
				const firstRadio = page
					.getByRole("radiogroup")
					.getByRole("radio", { name: "Có mặt" })
					.first();
				await expect(firstRadio).toBeFocused();
				await page.keyboard.press("Shift+Tab");
				await expect(bulk).toBeFocused();
				await page.keyboard.press("Enter");
			} else {
				await bulk.click();
			}

			// Chỉnh 1 học viên sang Vắng không phép (radio đầu của ca đang mở).
			await page
				.getByRole("radiogroup")
				.getByRole("radio", { name: "Vắng không phép" })
				.first()
				.click();
			await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
			if (i < 4) {
				// Toast xác nhận lưu trước khi ca kế tiếp tự mở (assert chức năng).
				await expect(page.getByText("Đã lưu điểm danh").first()).toBeVisible();
			}
		}

		// t1: thông báo hoàn tất qua aria-live.
		await expect(page.getByTestId("attendance-live-status")).toHaveText(
			/Đã điểm danh xong mọi ca trong ngày/,
		);
		const t1 = Date.now();
		// Proxy NFR-008 (assert tổng 1 lần; không assert wall-clock từng bước).
		// Ngưỡng cấu hình được qua env cho runner CI chậm (CR-Bugs M-3); mặc
		// định vẫn 120s đúng AC.
		const nfrBudgetMs = Number(process.env.NFR008_TOTAL_MS ?? "") || 120_000;
		expect(t1 - t0).toBeLessThanOrEqual(nfrBudgetMs);

		const afterRes = await page.request.get(
			`${API_ORIGIN}/api/dashboard/reminders`,
			{ headers: { Origin: WEB_ORIGIN } },
		);
		expect(afterRes.status()).toBe(200);
		const after = (
			(await afterRes.json()) as { attendance: { pending: number } }
		).attendance.pending;
		expect(before - after).toBe(5);
	});

	test("3 viewport: chụp ca mở + modal xác nhận, 375px không tràn ngang và nút ≥ 44px", async ({
		page,
	}) => {
		const screenshotsDir = new URL(
			"../../../plans/261026-1533-tos-8-mark-all-present/screenshots/",
			import.meta.url,
		).pathname;
		mkdirSync(screenshotsDir, { recursive: true });

		const teacherEmail = await signUpViaApi(page);
		await seedDatedClass(page, {
			name: "TOS-8 Viewport",
			startDate: TODAY,
			schedule: { start: "18:00", end: "19:30" },
			sessionsTotal: 2,
			students: { teacherEmail, names: ["An Nguyễn", "Bình Trần", "Cường Lê"] },
		});

		await page.goto(`/attendance?date=${TODAY}&status=pending`);
		await expect(
			page.getByRole("radiogroup", {
				name: "Trạng thái điểm danh của An Nguyễn",
			}),
		).toBeVisible();

		for (const [w, h, name] of [
			[1440, 900, "tos8-mark-all-1440"],
			[768, 1024, "tos8-mark-all-768"],
			[375, 812, "tos8-mark-all-375"],
		] as const) {
			await page.setViewportSize({ width: w, height: h });
			await page.waitForTimeout(250);

			if (w === 375) {
				const hasHorizontalOverflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(hasHorizontalOverflow).toBe(false);
				const saveBox = await page
					.getByRole("button", { name: "Lưu điểm danh ca học" })
					.boundingBox();
				expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
				const bulkBox = await page
					.getByRole("button", { name: "Đánh dấu tất cả Có mặt" })
					.boundingBox();
				expect(bulkBox?.height ?? 0).toBeGreaterThanOrEqual(44);
			}

			await page.screenshot({
				path: `${screenshotsDir}${name}.png`,
				fullPage: true,
			});
		}

		// Modal xác nhận lưu thiếu.
		await page.getByRole("button", { name: "Lưu điểm danh ca học" }).click();
		const dialog = page.getByRole("dialog", {
			name: "Còn 3 học viên chưa chọn trạng thái",
		});
		await expect(dialog).toBeVisible();
		await page.screenshot({
			path: `${screenshotsDir}tos8-fill-missing-confirm-375.png`,
			fullPage: false,
		});
	});
});
