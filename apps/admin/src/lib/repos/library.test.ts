import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createLibraryTest,
	deleteLibraryAudio,
	deleteLibraryPart,
	deleteLibraryTest,
	getLibraryTest,
	isLibraryHttpError,
	libraryAudioUrl,
	libraryIssuesOf,
	listLibraryTests,
	setLibraryTestStatus,
	updateLibraryTest,
	uploadLibraryAudio,
	upsertLibraryPart,
} from "./library";

/**
 * Mock fetch Ở BIÊN mạng (không mock nghiệp vụ): response là JSON đúng
 * shape DTO của contract, parse zod chạy thật.
 */

const BASE = "http://localhost:8000";

function jsonResponse(status: number, body: unknown): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
	} as Response;
}

const fetchMock = vi.fn();

/** Lấy call theo index từ mock không kiểu — any gán thẳng, không cần cast. */
function callOf(index: number): { url: string; init: RequestInit } {
	const call = fetchMock.mock.calls[index] ?? [];
	return { url: call[0], init: call[1] ?? {} };
}

/** Lấy một header từ RequestInit — typed qua chuẩn `Headers`. */
function headerOf(init: RequestInit, name: string): string | null {
	return new Headers(init.headers).get(name);
}

/** Body string của mock request — thu hẹp bằng typeof, không cast mù. */
function bodyJson(init: RequestInit): Record<string, unknown> {
	const body = init.body;
	if (typeof body !== "string") {
		throw new Error("Mock request không có body string.");
	}
	return JSON.parse(body);
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const listItem = {
	id: "t1",
	title: "IELTS Reading Mock 01",
	description: null,
	skill: "reading",
	timeLimitSeconds: 3600,
	collection: "Cambridge 18",
	testGroup: "TEST 1",
	status: "draft",
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-02T00:00:00.000Z",
	partCount: 2,
	questionCount: 13,
	hasAllAudio: true,
};

/** Header của LibraryTestDetail — không có 3 field thống kê của ListItem. */
const {
	partCount: _partCount,
	questionCount: _questionCount,
	hasAllAudio: _hasAllAudio,
	...detailHeader
} = listItem;

describe("listLibraryTests", () => {
	it("GET danh sách và zod parse từng item", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, [listItem]));
		const items = await listLibraryTests();
		expect(items).toHaveLength(1);
		expect(items[0]?.questionCount).toBe(13);
		const { url, init } = callOf(0);
		expect(url).toBe(`${BASE}/api/admin/library/tests`);
		expect(init.credentials).toBe("include");
	});

	it("response sai shape → zod lỗi, không trả dữ liệu bẩn", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, [{ ...listItem, questionCount: "13" }]),
		);
		await expect(listLibraryTests()).rejects.toThrow();
	});
});

describe("createLibraryTest", () => {
	it("POST JSON header, trả {id} (201 CreatedResponse)", async () => {
		fetchMock.mockResolvedValue(jsonResponse(201, { id: "new-1" }));
		const created = await createLibraryTest({
			title: "Đề mới",
			description: "",
			skill: "listening",
			timeLimitSeconds: 3600,
			collection: "",
			testGroup: "",
		});
		expect(created).toEqual({ id: "new-1" });
		const { url, init } = callOf(0);
		expect(url).toBe(`${BASE}/api/admin/library/tests`);
		expect(init.method).toBe("POST");
		expect(headerOf(init, "content-type")).toBe("application/json");
		expect(bodyJson(init)).toMatchObject({
			title: "Đề mới",
			skill: "listening",
		});
	});

	it("header vi phạm schema (title rỗng) → chặn trước khi fetch", async () => {
		await expect(
			createLibraryTest({
				title: "  ",
				description: "",
				skill: "reading",
				timeLimitSeconds: 3600,
				collection: "",
				testGroup: "",
			}),
		).rejects.toThrow();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe("updateLibraryTest / setLibraryTestStatus", () => {
	const detail = {
		...detailHeader,
		parts: [
			{
				id: "p1",
				testId: "t1",
				part: "p1",
				type: "tfng",
				title: "Passage 1",
				band: "6.5",
				source: "",
				intro: "",
				passage: "<p>Đoạn văn</p>",
				transcript: "",
				imageUrl: "",
				questions: [
					{
						stem: "Câu 1",
						opts: null,
						answer: "True",
						alts: "",
						type: null,
						pin: null,
					},
				],
				optionBank: [],
				note: "",
				audio: null,
				updatedAt: "2026-10-02T00:00:00.000Z",
			},
		],
	};

	it("PATCH header → trả LibraryTestDetail", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, detail));
		const result = await updateLibraryTest("t1", { title: "Đổi tên" });
		expect(result.parts).toHaveLength(1);
		const { init } = callOf(0);
		expect(init.method).toBe("PATCH");
		expect(bodyJson(init)).toEqual({ title: "Đổi tên" });
	});

	it("PATCH status ready → body {status:'ready'}", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, detail));
		await setLibraryTestStatus("t1", "ready");
		const { init } = callOf(0);
		expect(bodyJson(init)).toEqual({ status: "ready" });
	});

	it("400 NOT_READY → LibraryHttpError mang issues", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(400, {
				error: "NOT_READY",
				code: "NOT_READY",
				issues: [{ path: "parts.s1.audio", message: "audio required" }],
			}),
		);
		const error: unknown = await setLibraryTestStatus("t1", "ready").catch(
			(e) => e,
		);
		expect(isLibraryHttpError(error)).toBe(true);
		expect(libraryIssuesOf(error)).toEqual([
			{ path: "parts.s1.audio", message: "audio required" },
		]);
	});
});

