import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { API_ORIGIN, PROFILE_ORIGIN, WEB_ORIGIN } from "./origins";

const LEAD_ORG_ID = "e2e-lead-org";
const STORAGE_KEY = "msmy_placement_attempt_v2";
const SEED_DIR = new URL("../../web/public/placement-seed/", import.meta.url);
const questionsPath = new URL("questions.json", SEED_DIR);
const questionsData = JSON.parse(
	readFileSync(fileURLToPath(questionsPath), "utf8"),
);

const VIEWPORTS = [
	{ width: 1440, height: 900, label: "desktop-1440x900" },
	{ width: 768, height: 1024, label: "tablet-768x1024" },
	{ width: 375, height: 812, label: "mobile-375x812" },
] as const;

function reportPath(filename: string): string {
	return fileURLToPath(
		new URL(`../../../plans/reports/${filename}`, import.meta.url),
	);
}

async function openDb() {
	const client = createClient({
		url: `file:${fileURLToPath(new URL("../local.db", import.meta.url))}`,
	});
	await client.execute("PRAGMA busy_timeout = 5000;");
	return client;
}

const uniquePhone = () =>
	`0909${String(Date.now()).slice(-5)}${Math.floor(Math.random() * 10)}`;

async function clearRateLimits() {
	const client = await openDb();
	try {
		await client.execute("UPDATE lead SET ip_hash = '' WHERE ip_hash != ''");
		await client.execute(
			"UPDATE placement_test_submission SET ip_hash = '' WHERE ip_hash != ''",
		);
	} finally {
		client.close();
	}
}

async function countLeads(): Promise<number> {
	const db = await openDb();
	try {
		const res = await db.execute("SELECT COUNT(*) AS cnt FROM lead");
		return Number(res.rows[0]?.cnt ?? 0);
	} finally {
		db.close();
	}
}

async function signUpLeadOrgTeacher(page: Page, name: string): Promise<string> {
	const email = await signUpViaApi(page, { name });
	const db = await openDb();
	try {
		const user = await db.execute({
			sql: "SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1",
			args: [email],
		});
		const userId = user.rows[0]?.id;
		if (typeof userId !== "string") {
			throw new Error("teacher user row chưa xuất hiện sau sign-up");
		}
		let reassigned = 0;
		for (let i = 0; i < 40; i++) {
			const updated = await db.execute({
				sql: "UPDATE membership SET org_id = ? WHERE user_id = ?",
				args: [LEAD_ORG_ID, userId],
			});
			reassigned = updated.rowsAffected;
			if (reassigned > 0) break;
			await page.waitForTimeout(250);
		}
		expect(reassigned, "membership reassign sang lead org").toBe(1);
	} finally {
		db.close();
	}
	return email;
}

async function ensurePlacementPublished(page: Page) {
	const client = await openDb();
	try {
		await client.execute({
			sql: "DELETE FROM placement_test_submission WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
		await client.execute({
			sql: "DELETE FROM placement_test_audio WHERE org_id = ?",
			args: [LEAD_ORG_ID],
		});
	} finally {
		client.close();
	}

	await signUpLeadOrgTeacher(page, "Cô Mỹ Seed E2E");

	const content = structuredClone(questionsData);
	for (const clip of content.parts[0].clips) {
		const mp3Bytes = readFileSync(
			fileURLToPath(new URL(`${clip.id}.mp3`, SEED_DIR)),
		);
		const uploadRes = await page.request.put(
			`${API_ORIGIN}/api/placement-test/audio`,
			{
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(mp3Bytes.byteLength),
					"X-File-Name": encodeURIComponent(`${clip.id}.mp3`),
				},
				data: mp3Bytes,
			},
		);
		expect(uploadRes.status()).toBe(200);
		const uploaded = (await uploadRes.json()) as { audioId: string };
		clip.audioId = uploaded.audioId;
	}

	const draftRes = await page.request.put(
		`${API_ORIGIN}/api/placement-test/draft`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 0, content },
		},
	);
	expect(draftRes.status()).toBe(200);

	const pubRes = await page.request.post(
		`${API_ORIGIN}/api/placement-test/publish`,
		{
			headers: {
				Origin: WEB_ORIGIN,
				"Content-Type": "application/json",
			},
			data: { revision: 1 },
		},
	);
	expect(pubRes.status()).toBe(200);
}

async function playClipOnceToEnd(page: Page, clipId: string) {
	const playBtn = page.locator(`button[data-play-clip="${clipId}"]`);
	await expect(playBtn).toBeEnabled();
	await playBtn.click();

	await page.waitForFunction(
		({ key, id }) => {
			const raw = localStorage.getItem(key);
			if (!raw) return false;
			const parsed = JSON.parse(raw);
			const audio = document.querySelector<HTMLAudioElement>(
				`audio[data-audio-clip="${id}"]`,
			);
			return (
				audio !== null &&
				!audio.paused &&
				typeof parsed?.plays?.[id] === "number" &&
				parsed.plays[id] >= 1
			);
		},
		{ key: STORAGE_KEY, id: clipId },
	);

	await page.evaluate((id) => {
		const audio = document.querySelector<HTMLAudioElement>(
			`audio[data-audio-clip="${id}"]`,
		);
		if (!audio) return;
		if (Number.isFinite(audio.duration) && audio.duration > 0.2) {
			audio.currentTime = audio.duration - 0.05;
		} else {
			audio.dispatchEvent(new Event("ended"));
		}
	}, clipId);

	await expect(playBtn).not.toContainText("Đang phát");
}

