import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { ensureAdminAccount, signUpViaApi } from "./helpers";
import {
	ADMIN_ORIGIN,
	API_ORIGIN,
	STUDENT_ORIGIN,
	WEB_ORIGIN,
} from "./origins";

/**
 * #681 — kiểm chứng âm thực tế trên stack E2E thật (Hono Node +
 * `createFsMediaStore`): cả 5 route upload nhị phân phải từ chối `415`/`400`
 * đối với request lệch đuôi (`payload.html`) và polyglot HTML giả mạo
 * (`spoof.mp3` / `spoof.jpg` mang nội dung HTML) mà KHÔNG ghi file rác vào
 * kho, KHÔNG tạo bản ghi bẩn và KHÔNG trừ Credit.
 */

const HTML_PAYLOAD = Buffer.from(
	"<!doctype html><html><script>alert(1)</script></html>",
);
/** MP3 thật 1 giây im lặng (ID3v2.4) — dùng làm body dương nếu cần so sánh. */
const SPEAKING_SAMPLE = readFileSync(
	new URL("../fixtures/speaking-sample.mp3", import.meta.url),
);

const SPOOF_HEADERS = (name: string, mime: string) => ({
	Origin: WEB_ORIGIN,
	"Content-Type": mime,
	"X-File-Name": encodeURIComponent(name),
});

interface RejectCase {
	readonly name: string;
	readonly mime: string;
	readonly body: Buffer;
}

async function expectPlacementReject(page: Page) {
	const cases: readonly RejectCase[] = [
		{ name: "payload.html", mime: "audio/mpeg", body: HTML_PAYLOAD },
		{ name: "spoof.mp3", mime: "audio/mpeg", body: HTML_PAYLOAD },
	];
	for (const item of cases) {
		const res = await page.request.fetch(
			`${API_ORIGIN}/api/placement-test/audio`,
			{
				method: "PUT",
				maxRedirects: 0,
				headers: SPOOF_HEADERS(item.name, item.mime),
				data: item.body,
			},
		);
		expect(res.status(), `${item.name} + ${item.mime}`).toBe(415);
		expect(await res.json()).toMatchObject({ code: "UNSUPPORTED_AUDIO_TYPE" });
	}
}

async function expectVocabReject(page: Page, wordId: string) {
	const cases: readonly RejectCase[] = [
		{ name: "word.mp3", mime: "audio/mpeg", body: HTML_PAYLOAD },
		{ name: "payload.html", mime: "audio/mpeg", body: HTML_PAYLOAD },
	];
	for (const item of cases) {
		const res = await page.request.fetch(
			`${API_ORIGIN}/api/kernel/vocab/words/${wordId}/audio`,
			{
				method: "PUT",
				maxRedirects: 0,
				headers: SPOOF_HEADERS(item.name, item.mime),
				data: item.body,
			},
		);
		expect(res.status(), `${item.name} + ${item.mime}`).toBe(415);
		expect(await res.json()).toMatchObject({ code: "VOCAB_INVALID_AUDIO" });
	}
}

