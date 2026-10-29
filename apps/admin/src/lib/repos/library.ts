import { queryOptions } from "@tanstack/react-query";
import {
	type LibraryPartAudio,
	type LibraryPartDto,
	type LibraryPartIssue,
	type LibraryTestCreate,
	type LibraryTestDetail,
	type LibraryTestListItem,
	type LibraryTestUpdate,
	libraryPartDtoSchema,
	libraryPartUpsertSchema,
	libraryTestCreateSchema,
	libraryTestDetailSchema,
	libraryTestListItemSchema,
	libraryTestUpdateSchema,
} from "@teacher-os/api/library-contracts";
import { env } from "@teacher-os/env/web";
import { z } from "zod";
import { getServerUrl } from "@/lib/auth-client";
import { HttpError } from "@/lib/query-client";

/**
 * Repo thư viện bộ đề (phase 6) — toàn bộ truy cập `/api/admin/library/*`
 * của UI gom về đây: fetch + zod parse DTO ở biên mạng + query options.
 * Component không gọi fetch trực tiếp; test mock fetch ở biên này.
 *
 * Không đi qua `apiJson` (`lib/api.ts`): publish 400 `NOT_READY` trả kèm
 * `issues` trong body mà `HttpError` của apiJson không giữ — cần lớp lỗi
 * riêng để UI render danh sách lý do. Semantics fetch giữ nguyên
 * (cookie session, `credentials: include`).
 */

const TESTS_PATH = "/api/admin/library/tests";

export class LibraryHttpError extends HttpError {
	/** Lý do chặn ready (400 NOT_READY) theo `LibraryPartIssue` của contract. */
	readonly issues?: LibraryPartIssue[];

	constructor(
		status: number,
		message: string,
		options?: { code?: string; issues?: LibraryPartIssue[] },
	) {
		super(status, message, { code: options?.code });
		this.issues = options?.issues;
	}
}

export function isLibraryHttpError(error: unknown): error is LibraryHttpError {
	return error instanceof LibraryHttpError;
}

/** Lý do chặn ready từ mọi error (null nếu không phải lỗi có issues). */
export function libraryIssuesOf(error: unknown): LibraryPartIssue[] | null {
	return isLibraryHttpError(error) ? (error.issues ?? null) : null;
}

const enc = encodeURIComponent;

/**
 * Wire shape audio trên response upload — `libraryPartAudioSchema` không
 * được export từ contract (chỉ có type), nên nhân bản strict 4 field tại
 * biên này. Nếu contract đổi, test parse ở dưới sẽ bắn.
 */
const audioWireSchema = z
	.object({
		name: z.string(),
		type: z.string(),
		size: z.number().int().min(0),
		uploadedAt: z.string(),
	})
	.strict();

/** `{code, issues}` trong error body — thu hẹp bằng `in`/`typeof`, không cast mù. */
function errorRecord(body: unknown): {
	code?: string;
	issues?: LibraryPartIssue[];
} {
	if (!body || typeof body !== "object") return {};
	const code =
		"code" in body && typeof body.code === "string" ? body.code : undefined;
	const issues =
		"issues" in body && Array.isArray(body.issues) ? body.issues : undefined;
	return { code, issues };
}

/** URL tuyệt đối của một path API thư viện (dùng cho `<audio src>`). */
export function libraryApiUrl(path: string): string {
	return `${getServerUrl(env.VITE_SERVER_URL)}${path}`;
}

export function libraryAudioUrl(testId: string, slot: string): string {
	return libraryApiUrl(`${TESTS_PATH}/${enc(testId)}/parts/${enc(slot)}/audio`);
}

async function libraryRequest<T>(
	path: string,
	init: RequestInit & { json?: unknown } = {},
): Promise<T> {
	const { json, ...rest } = init;
	let res: Response;
	try {
		res = await fetch(`${getServerUrl(env.VITE_SERVER_URL)}${path}`, {
			credentials: "include",
			...rest,
			headers: {
				accept: "application/json",
				// POST/PATCH/PUT(part) bắt buộc JSON content-type (CSRF guard);
				// request không body không set để không tố cáo nhầm.
				...(json !== undefined ? { "content-type": "application/json" } : {}),
				...(rest.headers ?? {}),
			},
			body: json !== undefined ? JSON.stringify(json) : rest.body,
		});
	} catch {
		throw new HttpError(0, `Lỗi mạng khi gọi ${path}`);
	}
	if (!res.ok) {
		const body: unknown = await res.json().catch(() => null);
		const { code, issues } = errorRecord(body);
		throw new LibraryHttpError(res.status, `API ${res.status} ${path}`, {
			code,
			issues,
		});
	}
	return (await res.json()) as T;
}

/** Danh sách đề, sắp `updatedAt` giảm dần phía server. */
export async function listLibraryTests(): Promise<LibraryTestListItem[]> {
	const data = await libraryRequest<unknown>(TESTS_PATH);
	// Server trả `{tests: [...]}` (route admin-library.ts), không phải array.
	const parsed = z
		.object({ tests: z.array(libraryTestListItemSchema) })
		.parse(data);
	return parsed.tests;
}

export async function getLibraryTest(
	testId: string,
): Promise<LibraryTestDetail> {
	const data = await libraryRequest<unknown>(`${TESTS_PATH}/${enc(testId)}`);
	return libraryTestDetailSchema.parse(data);
}

/** Tạo đề (luôn draft) → `{id}` để điều hướng sang trang edit. */
export async function createLibraryTest(
	input: LibraryTestCreate,
): Promise<{ id: string }> {
	const data = await libraryRequest<unknown>(TESTS_PATH, {
		method: "POST",
		json: libraryTestCreateSchema.parse(input),
	});
	return z.object({ id: z.string() }).parse(data);
}

