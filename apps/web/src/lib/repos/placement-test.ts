import { queryOptions } from "@tanstack/react-query";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import type {
	PlacementContent,
	PlacementPublishIssue,
	PlacementTeacherStateResponse,
} from "@teacher-os/api/placement-test-contracts";
import { HttpError } from "@/lib/kernel-load-state";
import { getApiBaseUrl } from "./api-base-url";

export class PlacementHttpError extends HttpError {
	readonly code?: string;
	readonly issues?: PlacementPublishIssue[];

	constructor(
		status: number,
		message: string,
		extra?: { code?: string; issues?: PlacementPublishIssue[] },
	) {
		super(status, message);
		this.name = "PlacementHttpError";
		this.code = extra?.code;
		this.issues = extra?.issues;
	}
}

export function isPlacementHttpError(err: unknown): err is PlacementHttpError {
	return err instanceof PlacementHttpError;
}

async function parseErrorExtra(res: Response): Promise<{
	code?: string;
	issues?: PlacementPublishIssue[];
}> {
	try {
		const body = (await res.json()) as {
			code?: unknown;
			error?: unknown;
			issues?: unknown;
		};
		const code =
			typeof body?.code === "string"
				? body.code
				: typeof body?.error === "string"
					? body.error
					: undefined;
		const issues = Array.isArray(body?.issues)
			? (body.issues.filter((item): item is PlacementPublishIssue =>
					Boolean(
						item &&
							typeof item === "object" &&
							typeof (item as PlacementPublishIssue).path === "string" &&
							typeof (item as PlacementPublishIssue).message === "string",
					),
				) as PlacementPublishIssue[])
			: undefined;
		return { code, issues };
	} catch {
		return {};
	}
}

export const placementTestQueryKey = ["kernel", "placement-test"] as const;

export async function fetchPlacementTest(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<PlacementTeacherStateResponse> {
	const res = await fetch(`${baseUrl}/api/placement-test`, {
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		const extra = await parseErrorExtra(res);
		throw new PlacementHttpError(
			res.status,
			`Không thể tải bộ đề kiểm tra đầu vào (${res.status})`,
			extra,
		);
	}
	return (await res.json()) as PlacementTeacherStateResponse;
}

export function placementTestQueryOptions() {
	return queryOptions({
		queryKey: placementTestQueryKey,
		queryFn: ({ signal }) => fetchPlacementTest(undefined, signal),
	});
}

export async function saveDraft(
	revision: number,
	content: PlacementContent,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ revision: number; dirty: boolean }> {
	const res = await fetch(`${baseUrl}/api/placement-test/draft`, {
		method: "PUT",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ revision, content }),
	});
	if (!res.ok) {
		const extra = await parseErrorExtra(res);
		throw new PlacementHttpError(
			res.status,
			`Lưu nháp thất bại (${res.status})`,
			extra,
		);
	}
	return (await res.json()) as { revision: number; dirty: boolean };
}

export interface UploadedPlacementAudio {
	audioId: string;
	name: string;
	size: number;
	type: string;
}

/**
 * Upload audio bằng XMLHttpRequest (D10, Phase 3 bước 2) để có tiến trình
 * upload như `uploadLibraryAudio` của admin.
 */
export function uploadAudio(opts: {
	file: File | Blob;
	fileName?: string;
	type: string;
	onProgress?: (fraction: number) => void;
	signal?: AbortSignal;
	baseUrl?: string;
}): Promise<UploadedPlacementAudio> {
	if (opts.signal?.aborted) {
		return Promise.reject(new DOMException("Upload aborted", "AbortError"));
	}
	const baseUrl = opts.baseUrl ?? getApiBaseUrl();
	const rawName =
		opts.fileName ?? (opts.file instanceof File ? opts.file.name : "audio.mp3");

	const { promise, resolve, reject } =
		Promise.withResolvers<UploadedPlacementAudio>();
	const xhr = new XMLHttpRequest();
	xhr.open("PUT", `${baseUrl}/api/placement-test/audio`);
	xhr.withCredentials = true;
	xhr.setRequestHeader("Content-Type", opts.type);
	xhr.setRequestHeader("X-File-Name", encodeURIComponent(rawName));
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
		let parsed: Record<string, unknown> | null = null;
		try {
			parsed = JSON.parse(xhr.responseText) as Record<string, unknown>;
		} catch {
			parsed = null;
		}
		if (xhr.status >= 200 && xhr.status < 300 && parsed) {
			if (
				typeof parsed.audioId === "string" &&
				typeof parsed.name === "string" &&
				typeof parsed.size === "number" &&
				typeof parsed.type === "string"
			) {
				resolve({
					audioId: parsed.audioId,
					name: parsed.name,
					size: parsed.size,
					type: parsed.type,
				});
				return;
			}
		}
		const code =
			typeof parsed?.code === "string"
				? parsed.code
				: typeof parsed?.error === "string"
					? parsed.error
					: undefined;
		reject(
			new PlacementHttpError(
				xhr.status,
				`Tải audio lên thất bại (HTTP ${xhr.status}).`,
				{ code },
			),
		);
	};
	xhr.onerror = () => {
		cleanup();
		reject(new PlacementHttpError(0, "Lỗi mạng khi tải audio lên."));
	};
	xhr.onabort = () => {
		cleanup();
		reject(new DOMException("Upload aborted", "AbortError"));
	};
	xhr.send(opts.file);
	return promise;
}

/**
 * Tải audio nháp của giáo viên thành `blob:` URL (D14, Phase 3 bước 2).
 * Kiểm `Content-Type` thuộc `LIBRARY_AUDIO_MIME` và ép lại `Blob` với đúng
 * MIME đã kiểm trước khi gọi `URL.createObjectURL` như `lib/repos/grading.ts`.
 */
export async function fetchAudioBlobUrl(
	audioId: string,
	signal?: AbortSignal,
	baseUrl: string = getApiBaseUrl(),
): Promise<string> {
	const res = await fetch(
		`${baseUrl}/api/placement-test/audio/${encodeURIComponent(audioId)}`,
		{
			method: "GET",
			credentials: "include",
			headers: { Accept: "*/*" },
			signal,
		},
	);
	if (!res.ok) {
		throw new PlacementHttpError(
			res.status,
			`Không thể tải audio nghe thử (${res.status})`,
		);
	}
	const type = normalizeMediaType(res.headers.get("Content-Type") ?? "");
	if (!Object.hasOwn(LIBRARY_AUDIO_MIME, type)) {
		throw new PlacementHttpError(res.status, "Định dạng audio không hợp lệ.");
	}
	const blob = new Blob([await res.blob()], { type });
	return URL.createObjectURL(blob);
}

export async function publishPlacementTest(
	revision: number,
	baseUrl: string = getApiBaseUrl(),
): Promise<{
	publishedVersion: number;
	publishedAt: string;
	revision: number;
	dirty: boolean;
}> {
	const res = await fetch(`${baseUrl}/api/placement-test/publish`, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ revision }),
	});
	if (!res.ok) {
		const extra = await parseErrorExtra(res);
		throw new PlacementHttpError(
			res.status,
			`Phát hành thất bại (${res.status})`,
			extra,
		);
	}
	return (await res.json()) as {
		publishedVersion: number;
		publishedAt: string;
		revision: number;
		dirty: boolean;
	};
}