async function installSyntheticMediaRecorder(page: Page) {
	await page.addInitScript(() => {
		const win = window as unknown as {
			__gumConstraintsHistory?: unknown[];
			__spokenPrompts?: string[];
			__speakingRecorderEvents?: Array<{ type: string; state: string }>;
		};
		win.__gumConstraintsHistory = [];
		win.__spokenPrompts = [];
		win.__speakingRecorderEvents = [];

		const createSyntheticAudioStream = async (
			constraints?: MediaStreamConstraints,
		) => {
			win.__gumConstraintsHistory?.push(constraints);
			if (constraints?.video) {
				throw new Error("Audio-only flow must not request video track");
			}
			const audioCtx = new AudioContext();
			if (audioCtx.state === "suspended") {
				await audioCtx.resume();
			}
			const osc = audioCtx.createOscillator();
			const gain = audioCtx.createGain();
			gain.gain.value = 0.01;
			osc.connect(gain);
			const dest = audioCtx.createMediaStreamDestination();
			gain.connect(dest);
			osc.start();

			const tracks = [...dest.stream.getAudioTracks()];
			const combined = new MediaStream(tracks);
			for (const track of tracks) {
				const origStop = track.stop.bind(track);
				track.stop = () => {
					audioCtx.close().catch(() => {});
					origStop();
				};
			}
			return combined;
		};

		Object.defineProperty(navigator, "mediaDevices", {
			configurable: true,
			value: {
				getUserMedia: (constraints?: MediaStreamConstraints) =>
					createSyntheticAudioStream(constraints),
			},
		});

		const NativeMediaRecorder = window.MediaRecorder;
		if (NativeMediaRecorder) {
			const OrigStart = NativeMediaRecorder.prototype.start;
			const OrigPause = NativeMediaRecorder.prototype.pause;
			const OrigResume = NativeMediaRecorder.prototype.resume;
			const OrigStop = NativeMediaRecorder.prototype.stop;
			NativeMediaRecorder.prototype.start = function (timeslice?: number) {
				win.__speakingRecorderEvents?.push({
					type: "start",
					state: this.state,
				});
				return timeslice !== undefined
					? OrigStart.call(this, timeslice)
					: OrigStart.call(this);
			};
			NativeMediaRecorder.prototype.pause = function () {
				win.__speakingRecorderEvents?.push({
					type: "pause",
					state: this.state,
				});
				return OrigPause.call(this);
			};
			NativeMediaRecorder.prototype.resume = function () {
				win.__speakingRecorderEvents?.push({
					type: "resume",
					state: this.state,
				});
				return OrigResume.call(this);
			};
			NativeMediaRecorder.prototype.stop = function () {
				win.__speakingRecorderEvents?.push({
					type: "stop",
					state: this.state,
				});
				return OrigStop.call(this);
			};
		}

		class SyntheticUtterance {
			text: string;
			lang = "";
			rate = 1;
			onend: (() => void) | null = null;
			onerror: (() => void) | null = null;
			constructor(text = "") {
				this.text = text;
			}
		}
		Object.defineProperty(window, "SpeechSynthesisUtterance", {
			configurable: true,
			value: SyntheticUtterance,
		});
		Object.defineProperty(window, "speechSynthesis", {
			configurable: true,
			value: {
				cancel: () => {},
				speak: (utter: SyntheticUtterance) => {
					win.__spokenPrompts?.push(utter.text);
					window.setTimeout(() => {
						utter.onend?.();
					}, 60);
				},
			},
		});
	});
}