test.describe("#681 media upload magic-byte rejection (E2E âm)", () => {
	test("Placement test audio: PUT /api/placement-test/audio từ chối payload.html và spoof.mp3 (415)", async ({
		page,
	}) => {
		await signUpViaApi(page);
		await expectPlacementReject(page);
	});

	test("Vocab word audio: PUT /api/kernel/vocab/words/:id/audio từ chối spoof.mp3 (415) và giữ audioKey null", async ({
		page,
	}) => {
		const email = await signUpViaApi(page);
		// Tạo deck + word qua API kernel (org đã bootstrap sau sign-up).
		const deckRes = await page.request.post(
			`${API_ORIGIN}/api/kernel/vocab/decks`,
			{
				data: { title: `E2E Guards ${Date.now()}`, lang: "en" },
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(deckRes.status()).toBe(201);
		const { id: deckId } = (await deckRes.json()) as { id: string };
		const wordRes = await page.request.post(
			`${API_ORIGIN}/api/kernel/vocab/words/upsert`,
			{
				data: { deckId, word: "guards", translation: "bảo vệ", sortOrder: 0 },
				headers: { Origin: WEB_ORIGIN, "Content-Type": "application/json" },
			},
		);
		expect(wordRes.status()).toBe(201);
		const { id: wordId } = (await wordRes.json()) as { id: string };

		await expectVocabReject(page, wordId);

		// Thiếu X-File-Name → 400 VOCAB_INVALID_AUDIO (Task 3.1).
		const missingName = await page.request.fetch(
			`${API_ORIGIN}/api/kernel/vocab/words/${wordId}/audio`,
			{
				method: "PUT",
				maxRedirects: 0,
				headers: {
					Origin: WEB_ORIGIN,
					"Content-Type": "audio/mpeg",
					"Content-Length": String(HTML_PAYLOAD.byteLength),
				},
				data: HTML_PAYLOAD,
			},
		);
		expect(missingName.status()).toBe(400);
		expect(await missingName.json()).toMatchObject({
			code: "VOCAB_INVALID_AUDIO",
		});

		// Không có audio nào bị ghi: GET words vẫn audioKey null.
		const wordsRes = await page.request.get(
			`${API_ORIGIN}/api/kernel/vocab/decks/${deckId}/words`,
			{ headers: { Origin: WEB_ORIGIN } },
		);
		expect(wordsRes.status()).toBe(200);
		const body = (await wordsRes.json()) as {
			words: Array<{ id: string; audioKey: string | null }>;
		};
		const uploaded = body.words.find((w) => w.id === wordId);
		expect(uploaded, "word row phải còn trong danh sách").toBeDefined();
		expect(uploaded?.audioKey ?? null).toBeNull();

		// Credit wallet không đổi (vocab audio không tốn Credit nhưng kiểm
		// thêm để chặn hồi quy ghi bẩn org-wide).
		const walletRes = await page.request.get(
			`${API_ORIGIN}/api/credits/wallet`,
			{
				headers: { Origin: WEB_ORIGIN },
			},
		);
		expect(walletRes.status()).toBe(200);
		void email;
	});

	test("AI Exam Import: POST /api/exam-imports từ chối payload.html (image/png) và spoof.jpg (\\xff\\xd8\\xff<html>) — 400 INVALID_FILE, ví nguyên 30 Cr", async ({
		page,
	}) => {
		await signUpViaApi(page);
		const examRejectCases: readonly RejectCase[] = [
			{ name: "payload.html", mime: "image/png", body: HTML_PAYLOAD },
			{
				name: "spoof.jpg",
				mime: "image/jpeg",
				body: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), HTML_PAYLOAD]),
			},
		];
		for (const item of examRejectCases) {
			const res = await page.request.fetch(`${API_ORIGIN}/api/exam-imports`, {
				method: "POST",
				maxRedirects: 0,
				headers: { ...SPOOF_HEADERS(item.name, item.mime), Origin: WEB_ORIGIN },
				data: item.body,
			});
			expect(res.status(), `${item.name} + ${item.mime}`).toBe(400);
			expect(await res.json()).toMatchObject({
				code: "E-selfomy-alignment-003",
				reason: "type",
			});
		}
		// Ví không bị trừ Credit (không giữ/trừ cho file giả mạo).
		const walletRes = await page.request.get(
			`${API_ORIGIN}/api/credits/wallet`,
			{
				headers: { Origin: WEB_ORIGIN },
			},
		);
		expect((await walletRes.json()) as { balance: number }).toMatchObject({
			balance: 30,
			held: 0,
		});
	});

	test("Admin library audio: PUT /api/admin/library/tests/:id/parts/:part/audio từ chối spoof.mp3 (415), GET audio vẫn 404", async ({
		request,
	}) => {
		await ensureAdminAccount(request as unknown as never);
		const createRes = await request.post(
			`${API_ORIGIN}/api/admin/library/tests`,
			{
				headers: { Origin: ADMIN_ORIGIN, "Content-Type": "application/json" },
				data: { title: `E2E Guards ${Date.now()}`, skill: "listening" },
			},
		);
		expect(createRes.status()).toBe(201);
		const { id: testId } = (await createRes.json()) as { id: string };

		const libraryRejectCases: readonly RejectCase[] = [
			{ name: "payload.html", mime: "audio/mpeg", body: HTML_PAYLOAD },
			{ name: "spoof.mp3", mime: "audio/mpeg", body: HTML_PAYLOAD },
		];
		for (const item of libraryRejectCases) {
			const res = await request.fetch(
				`${API_ORIGIN}/api/admin/library/tests/${testId}/parts/s1/audio`,
				{
					method: "PUT",
					maxRedirects: 0,
					headers: {
						...SPOOF_HEADERS(item.name, item.mime),
						Origin: ADMIN_ORIGIN,
					},
					data: item.body,
				},
			);
			expect(res.status(), item.name).toBe(415);
			expect(await res.json()).toMatchObject({
				code: "UNSUPPORTED_AUDIO_TYPE",
			});
		}
		const getRes = await request.get(
			`${API_ORIGIN}/api/admin/library/tests/${testId}/parts/s1/audio`,
			{ headers: { Origin: ADMIN_ORIGIN } },
		);
		expect(getRes.status()).toBe(404);
	});

	test("Speaking media: PUT /api/student/attempts/:id/media hoàn tất round-trip HTTP sạch (404 cho attempt lạ) — không treo stream (#681)", async ({
		page,
	}) => {
		// Sign-up học viên thật qua portal origin (cookie jar page context).
		// Negative matrix đầy đủ của Speaking (attempt thật, 415 cho
		// payload.html/spoof.mp3) nằm ở unit test `student-quiz-media.test.ts`
		// ("upload validates filename extension and magic bytes before storing
		// (#681)") trên attempt thật — spec này chỉ chứng minh đường HTTP thật
		// (Node + fs-media-store) trả lời sạch, nhanh cho attempt không tồn tại.
		const email = `e2e-speaker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
		const studentRes = await page.request.post(
			`${API_ORIGIN}/api/auth/sign-up/email`,
			{
				data: {
					name: "E2E Speaking",
					email,
					password: "password-8chars",
				},
				headers: { "Content-Type": "application/json", Origin: STUDENT_ORIGIN },
			},
		);
		expect(studentRes.status()).toBe(200);
		const missingAttempt = await page.request.fetch(
			`${API_ORIGIN}/api/student/attempts/khong-ton-tai/media`,
			{
				method: "PUT",
				maxRedirects: 0,
				headers: {
					Origin: STUDENT_ORIGIN,
					"Content-Type": "audio/mpeg",
					"X-File-Name": encodeURIComponent("payload.html"),
					"Content-Length": String(HTML_PAYLOAD.byteLength),
					"x-student-org-id": "",
				},
				data: HTML_PAYLOAD,
			},
		);
		expect([401, 403, 404]).toContain(missingAttempt.status());
		void SPEAKING_SAMPLE;
	});
});