describe("upsertLibraryPart / delete", () => {
	const partDto = {
		id: "p1",
		testId: "t1",
		part: "p1",
		type: "tfng",
		title: "Passage 1",
		band: "6.5",
		source: "",
		intro: "",
		passage: "<p>Đoạn văn</p>",
		transcript: "",
		imageUrl: "",
		questions: [
			{
				stem: "Câu 1",
				opts: null,
				answer: "True",
				alts: "",
				type: null,
				pin: null,
			},
		],
		optionBank: [],
		note: "",
		audio: null,
		updatedAt: "2026-10-02T00:00:00.000Z",
	};

	it("PUT part: body có part khớp URL, bơm default, trả DTO trong wrapper {part}", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { part: partDto }));
		const saved = await upsertLibraryPart("t1", "p1", {
			type: "tfng",
			title: "Passage 1",
			band: "6.5",
			source: "",
			intro: "",
			passage: "<p>Đoạn văn</p>",
			transcript: "",
			imageUrl: "",
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
			],
			optionBank: [],
			note: "",
		});
		expect(saved.part).toBe("p1");
		const { url, init } = callOf(0);
		expect(url).toBe(`${BASE}/api/admin/library/tests/t1/parts/p1`);
		expect(init.method).toBe("PUT");
		const body = bodyJson(init);
		expect(body.part).toBe("p1");
		expect(body.imageUrl).toBe("");
		expect(body.audioName).toBe("");
	});

	it("PUT part: bắn 't 1' → 't1' (trim trước khi gửi)", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { part: partDto }));
		await upsertLibraryPart("t1", "p1", {
			type: "tfng",
			title: "Passage 1",
			band: "6.5",
			source: "",
			intro: "",
			passage: "p",
			transcript: "",
			imageUrl: "",
			questions: [
				{
					stem: "Câu 1",
					opts: null,
					answer: "True",
					alts: "",
					type: null,
					pin: null,
				},
			],
			optionBank: [],
			note: "",
		});
		const { init } = callOf(0);
		expect(bodyJson(init).passage).toBe("p");
	});

	it("DELETE part/test/audio gọi đúng path", async () => {
		fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
		await deleteLibraryPart("t1", "p1");
		await deleteLibraryTest("t1");
		await deleteLibraryAudio("t1", "p1");
		expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
			`${BASE}/api/admin/library/tests/t1/parts/p1`,
			`${BASE}/api/admin/library/tests/t1`,
			`${BASE}/api/admin/library/tests/t1/parts/p1/audio`,
		]);
	});
});

describe("getLibraryTest", () => {
	it("GET detail theo id", async () => {
		fetchMock.mockResolvedValue(
			jsonResponse(200, {
				...detailHeader,
				parts: [],
			}),
		);
		const detail = await getLibraryTest("t-9");
		expect(detail.parts).toEqual([]);
		expect(fetchMock.mock.calls[0]?.[0]).toBe(
			`${BASE}/api/admin/library/tests/t-9`,
		);
	});
});