test.describe
	.serial("profile placement test 5 kỹ năng (/kiem-tra-dau-vao/ -> /leads)", () => {
		test.beforeAll(async ({ browser }) => {
			const context = await browser.newContext();
			const page = await context.newPage();
			try {
				await ensurePlacementPublished(page);
			} finally {
				await context.close();
			}
		});

		test("làm trọn bộ 5 kỹ năng, Speaking audio-only tuần tự đọc-trả lời từng câu, hợp nhất tư vấn trang chủ và giáo viên chấm W&S + phạt sàn Speaking (-1 band) tại /leads (#727)", async ({
			page,
		}) => {
			test.setTimeout(180_000);
			await clearRateLimits();
			await installSyntheticMediaRecorder(page);

			const leadsBefore = await countLeads();
			const phone = uniquePhone();
			const email = `minhquan.${Date.now()}@example.com`;

			// 1. Từ trang chủ bấm CTA hero sang /kiem-tra-dau-vao/
			await page.goto(PROFILE_ORIGIN);
			await page
				.getByRole("link", {
					name: /Làm test xếp lớp miễn phí/,
				})
				.click();
			await expect(page).toHaveURL(/\/kiem-tra-dau-vao\/$/);
			await expect(
				page.getByRole("heading", {
					name: "Bài Kiểm Tra Đầu Vào Tiếng Anh (5 Kỹ Năng)",
				}),
			).toBeVisible();

			// 2. Bấm Bắt đầu -> vào cổng thông tin, điền đầy đủ + tuỳ chọn -> tạo lead source=placement-test (submit_count=1)
			await page.locator("#startTestBtn").click();
			await expect(
				page.getByRole("heading", {
					name: "Nhập thông tin trước khi vào làm bài",
				}),
			).toBeVisible();
			await page.locator("#leadName").fill("Trần Minh Quân");
			await page.locator("#leadPhone").fill(phone);
			await page.locator("#leadEmail").fill(email);
			await page.locator("#leadOptionalDetails summary").click();
			await page.locator("#leadStudyMode").selectOption("group-online");
			await page.locator("#leadNote").fill("Cần lộ trình B1-B2");
			await page.locator("#submitLeadGateBtn").click();

			await expect(page.locator('[data-skill="listening"]')).toBeVisible();
			await expect(page.locator(".question-level-pill")).toHaveCount(0);

			expect(await countLeads()).toBe(leadsBefore + 1);
			{
				const dbGate = await openDb();
				try {
					const gateRow = await dbGate.execute({
						sql: "SELECT source, email, study_mode, note, placement, submit_count FROM lead WHERE phone = ? LIMIT 1",
						args: [phone],
					});
					expect(gateRow.rows.length).toBe(1);
					expect(gateRow.rows[0]?.source).toBe("placement-test");
					expect(gateRow.rows[0]?.email).toBe(email);
					expect(gateRow.rows[0]?.study_mode).toBe("group-online");
					expect(gateRow.rows[0]?.note).toBe("Cần lộ trình B1-B2");
					expect(gateRow.rows[0]?.placement).toBe("");
					expect(Number(gateRow.rows[0]?.submit_count)).toBe(1);
				} finally {
					dbGate.close();
				}
			}

			// 3. Phần 1 Listening: kiểm giới hạn phát clip-la 2 lượt, làm đúng 13/13 câu (cả MCQ + gap-fill), kiểm reload giữ state
			const clipLaBtn = page.locator('button[data-play-clip="clip-la"]');
			const clipLaStatus = page.locator('[data-clip-status="clip-la"]');
			await expect(clipLaStatus).toContainText("Còn 2/2 lượt nghe");

			await playClipOnceToEnd(page, "clip-la");
			await expect(clipLaStatus).toContainText("Còn 1/2 lượt nghe");
			await expect(clipLaBtn).toBeEnabled();

			await playClipOnceToEnd(page, "clip-la");
			await expect(clipLaStatus).toContainText("Còn 0/2 lượt nghe");
			await expect(clipLaBtn).toBeDisabled();
			await expect(clipLaBtn).toContainText("Đã hết lượt nghe");

			const listeningClips = questionsData.parts[0].clips as Array<{
				id: string;
				questions: Array<{
					id: string;
					type?: string;
					answer?: number;
					accept?: string[];
				}>;
			}>;
			for (const clip of listeningClips) {
				for (const q of clip.questions) {
					if (q.type === "gap") {
						const accepted = q.accept?.[0] ?? "";
						await page
							.locator(`input[data-gap-input="${q.id}"]`)
							.fill(accepted);
					} else {
						await page
							.locator(
								`fieldset[data-question-id="${q.id}"] input[value="${q.answer ?? 0}"]`,
							)
							.check();
					}
				}
			}
			await expect(page.locator(".progress-counter")).toContainText(
				"Đã trả lời 13/40 câu",
			);

			await page.reload();
			await expect(page.locator('[data-skill="listening"]')).toBeVisible();
			await expect(clipLaStatus).toContainText("Còn 0/2 lượt nghe");
			await expect(clipLaBtn).toBeDisabled();
			await expect(page.locator(".progress-counter")).toContainText(
				"Đã trả lời 13/40 câu",
			);

			// 4. Phần 2 Grammar & Vocab: đúng 9/12 (75%)
			await page.locator("#nextToVocabBtn").click();
			await expect(page.locator('[data-skill="vocab-grammar"]')).toBeVisible();
			await expect(page.locator(".question-level-pill")).toHaveCount(0);
			const gvQuestions = questionsData.parts[1].questions as Array<{
				id: string;
				answer: number;
			}>;
			for (const [i, q] of gvQuestions.entries()) {
				const pick = i < 9 ? q.answer : (q.answer + 1) % 4;
				await page
					.locator(
						`fieldset[data-question-id="${q.id}"] input[value="${pick}"]`,
					)
					.check();
			}
			await expect(page.locator(".progress-counter")).toContainText(
				"Đã trả lời 25/40 câu",
			);

			// 5. Phần 3 Reading: đúng 12/15 (80%) -> tổng 34/40 = 85%
			await page.locator("#nextToReadingBtn").click();
			await expect(page.locator('[data-skill="reading"]')).toBeVisible();
			await expect(page.locator(".question-level-pill")).toHaveCount(0);
			const readingPassages = questionsData.parts[2].passages as Array<{
				questions: Array<{ id: string; answer: number }>;
			}>;
			const readingQuestions = readingPassages.flatMap((p) => p.questions);
			for (const [i, q] of readingQuestions.entries()) {
				const pick = i < 12 ? q.answer : (q.answer + 1) % 4;
				await page
					.locator(
						`fieldset[data-question-id="${q.id}"] input[value="${pick}"]`,
					)
					.check();
			}
			await expect(page.locator(".progress-counter")).toContainText(
				"Đã trả lời 40/40 câu",
			);

			// 6. Phần 4 Writing: 56 từ đạt chuẩn gợi ý 50–80 từ
			await page.locator("#nextToWritingBtn").click();
			await expect(page.locator('[data-skill="writing"]')).toBeVisible();
			const writing56Words =
				"Dear Alex, thank you for organizing our weekend English workshop in the park. Last Saturday I joined a small conversation group with three new classmates and we practiced ordering lunch and giving directions. Could you please send me the schedule for next week and let me know if I should bring my workbook? Best regards, Minh.";
			await page.locator("#writingTextarea").fill(writing56Words);
			await expect(page.getByTestId("writing-word-count")).toContainText(
				"56 / 50–80 từ",
			);
			await expect(page.locator("#writingWordHint")).toContainText(
				"Đạt độ dài gợi ý.",
			);

			// 7. Phần 5 Speaking: không tính vào 40 phút, audio-only tuần tự từng câu (đọc câu hỏi -> chuẩn bị -> ghi âm -> tạm dừng -> câu tiếp)
			await page.locator("#nextToSpeakingBtn").click();
			await expect(page.locator('[data-skill="speaking"]')).toBeVisible();
			await expect(page.locator(".question-level-pill")).toHaveCount(0);
			await expect(page.getByTestId("test-timer")).toContainText(
				"Speaking · Không tính vào 40 phút",
			);
			await expect(page.locator("#speakingOverviewCard")).toContainText(
				"Audio-only (chỉ Micro)",
			);
			await expect(page.locator("#speakingOverviewCard")).toContainText(
				"8 câu tuần tự",
			);
			await expect(
				page.locator("#speakingOverviewCard .speaking-overview-steps"),
			).toHaveCount(0);
			await expect(page.locator('[data-skill="speaking"]')).not.toContainText(
				"Hệ thống sẽ tự động đọc lần lượt từng câu hỏi",
			);
			// Trước khi bấm bắt đầu, ẩn đề từng câu hỏi và không có Camera + Micro / <video>
			await expect(page.locator("#speakingSessionCard")).toHaveCount(0);
			await expect(page.locator("#speakingActivePrompt")).toHaveCount(0);
			await expect(page.locator('[data-skill="speaking"] video')).toHaveCount(
				0,
			);
			await expect(page.locator('[data-skill="speaking"]')).not.toContainText(
				"Camera + Micro",
			);

			await page.locator("#startSpeakingBtn").click();

			const gumConstraints = await page.evaluate(
				() =>
					(
						window as unknown as {
							__gumConstraintsHistory?: Array<{
								audio?: unknown;
								video?: unknown;
							}>;
						}
					).__gumConstraintsHistory ?? [],
			);
			expect(gumConstraints.length).toBeGreaterThanOrEqual(1);
			for (const c of gumConstraints) {
				expect(c.audio).toBe(true);
				expect(c.video).toBe(false);
			}

			// Câu 1: auto đọc -> chuyển sang prep (đồng hồ giữa màn hình) -> thử Nghe lại câu hỏi (tối đa 1 lần) -> Trả lời ngay
			const sessionCard = page.locator("#speakingSessionCard");
			await expect(sessionCard).toBeVisible();
			await expect(sessionCard).toContainText("Câu 1 / 8");
			await expect(
				page.locator("#speakingSessionCard .question-level-pill"),
			).toHaveCount(0);
			const phaseBanner = page.locator("#speakingPhaseBanner");
			await expect(phaseBanner).toHaveClass(/\bis-prep\b/, { timeout: 5000 });
			await expect(
				page.locator(".speaking-center-stage #speakingTimerValue"),
			).toBeVisible();

			const speakingPotIssue = process.env.CAPTURE_POT_ISSUE?.trim();
			if (speakingPotIssue) {
				await page.setViewportSize({ width: 1440, height: 900 });
				await page.screenshot({
					path: reportPath(
						`${speakingPotIssue}-profile-speaking-prep-desktop-1440x900.png`,
					),
					fullPage: false,
				});
			}

			const replayBtn = page.locator("#speakingReplayPromptBtn");
			await expect(replayBtn).toBeEnabled();
			await replayBtn.click();
			await expect(replayBtn).toBeDisabled();
			await expect(replayBtn).toContainText("Đã nghe lại (1/1)");
			await expect(page.locator("#speakingReplayStatus")).toContainText(
				"Đã phát lại câu hỏi (1/1)",
			);

			await page.locator("#speakingStartAnswerNowBtn").click();
			await expect(phaseBanner).toHaveClass(/\bis-answer\b/);
			await expect(page.locator("#speakingPhaseBadge")).toContainText(
				"Đang ghi âm câu trả lời (Micro)",
			);
			await expect(
				page.locator(".speaking-center-stage #speakingPauseBtn"),
			).toBeVisible();
			await expect(
				page.locator(".speaking-early-footer #speakingFinishEarlyBtn"),
			).toBeVisible();

			// Kiểm tra xác nhận kết thúc sớm tách riêng ở footer (bấm rồi hủy để làm tiếp)
			await page.locator("#speakingFinishEarlyBtn").click();
			await expect(page.locator("#speakingFinishConfirmBox")).toBeVisible();
			await page.locator("#cancelFinishEarlyBtn").click();
			await expect(page.locator("#speakingFinishConfirmBox")).toHaveCount(0);

			// Chụp 3 viewport + reflow 320px trong lúc đang ghi âm tuần tự câu Speaking
			for (const vp of [
				...VIEWPORTS,
				{ width: 320, height: 568, label: "reflow-320x568" },
			] as const) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no speaking horizontal overflow at ${vp.label}`).toBe(
					false,
				);
				if (vp.label !== "reflow-320x568" && speakingPotIssue) {
					await page.screenshot({
						path: reportPath(
							`${speakingPotIssue}-profile-speaking-active-${vp.label}.png`,
						),
						fullPage: false,
					});
				}
			}
			await page.setViewportSize({ width: 1440, height: 900 });
			// Đợi đủ >250ms để MediaRecorder nhả ít nhất 1 audio chunk thực, rồi bấm nút tròn Pause
			await page.waitForTimeout(400);
			await page.locator("#speakingPauseBtn").click();
			await expect(phaseBanner).toHaveClass(/\bis-paused\b/);

			// Kiểm tra retry tối đa 2 lần cho Câu 1: còn 2/2 -> retry #1 -> còn 1/2 -> retry #2 -> 0/2 disabled
			const retryBtn = page.locator("#speakingRetryBtn");
			await expect(retryBtn).toBeEnabled();
			await expect(retryBtn).toContainText("còn 2/2");
			await retryBtn.click();
			await expect(phaseBanner).toHaveClass(/\bis-answer\b/);
			await page.waitForTimeout(300);
			await page.locator("#speakingPauseBtn").click();
			await expect(phaseBanner).toHaveClass(/\bis-paused\b/);
			await expect(retryBtn).toBeEnabled();
			await expect(retryBtn).toContainText("còn 1/2");
			await retryBtn.click();
			await expect(phaseBanner).toHaveClass(/\bis-answer\b/);
			await page.waitForTimeout(300);
			await page.locator("#speakingPauseBtn").click();
			await expect(phaseBanner).toHaveClass(/\bis-paused\b/);
			await expect(retryBtn).toBeDisabled();
			await expect(retryBtn).toContainText("0/2");

			await page.locator("#speakingNextTaskBtn").click();

			// Câu 2..8: tự đọc xong chuyển sang prep -> Trả lời ngay -> bấm Pause -> Câu tiếp theo
			for (let idx = 1; idx < 8; idx += 1) {
				await expect(sessionCard).toContainText(`Câu ${idx + 1} / 8`);
				await expect(phaseBanner).toHaveClass(/\bis-prep\b/, { timeout: 5000 });
				await page.locator("#speakingStartAnswerNowBtn").click();
				await expect(phaseBanner).toHaveClass(/\bis-answer\b/);
				await page.waitForTimeout(300);
				await page.locator("#speakingPauseBtn").click();
				await expect(phaseBanner).toHaveClass(/\bis-paused\b/);
				await page.locator("#speakingNextTaskBtn").click();
			}

			await expect(page.locator("#speakingReviewBox")).toBeVisible();
			await expect(page.locator("#speakingReviewBox")).toContainText(
				"Đã ghi âm hoàn tất (sẵn sàng nộp)",
			);
			await expect(page.locator("#retakeSpeakingBtn")).toHaveCount(0);
			const playbackAudio = page.locator("#speakingPlaybackAudio");
			await expect(playbackAudio).toBeVisible();
			await expect(playbackAudio).toHaveAttribute("src", /^blob:/);
			await expect(page.locator("video")).toHaveCount(0);

			const recorderStateChecks = await page.evaluate(() => {
				const win = window as unknown as {
					__spokenPrompts?: string[];
					__speakingRecorderEvents?: Array<{ type: string; state: string }>;
				};
				return {
					spokenCount: win.__spokenPrompts?.length ?? 0,
					eventTypes: (win.__speakingRecorderEvents ?? []).map((e) => e.type),
				};
			});
			expect(recorderStateChecks.spokenCount).toBeGreaterThanOrEqual(9);
			expect(recorderStateChecks.eventTypes).toContain("start");
			expect(recorderStateChecks.eventTypes).toContain("stop");
			expect(
				recorderStateChecks.eventTypes.filter((t) => t === "start").length,
			).toBeGreaterThanOrEqual(10);

			if (speakingPotIssue) {
				await page.screenshot({
					path: reportPath(
						`${speakingPotIssue}-profile-speaking-review-desktop-1440x900.png`,
					),
					fullPage: false,
				});
			}

			// 8. Nộp bài -> POST /submissions (201) + PUT /speaking-media (200) -> màn Kết quả tạm tính
			const submitPromise = page.waitForResponse(
				(res) =>
					res.url().endsWith("/public/placement-test/submissions") &&
					res.request().method() === "POST",
			);
			const uploadMediaPromise = page.waitForResponse(
				(res) =>
					/\/public\/placement-test\/submissions\/[^/]+\/speaking-media$/.test(
						res.url(),
					) && res.request().method() === "PUT",
			);
			await page.locator("#submitTestBtn").click();
			const submitRes = await submitPromise;
			const uploadMediaRes = await uploadMediaPromise;
			expect(submitRes.status()).toBe(201);
			expect(uploadMediaRes.status()).toBe(200);

			const resultCard = page.locator("#testResultCard");
			await expect(resultCard).toBeVisible();
			await expect(page.getByTestId("provisional-badge")).toContainText(
				"Hoàn tất nộp bài — Chờ chấm Writing & Speaking",
			);
			await expect(resultCard.locator("h1")).toHaveText(
				"Kết quả Reading & Listening",
			);
			await expect(resultCard.locator(".skill-score-tile")).toHaveCount(2);

			const listeningTile = page.locator('[data-skill-result="listening"]');
			await expect(listeningTile).toContainText("Listening");
			await expect(listeningTile).toContainText("13/13 câu đúng");
			await expect(listeningTile).toContainText("100%");
			await expect(listeningTile).toContainText("B1 trở lên");
			await expect(
				listeningTile.locator(".skill-progress-track"),
			).toBeVisible();

			const readingTile = page.locator('[data-skill-result="reading"]');
			await expect(readingTile).toContainText("Reading");
			await expect(readingTile).toContainText("12/15 câu đúng");
			await expect(readingTile).toContainText("80%");
			await expect(readingTile).toContainText("A2+ / B1 thấp");
			await expect(readingTile.locator(".skill-progress-track")).toBeVisible();

			const emailNotice = page.getByTestId("email-grading-notice");
			await expect(emailNotice).toBeVisible();
			await expect(page.getByTestId("registered-email")).toHaveText(email);

			await expect(page.locator(".provisional-hero-grid")).toHaveCount(0);
			await expect(page.getByTestId("objective-average-pct")).toHaveCount(0);
			await expect(
				page.locator('[data-skill-result="vocab-grammar"]'),
			).toHaveCount(0);
			await expect(page.locator('[data-skill-result="writing"]')).toHaveCount(
				0,
			);
			await expect(page.locator('[data-skill-result="speaking"]')).toHaveCount(
				0,
			);
			await expect(page.locator(".level-breakdown-section")).toHaveCount(0);
			await expect(page.locator("#cefrExplorerBox")).toHaveCount(0);
			await expect(resultCard).not.toContainText(
				"Phân tích theo từng cấp độ câu hỏi",
			);

			await expect(page.locator("#zaloResultCta")).toBeVisible();
			await expect(page.locator("#registerWithResultBtn")).toBeEnabled();
			await expect(page.locator("#retryTestBtn")).toBeEnabled();

			const potIssue = process.env.CAPTURE_POT_ISSUE?.trim();
			const resultViewports = [
				...VIEWPORTS,
				{ width: 320, height: 568, label: "reflow-320x568" },
			] as const;
			for (const vp of resultViewports) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				await page.evaluate(() =>
					window.scrollTo({ top: 0, behavior: "instant" }),
				);
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no result horizontal overflow at ${vp.label}`).toBe(
					false,
				);
				if (potIssue && vp.label !== "reflow-320x568") {
					await page.screenshot({
						path: reportPath(`${potIssue}-entry-test-result-${vp.label}.png`),
						fullPage: false,
					});
				}
			}
			await page.setViewportSize({ width: 1440, height: 900 });

			expect(await countLeads()).toBe(leadsBefore + 1);
			{
				const dbAfter = await openDb();
				try {
					const rowRes = await dbAfter.execute({
						sql: "SELECT source, email, study_mode, note, placement, submit_count FROM lead WHERE phone = ? LIMIT 1",
						args: [phone],
					});
					expect(rowRes.rows.length).toBe(1);
					expect(rowRes.rows[0]?.source).toBe("placement-test");
					expect(rowRes.rows[0]?.placement).not.toBe("");
					expect(Number(rowRes.rows[0]?.submit_count)).toBe(2);
				} finally {
					dbAfter.close();
				}
			}

			// Reload giữ màn kết quả, không tăng submit_count
			await page.reload();
			await expect(resultCard).toBeVisible();
			{
				const dbReload = await openDb();
				try {
					const rowRes = await dbReload.execute({
						sql: "SELECT submit_count FROM lead WHERE phone = ? LIMIT 1",
						args: [phone],
					});
					expect(Number(rowRes.rows[0]?.submit_count)).toBe(2);
				} finally {
					dbReload.close();
				}
			}

			// 9. Bấm đăng ký kèm kết quả tạm tính -> mở form trang chủ -> hợp nhất vào cùng dòng lead
			const consultPostPromise = page.waitForResponse(
				(res) =>
					res.url().endsWith("/public/leads") &&
					res.request().method() === "POST",
			);
			await page.locator("#registerWithResultBtn").click();
			const consultRes = await consultPostPromise;
			expect(consultRes.status()).toBe(201);
			await expect(page.locator("#registerConsultFeedback")).toBeVisible();
			await page.locator("#openHomepageConsultLink").click();

			await expect(page).toHaveURL(`${PROFILE_ORIGIN}/#dang-ky-tu-van`);
			expect(new URL(page.url()).search).toBe("");

			const banner = page.locator("#quizPlacementBanner");
			await expect(banner).toBeVisible();
			await expect(banner).toContainText("Đã đính kèm:");
			await expect(page.locator("#courseTrack")).toHaveValue(
				"workplace-interview",
			);
			await expect(page.locator("#studentName")).toHaveValue("Trần Minh Quân");
			await expect(page.locator("#studentPhone")).toHaveValue(phone);

			const consultForm = page.locator("#consultForm");
			await consultForm
				.getByRole("button", { name: "Đăng Ký Khóa Học" })
				.click();
			await expect(page.locator("#leadSuccessBox")).toBeVisible();

			{
				const dbMerged = await openDb();
				try {
					const rowRes = await dbMerged.execute({
						sql: "SELECT source, email, study_mode, note, submit_count FROM lead WHERE phone = ?",
						args: [phone],
					});
					expect(rowRes.rows.length).toBe(1);
					expect(rowRes.rows[0]?.source).toBe("placement-test");
					expect(rowRes.rows[0]?.email).toBe(email);
					expect(rowRes.rows[0]?.study_mode).toBe("group-online");
					expect(rowRes.rows[0]?.note).toBe("Cần lộ trình B1-B2");
					expect(Number(rowRes.rows[0]?.submit_count)).toBe(4);
				} finally {
					dbMerged.close();
				}
			}

			// 10. Context giáo viên trên /leads: mở modal chấm W&S, kiểm audio blob:, 3 viewport + dark mode, chấm W=5/5/5 & S=0/0/0/0 để kích hoạt hạ 1 bậc Speaking floor
			const browser = page.context().browser();
			if (!browser) throw new Error("missing browser instance");
			const teacherContext = await browser.newContext();
			const teacherPage = await teacherContext.newPage();
			try {
				await signUpLeadOrgTeacher(teacherPage, "Cô Mỹ Chấm Bài E2E");
				await teacherPage.goto(`${WEB_ORIGIN}/leads`);
				const table = teacherPage.getByTestId("leads-table");
				await expect(table).toBeVisible();

				const targetRow = table
					.locator("tr", { hasText: phone })
					.filter({ hasText: "Chờ chấm W&S" });
				await expect(targetRow).toBeVisible();
				await targetRow.click();

				const panel = teacherPage.getByTestId("placement-submission-panel");
				await expect(panel).toBeVisible();
				const mediaPlayer = teacherPage.getByTestId("speaking-media-player");
				await expect(mediaPlayer).toBeVisible();
				await expect(mediaPlayer).toHaveJSProperty("tagName", "AUDIO");
				await expect(mediaPlayer).toHaveAttribute("src", /^blob:/, {
					timeout: 15_000,
				});

				for (const vp of VIEWPORTS) {
					await teacherPage.setViewportSize({
						width: vp.width,
						height: vp.height,
					});
					const overflow = await teacherPage.evaluate(
						() =>
							document.documentElement.scrollWidth >
							document.documentElement.clientWidth,
					);
					expect(overflow, `no /leads modal overflow at ${vp.label}`).toBe(
						false,
					);
					await teacherPage.screenshot({
						path: reportPath(`727-leads-grading-${vp.label}.png`),
						fullPage: false,
					});
				}

				await teacherPage.setViewportSize({ width: 1440, height: 900 });
				await teacherPage.evaluate(() =>
					document.documentElement.classList.add("dark"),
				);
				await teacherPage.screenshot({
					path: reportPath("727-leads-grading-desktop-dark.png"),
					fullPage: false,
				});
				await teacherPage.evaluate(() =>
					document.documentElement.classList.remove("dark"),
				);

				await teacherPage.getByTestId("writing-ct-5").click();
				await teacherPage.getByTestId("writing-or-5").click();
				await teacherPage.getByTestId("writing-lg-5").click();
				await teacherPage.getByTestId("speaking-gv-0").click();
				await teacherPage.getByTestId("speaking-dm-0").click();
				await teacherPage.getByTestId("speaking-pr-0").click();
				await teacherPage.getByTestId("speaking-ic-0").click();

				await expect(
					teacherPage.getByTestId("speaking-floor-note"),
				).toContainText("Điểm Speaking thấp hơn đáng kể");
				await expect(
					teacherPage.getByTestId("final-band-preview"),
				).toContainText("A2 (71%)");

				await teacherPage
					.getByLabel("Nhận xét bài kiểm tra đầu vào")
					.fill(
						"Nghe đọc ngữ pháp rất vững, cần luyện phản xạ nói câu trọn vẹn.",
					);

				const gradePromise = teacherPage.waitForResponse(
					(res) =>
						/\/api\/leads\/[^/]+\/placement-submission$/.test(res.url()) &&
						res.request().method() === "PATCH",
				);
				await teacherPage.getByTestId("save-placement-grade-btn").click();
				const gradeRes = await gradePromise;
				expect(gradeRes.status()).toBe(200);
				await expect(
					teacherPage.getByText("Đã lưu kết quả chấm bài kiểm tra đầu vào."),
				).toBeVisible();

				await teacherPage.keyboard.press("Escape");
				await expect(panel).toBeHidden();
				await expect(table.locator("tr", { hasText: phone })).toContainText(
					"Đã chấm bài test",
				);

				const dbGraded = await openDb();
				try {
					const gradedRow = await dbGraded.execute({
						sql: "SELECT placement FROM lead WHERE phone = ? LIMIT 1",
						args: [phone],
					});
					const placementText = String(gradedRow.rows[0]?.placement ?? "");
					expect(placementText).toContain("A2");
					expect(placementText).toContain("71%");
				} finally {
					dbGraded.close();
				}
			} finally {
				await teacherContext.close();
			}
		});

		test("cổng thông tin: kiểm lỗi hợp lệ, giữ form khi API 500, thử gửi lại và quay lại sửa thông tin đã điền (#721)", async ({
			page,
		}) => {
			await clearRateLimits();
			const leadsBefore = await countLeads();

			await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
			await page.locator("#startTestBtn").click();
			await expect(page.locator("#leadGateCard")).toBeVisible();

			// 1. Gửi form rỗng -> báo lỗi 3 trường, focus #leadName, không tạo lead
			await page.locator("#submitLeadGateBtn").click();
			await expect(page.locator("#leadName")).toHaveAttribute(
				"aria-invalid",
				"true",
			);
			await expect(page.locator("#leadEmail")).toHaveAttribute(
				"aria-invalid",
				"true",
			);
			await expect(page.locator("#leadPhone")).toHaveAttribute(
				"aria-invalid",
				"true",
			);
			await expect(page.locator("#leadNameError")).toBeVisible();
			await expect(page.locator("#leadPhoneError")).toBeVisible();
			await expect(page.locator("#leadEmailError")).toBeVisible();
			await expect(page.locator("#leadName")).toBeFocused();
			expect(await countLeads()).toBe(leadsBefore);

			// 2. Họ tên đúng nhưng email + SĐT sai -> focus trường lỗi tiếp theo (#leadEmail theo thứ tự validateLeadForm)
			await page.locator("#leadName").fill("Lê Thu Trang");
			await page.locator("#leadPhone").fill("0909123");
			await page.locator("#leadEmail").fill("email-khong-hop-le");
			await page.locator("#submitLeadGateBtn").click();
			await expect(page.locator("#leadName")).not.toHaveAttribute(
				"aria-invalid",
				"true",
			);
			await expect(page.locator("#leadEmail")).toHaveAttribute(
				"aria-invalid",
				"true",
			);
			await expect(page.locator("#leadEmail")).toBeFocused();
			expect(await countLeads()).toBe(leadsBefore);

			// 3. API trả 500 khi gửi -> chặn ở form, hiện #leadFormError chứa "Hệ thống đang bận", không tạo lead
			await page.route("**/public/leads", async (route) => {
				if (route.request().method() === "POST") {
					await route.fulfill({
						status: 500,
						headers: {
							"Access-Control-Allow-Origin": PROFILE_ORIGIN,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ error: "internal" }),
					});
					return;
				}
				await route.continue();
			});

			const phone = uniquePhone();
			await page.locator("#leadPhone").fill(phone);
			await page.locator("#leadEmail").fill("thutrang@example.com");
			await page.locator("#submitLeadGateBtn").click();

			const formError = page.locator("#leadFormError");
			await expect(formError).toBeVisible();
			await expect(formError).toContainText("Hệ thống đang bận");
			await expect(page.locator('[data-skill="listening"]')).toHaveCount(0);
			expect(await countLeads()).toBe(leadsBefore);

			// Gỡ mock 500 và bấm #submitLeadGateBtn lại -> vào Listening + tạo 1 lead
			await page.unroute("**/public/leads");
			await page.locator("#submitLeadGateBtn").click();
			await expect(page.locator('[data-skill="listening"]')).toBeVisible();
			expect(await countLeads()).toBe(leadsBefore + 1);

			// 4. Bấm #changeLeadInfoBtn -> quay lại cổng thông tin, giữ sẵn tên/SĐT để chỉnh sửa
			await page.locator("#changeLeadInfoBtn").click();
			await expect(page.locator("#leadGateCard")).toBeVisible();
			await expect(page.locator("#leadName")).toHaveValue("Lê Thu Trang");
			await expect(page.locator("#leadPhone")).toHaveValue(phone);
			const savedAfterEdit = await page.evaluate(
				(key) => localStorage.getItem(key),
				STORAGE_KEY,
			);
			expect(savedAfterEdit).not.toBeNull();
		});

		test("3 viewport không tràn ngang, điều hướng bàn phím, hoàn lượt khi audio clip-lb lỗi, hộp xác nhận trống và bỏ qua Speaking (#721)", async ({
			page,
		}) => {
			await clearRateLimits();
			await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);

			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no intro horizontal overflow at ${vp.label}`).toBe(
					false,
				);
				await page.screenshot({
					path: reportPath(`727-profile-intro-${vp.label}.png`),
					fullPage: false,
				});
			}

			// Điều hướng bàn phím sang cổng thông tin & chụp 3 viewport
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.locator("#startTestBtn").focus();
			await page.keyboard.press("Enter");
			await expect(
				page.getByRole("heading", {
					name: "Nhập thông tin trước khi vào làm bài",
				}),
			).toBeVisible();

			for (const vp of VIEWPORTS) {
				await page.setViewportSize({ width: vp.width, height: vp.height });
				const overflow = await page.evaluate(
					() =>
						document.documentElement.scrollWidth >
						document.documentElement.clientWidth,
				);
				expect(overflow, `no gate horizontal overflow at ${vp.label}`).toBe(
					false,
				);
				await page.screenshot({
					path: reportPath(`727-profile-gate-${vp.label}.png`),
					fullPage: false,
				});
			}

			// Cài chặn mạng clip-lb trước khi render Listening (do audio preload="metadata")
			const pubDataRes = await page.request.get(
				`${API_ORIGIN}/public/placement-test`,
				{
					headers: { Origin: PROFILE_ORIGIN },
				},
			);
			expect(pubDataRes.status()).toBe(200);
			const pubData = (await pubDataRes.json()) as {
				parts: [{ clips: Array<{ id: string; src: string }> }];
			};
			const clipLbSrc =
				pubData.parts[0].clips.find((c) => c.id === "clip-lb")?.src ??
				"/public/placement-test/audio/clip-lb";
			await page.route(`**${clipLbSrc}`, (route) => route.abort("failed"));

			// Tab theo thứ tự DOM hàng 1 (#leadName -> #leadPhone -> #leadEmail) và Enter gửi
			await page.setViewportSize({ width: 1440, height: 900 });
			await page.locator("#leadName").focus();
			await page.keyboard.type("Phạm Hoàng Minh");
			await page.keyboard.press("Tab");
			await expect(page.locator("#leadPhone")).toBeFocused();
			await page.keyboard.type(uniquePhone());
			await page.keyboard.press("Tab");
			await expect(page.locator("#leadEmail")).toBeFocused();
			await page.keyboard.type(`hoangminh.${Date.now()}@example.com`);
			await page.locator("#submitLeadGateBtn").focus();
			await page.keyboard.press("Enter");
			await expect(page.locator('[data-skill="listening"]')).toBeVisible();

			// Bấm phát clip-lb đang lỗi -> hiện lỗi + hoàn lượt giữ nguyên 2/2 + plays["clip-lb"] === 0
			const clipLbBtn = page.locator('button[data-play-clip="clip-lb"]');
			const clipLbStatus = page.locator('[data-clip-status="clip-lb"]');
			await clipLbBtn.click();
			const clipLbErr = clipLbBtn
				.locator("xpath=ancestor::div[contains(@class,'clip-player-box')]")
				.locator(".clip-error-msg");
			await expect(clipLbErr).toBeVisible();
			await expect(clipLbErr).toHaveText(
				/Không thể tải file âm thanh|Trình duyệt không phát được âm thanh/,
			);
			await expect(clipLbStatus).toContainText("Còn 2/2 lượt nghe");
			await expect(clipLbBtn).toBeEnabled();
			const savedPlaysClipLb = await page.evaluate((key) => {
				const raw = localStorage.getItem(key);
				return raw ? (JSON.parse(raw)?.plays?.["clip-lb"] ?? 0) : 0;
			}, STORAGE_KEY);
			expect(savedPlaysClipLb).toBe(0);
			await page.unroute(`**${clipLbSrc}`);

			// Nhảy sang tab Speaking, kiểm tra hộp xác nhận câu trống + Bỏ qua phần Speaking
			await page
				.locator('nav.skill-stepper button[data-skill-step="speaking"]')
				.click();
			await expect(page.locator('[data-skill="speaking"]')).toBeVisible();

			await page.locator("#submitTestBtn").click();
			const confirmBox = page.locator("#unansweredConfirmBox");
			await expect(confirmBox).toBeVisible();
			await page.locator("#cancelSubmitBtn").click();
			await expect(confirmBox).toBeHidden();

			await page.locator("#skipSpeakingBtn").click();
			await expect(
				page.getByText("Đã chọn bỏ qua phần Speaking"),
			).toBeVisible();

			await page.locator("#submitTestBtn").click();
			await expect(confirmBox).toBeVisible();
			await page.locator("#confirmSubmitBtn").click();

			const skippedResultCard = page.locator("#testResultCard");
			await expect(skippedResultCard).toBeVisible();
			await expect(skippedResultCard.locator(".skill-score-tile")).toHaveCount(
				2,
			);
			await expect(
				page.locator('[data-skill-result="listening"]'),
			).toContainText("0/13 câu đúng");
			await expect(page.locator('[data-skill-result="reading"]')).toContainText(
				"0/15 câu đúng",
			);
			await expect(page.getByTestId("email-grading-notice")).toBeVisible();
			await expect(page.locator('[data-skill-result="speaking"]')).toHaveCount(
				0,
			);
			await expect(page.locator(".level-breakdown-section")).toHaveCount(0);

			await page.locator("#retryTestBtn").click();
			await expect(page.locator("#startTestBtn")).toBeVisible();
			await expect(skippedResultCard).toHaveCount(0);
		});

		test("snapshot v1 cũ tự backfill 6 bài đọc Reading (15 câu), Writing và 8 câu Speaking trên 3 viewport", async ({
			page,
		}) => {
			await clearRateLimits();

			const db = await openDb();
			let savedRow: {
				draft: string | null;
				published: string | null;
				revision: number;
				published_revision: number | null;
				published_version: number | null;
				published_at: number | null;
			} | null = null;

			try {
				const existing = await db.execute({
					sql: "SELECT draft, published, revision, published_revision, published_version, published_at FROM placement_test WHERE org_id = ? LIMIT 1",
					args: [LEAD_ORG_ID],
				});
				const row = existing.rows[0];
				if (!row) {
					throw new Error("Không tìm thấy row placement_test cho LEAD_ORG_ID");
				}
				savedRow = {
					draft: typeof row.draft === "string" ? row.draft : null,
					published: typeof row.published === "string" ? row.published : null,
					revision: Number(row.revision ?? 0),
					published_revision:
						row.published_revision == null
							? null
							: Number(row.published_revision),
					published_version:
						row.published_version == null
							? null
							: Number(row.published_version),
					published_at:
						row.published_at == null ? null : Number(row.published_at),
				};

				const v1Published = {
					version: 1,
					bands: [
						{
							min: 0,
							max: 14,
							cefr: "Pre-A1",
							course: "foundation-core",
							courseLabel: "Xây Nền Từ Gốc",
						},
						{
							min: 15,
							max: 22,
							cefr: "A1–A2",
							course: "comm-1",
							courseLabel: "Giao tiếp 1",
						},
						{
							min: 23,
							max: 30,
							cefr: "B1",
							course: "comm-3",
							courseLabel: "Giao tiếp 3",
						},
					],
					parts: [
						{
							id: "vocab-grammar",
							title: "Vocab + Grammar",
							questions: Array.from({ length: 15 }, (_, idx) => ({
								id: `v1-vg-${idx + 1}`,
								kind: idx % 2 === 0 ? "grammar" : "vocab",
								level: "A2",
								prompt: `Legacy V1 grammar question ${idx + 1}`,
								options: ["Option A", "Option B", "Option C", "Option D"],
								answer: idx % 4,
							})),
						},
						{
							id: "listening",
							title: "Listening",
							clips: Array.from({ length: 5 }, (_, cIdx) => ({
								id: `v1-clip-${cIdx + 1}`,
								src: "/public/placement-test/audio/11111111-1111-4111-8111-111111111111",
								maxPlays: 2,
								level: "A2",
								title:
									cIdx === 0
										? "Đoạn nghe 1 (A2) – Thông báo tại thư viện cộng đồng"
										: `Đoạn nghe ${cIdx + 1} (B1) – Legacy V1 Audio ${cIdx + 1}`,
								questions: Array.from({ length: 3 }, (_, qIdx) => ({
									id: `v1-l-${cIdx * 3 + qIdx + 1}`,
									level: "A2",
									prompt: `Legacy V1 listening question ${cIdx * 3 + qIdx + 1}`,
									options: ["One", "Two", "Three", "Four"],
									answer: qIdx % 4,
								})),
							})),
						},
					],
				};

				await db.execute({
					sql: "UPDATE placement_test SET published = ?, published_version = 1 WHERE org_id = ?",
					args: [JSON.stringify(v1Published), LEAD_ORG_ID],
				});

				await page.goto(`${PROFILE_ORIGIN}/kiem-tra-dau-vao/`);
				await page.locator("#startTestBtn").click();
				await expect(page.locator("#leadName")).toBeVisible();
				await page.locator("#leadName").fill("Học Viên Snapshot V1");
				await page.locator("#leadPhone").fill(uniquePhone());
				await page
					.locator("#leadEmail")
					.fill(`legacy.v1.${Date.now()}@example.com`);
				await page.locator("#submitLeadGateBtn").click();

				await expect(page.locator('[data-skill="listening"]')).toBeVisible();
				await expect(page.locator(".progress-counter")).toContainText(
					"Đã trả lời 0/45 câu",
				);
				await expect(page.locator(".question-level-pill")).toHaveCount(0);
				const firstListeningClip = page.locator(".listening-clip-card").first();
				await expect(firstListeningClip.locator(".clip-badges")).toHaveCount(0);
				await expect(firstListeningClip.locator(".clip-title")).toHaveText(
					"Đoạn nghe 1 – Thông báo tại thư viện cộng đồng",
				);

				const potIssue = process.env.CAPTURE_POT_ISSUE?.trim();
				const checkViewports = [
					...VIEWPORTS,
					{ width: 320, height: 568, label: "reflow-320x568" },
				] as const;

				for (const vp of checkViewports) {
					await page.setViewportSize({ width: vp.width, height: vp.height });
					await page.evaluate(() => {
						const clip = document.querySelector(".listening-clip-card");
						const header = document.querySelector(".site-header");
						if (!clip) return;
						const headerHeight = header
							? header.getBoundingClientRect().height
							: 0;
						const top =
							clip.getBoundingClientRect().top +
							window.scrollY -
							headerHeight -
							16;
						window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
					});
					const overflow = await page.evaluate(
						() =>
							document.documentElement.scrollWidth >
							document.documentElement.clientWidth,
					);
					expect(
						overflow,
						`no listening horizontal overflow at ${vp.label}`,
					).toBe(false);
					if (potIssue && vp.label !== "reflow-320x568") {
						await page.screenshot({
							path: reportPath(
								`${potIssue}-placement-no-level-${vp.label}.png`,
							),
							fullPage: false,
						});
					}
				}

				await page.setViewportSize({ width: 1440, height: 900 });

				await page
					.locator('nav.skill-stepper button[data-skill-step="reading"]')
					.click();
				await expect(page.locator('[data-skill="reading"]')).toBeVisible();
				await expect(page.locator(".progress-counter")).toContainText(
					"Đã trả lời 0/45 câu",
				);

				const readingSection = page.locator('[data-skill="reading"]');
				const passageCards = page.locator(".reading-passage-card");
				await expect(passageCards).toHaveCount(6);
				await expect(
					page.locator(".reading-passage-card .question-tag"),
				).toHaveCount(0);
				for (const redundantLabel of [
					"Biển báo / Thông báo",
					"Tin nhắn / Email",
					"Bài đọc hiểu",
					"Đoạn văn điền từ",
				]) {
					await expect(readingSection).not.toContainText(redundantLabel);
				}
				await expect(
					passageCards.nth(1).locator(".passage-header"),
				).toHaveCount(0);
				await expect(passageCards.nth(1).locator(".clip-badges")).toHaveCount(
					0,
				);
				await expect(passageCards.first()).toContainText("CITY SWIMMING POOL");
				await expect(passageCards.last()).toContainText("Working from home");
				await expect(
					page.locator(".reading-passage-card fieldset[data-question-id]"),
				).toHaveCount(15);

				await page
					.locator('fieldset[data-question-id="r-a1"] input[value="1"]')
					.check();
				await expect(page.locator(".progress-counter")).toContainText(
					"Đã trả lời 1/45 câu",
				);

				for (const vp of checkViewports) {
					await page.setViewportSize({ width: vp.width, height: vp.height });
					await passageCards.first().scrollIntoViewIfNeeded();
					const overflow = await page.evaluate(
						() =>
							document.documentElement.scrollWidth >
							document.documentElement.clientWidth,
					);
					expect(
						overflow,
						`no reading horizontal overflow at ${vp.label}`,
					).toBe(false);
					if (potIssue && vp.label !== "reflow-320x568") {
						await page.screenshot({
							path: reportPath(`${potIssue}-profile-reading-${vp.label}.png`),
							fullPage: false,
						});
					}
				}

				await page.setViewportSize({ width: 1440, height: 900 });
				await page.locator("#nextToWritingBtn").click();
				await expect(page.locator('[data-skill="writing"]')).toBeVisible();
				await expect(page.locator(".writing-card")).toContainText(
					"Email to a friend",
				);

				await page.locator("#nextToSpeakingBtn").click();
				await expect(page.locator('[data-skill="speaking"]')).toBeVisible();
				await expect(page.locator("#speakingOverviewCard")).toContainText(
					"8 câu tuần tự",
				);
			} finally {
				if (savedRow) {
					await db.execute({
						sql: "UPDATE placement_test SET draft = ?, published = ?, revision = ?, published_revision = ?, published_version = ?, published_at = ? WHERE org_id = ?",
						args: [
							savedRow.draft,
							savedRow.published,
							savedRow.revision,
							savedRow.published_revision,
							savedRow.published_version,
							savedRow.published_at,
							LEAD_ORG_ID,
						],
					});
				}
				db.close();
			}
		});
	});