/** PATCH metadata header — `skill` immutable, không nằm trong schema. */
export async function updateLibraryTest(
	testId: string,
	patch: LibraryTestUpdate,
): Promise<LibraryTestDetail> {
	const data = await libraryRequest<unknown>(`${TESTS_PATH}/${enc(testId)}`, {
		method: "PATCH",
		json: libraryTestUpdateSchema.parse(patch),
	});
	return libraryTestDetailSchema.parse(data);
}

/** Chuyển draft↔ready — cùng PATCH, server chạy `validateTestReady`. */
export async function setLibraryTestStatus(
	testId: string,
	status: "draft" | "ready",
): Promise<LibraryTestDetail> {
	const data = await libraryRequest<unknown>(`${TESTS_PATH}/${enc(testId)}`, {
		method: "PATCH",
		json: { status },
	});
	return libraryTestDetailSchema.parse(data);
}

export async function deleteLibraryTest(testId: string): Promise<void> {
	await libraryRequest<unknown>(`${TESTS_PATH}/${enc(testId)}`, {
		method: "DELETE",
	});
}

/**
 * Upsert một slot part. Body bắt buộc kèm `part` khớp param URL; server
 * bỏ qua `audioName` client gửi (audio chỉ đổi qua endpoint upload) nên
 * vẫn parse schema đầy đủ cho rule zod rồi gửi nguyên.
 */
export async function upsertLibraryPart(
	testId: string,
	slot: string,
	input: Omit<z.input<typeof libraryPartUpsertSchema>, "part">,
): Promise<LibraryPartDto> {
	const body = libraryPartUpsertSchema.parse({ ...input, part: slot });
	const data = await libraryRequest<{ part: unknown }>(
		`${TESTS_PATH}/${enc(testId)}/parts/${enc(slot)}`,
		{ method: "PUT", json: body },
	);
	return libraryPartDtoSchema.parse(data.part);
}

export async function deleteLibraryPart(
	testId: string,
	slot: string,
): Promise<void> {
	await libraryRequest<unknown>(
		`${TESTS_PATH}/${enc(testId)}/parts/${enc(slot)}`,
		{ method: "DELETE" },
	);
}

/**
 * Upload audio raw bằng XMLHttpRequest thay vì fetch: fetch không báo tiến
 * trình upload (duplex streaming chưa khả dụng rộng); student Speaking
 * (`apps/student/src/lib/repos/quiz.ts`) đã chọn XHR vì cùng lý do.
 * Server bắt buộc Content-Type ∈ allowlist + `X-File-Name` encoded.
 */
export function uploadLibraryAudio(opts: {
	testId: string;
	slot: string;
	file: File;
	type: string;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
}): Promise<LibraryPartAudio> {
	if (opts.signal?.aborted) {
		return Promise.reject(new DOMException("Upload aborted", "AbortError"));
	}
	const { promise, resolve, reject } =
		Promise.withResolvers<LibraryPartAudio>();
	const xhr = new XMLHttpRequest();
	xhr.open("PUT", libraryAudioUrl(opts.testId, opts.slot));
	xhr.withCredentials = true;
	xhr.setRequestHeader("Content-Type", opts.type);
	xhr.setRequestHeader("X-File-Name", encodeURIComponent(opts.file.name));
	xhr.upload.onprogress = (event) => {
		if (event.lengthComputable && event.total > 0) {
			opts.onProgress?.(event.loaded / event.total);
		}
	};
	const onAbort = () => xhr.abort();
	opts.signal?.addEventListener("abort", onAbort, { once: true });
	const cleanup = () => opts.signal?.removeEventListener("abort", onAbort);
	xhr.onload = () => {
		cleanup();
		let body: unknown = null;
		try {
			body = JSON.parse(xhr.responseText);
		} catch {
			body = null;
		}
		if (xhr.status >= 200 && xhr.status < 300) {
			const audio =
				body && typeof body === "object" && "audio" in body
					? body.audio
					: undefined;
			const parsed = audioWireSchema.safeParse(audio);
			if (parsed.success) {
				resolve(parsed.data);
			} else {
				reject(
					new LibraryHttpError(
						xhr.status,
						"Phản hồi tải audio lên không hợp lệ.",
					),
				);
			}
			return;
		}
		const { code, issues } = errorRecord(body);
		reject(
			new LibraryHttpError(
				xhr.status,
				`Tải audio lên thất bại (HTTP ${xhr.status}).`,
				{ code, issues },
			),
		);
	};
	xhr.onerror = () => {
		cleanup();
		reject(new HttpError(0, "Lỗi mạng khi tải audio lên."));
	};
	xhr.onabort = () => {
		cleanup();
		reject(new DOMException("Upload aborted", "AbortError"));
	};
	xhr.send(opts.file);
	return promise;
}

export async function deleteLibraryAudio(
	testId: string,
	slot: string,
): Promise<void> {
	await libraryRequest<unknown>(
		`${TESTS_PATH}/${enc(testId)}/parts/${enc(slot)}/audio`,
		{ method: "DELETE" },
	);
}

/** Query list — không truyền filter: UI lọc phía client để có số đếm chip. */
export const libraryTestsQueryOptions = () =>
	queryOptions({
		queryKey: ["admin", "library", "tests"],
		queryFn: listLibraryTests,
	});

export const libraryTestQueryOptions = (testId: string) =>
	queryOptions({
		queryKey: ["admin", "library", "test", testId],
		queryFn: () => getLibraryTest(testId),
	});