/** XHR giả — chỉ mô phỏng sự kiện upload mà repo đăng ký. */
class FakeXhr {
	static instances: FakeXhr[] = [];
	upload: { onprogress?: (event: ProgressEvent) => void } = {};
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onabort: (() => void) | null = null;
	status = 0;
	responseText = "";
	withCredentials = false;
	headers: Record<string, string> = {};
	url = "";
	method = "";
	body: unknown = null;

	constructor() {
		FakeXhr.instances.push(this);
	}

	open(method: string, url: string) {
		this.method = method;
		this.url = url;
	}

	setRequestHeader(name: string, value: string) {
		this.headers[name] = value;
	}

	send(body: unknown) {
		this.body = body;
	}

	/** Kích hoạt tiến trình upload rồi trả response. */
	respond(status: number, body: unknown, fractionBeforeLoad = 1) {
		this.upload.onprogress?.({
			lengthComputable: true,
			loaded: fractionBeforeLoad,
			total: 1,
		} as ProgressEvent);
		this.status = status;
		this.responseText = JSON.stringify(body);
		this.onload?.();
	}

	abort() {
		this.onabort?.();
	}

	fail() {
		this.onerror?.();
	}
}

describe("uploadLibraryAudio (XMLHttpRequest)", () => {
	beforeEach(() => {
		FakeXhr.instances = [];
		vi.stubGlobal("XMLHttpRequest", FakeXhr);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const audio = {
		name: "section1.mp3",
		type: "audio/mpeg",
		size: 1024,
		uploadedAt: "2026-10-02T00:00:00.000Z",
	};
	const file = new File(["audio"], "section1.mp3", { type: "audio/mpeg" });

	it("PUT raw với X-File-Name encoded + credentials, trả {audio}", async () => {
		const promise = uploadLibraryAudio({
			testId: "t1",
			slot: "s1",
			file,
			type: "audio/mpeg",
		});
		const xhr = FakeXhr.instances[0];
		expect(xhr.url).toBe(libraryAudioUrl("t1", "s1"));
		expect(xhr.method).toBe("PUT");
		expect(xhr.withCredentials).toBe(true);
		expect(xhr.headers["Content-Type"]).toBe("audio/mpeg");
		expect(xhr.headers["X-File-Name"]).toBe("section1.mp3");
		xhr.respond(200, { audio });
		await expect(promise).resolves.toEqual(audio);
	});

	it("báo tiến trình qua onProgress", async () => {
		const onProgress = vi.fn();
		const promise = uploadLibraryAudio({
			testId: "t1",
			slot: "s1",
			file,
			type: "audio/mpeg",
			onProgress,
		});
		FakeXhr.instances[0]?.respond(200, { audio }, 0.5);
		await promise;
		expect(onProgress).toHaveBeenCalledWith(0.5);
	});

	it("413 AUDIO_TOO_LARGE → LibraryHttpError mang code", async () => {
		const promise = uploadLibraryAudio({
			testId: "t1",
			slot: "s1",
			file,
			type: "audio/mpeg",
		});
		FakeXhr.instances[0]?.respond(413, {
			error: "AUDIO_TOO_LARGE",
			code: "AUDIO_TOO_LARGE",
		});
		const error: unknown = await promise.catch((e) => e);
		expect(isLibraryHttpError(error)).toBe(true);
		expect((error as { code?: string }).code).toBe("AUDIO_TOO_LARGE");
	});

	it("signal đã abort → từ chối ngay, không tạo XHR", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			uploadLibraryAudio({
				testId: "t1",
				slot: "s1",
				file,
				type: "audio/mpeg",
				signal: controller.signal,
			}),
		).rejects.toMatchObject({ name: "AbortError" });
		expect(FakeXhr.instances).toHaveLength(0);
	});

	it("xhr.abort() qua signal → AbortError", async () => {
		const controller = new AbortController();
		const promise = uploadLibraryAudio({
			testId: "t1",
			slot: "s1",
			file,
			type: "audio/mpeg",
			signal: controller.signal,
		});
		controller.abort();
		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
	});

	it("lỗi mạng → HttpError status 0", async () => {
		const promise = uploadLibraryAudio({
			testId: "t1",
			slot: "s1",
			file,
			type: "audio/mpeg",
		});
		FakeXhr.instances[0]?.fail();
		const error: unknown = await promise.catch((e) => e);
		expect((error as { status?: number }).status).toBe(0);
	});
});
