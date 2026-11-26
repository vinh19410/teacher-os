import { ZOOM_ERROR_CODES } from "@teacher-os/api/contracts";

export type FetchFn = typeof fetch;

export class ZoomIntegrationError extends Error {
	readonly code: (typeof ZOOM_ERROR_CODES)[keyof typeof ZOOM_ERROR_CODES];
	readonly status: number;

	constructor(
		code: (typeof ZOOM_ERROR_CODES)[keyof typeof ZOOM_ERROR_CODES],
		message: string,
		status: number,
	) {
		super(message);
		this.name = "ZoomIntegrationError";
		this.code = code;
		this.status = status;
	}
}

export interface ZoomMeetingInput {
	topic: string;
	agenda: string;
	dateISO: string;
	time: string;
	durMinutes: number;
}

export interface ZoomMeetingResult {
	meetingId: string;
	joinUrl: string;
}

export interface ZoomRecordingVideoFile {
	id: string;
	downloadUrl: string;
	fileSize?: number;
	recordingType?: string;
	mimeType: string;
}

export interface ZoomRecordingDownloadResult {
	body: ReadableStream<Uint8Array>;
	contentType: string;
	contentLength?: number;
}

export type ZoomRecordingResult =
	| {
			status: "ready";
			shareUrl: string;
			password: string | null;
			primaryFile: ZoomRecordingVideoFile | null;
	  }
	| { status: "pending" }
	| { status: "missing" };

export interface ZoomClient {
	createMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingResult>;
	updateMeeting(meetingId: string, input: ZoomMeetingInput): Promise<void>;
	deleteMeeting(meetingId: string): Promise<void>;
	getRecording(meetingId: string): Promise<ZoomRecordingResult>;
	downloadRecordingFile?(
		downloadUrl: string,
	): Promise<ZoomRecordingDownloadResult>;
	trashRecording?(meetingId: string): Promise<void>;
}

export type FullZoomClient = Required<ZoomClient>;

export interface ZoomConfig {
	accountId?: string;
	clientId?: string;
	clientSecret?: string;
	hostUser?: string;
}

export function isZoomConfigured(cfg: ZoomConfig | undefined): boolean {
	return Boolean(cfg?.accountId && cfg.clientId && cfg.clientSecret);
}

const TOKEN_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";
const TOKEN_SKEW_MS = 60_000;
const MAX_DOWNLOAD_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const RECORDING_TYPE_PRIORITY: Record<string, number> = {
	shared_screen_with_speaker_view: 0,
	shared_screen_with_gallery_view: 1,
	active_speaker: 2,
	gallery_view: 3,
	shared_screen: 4,
};

interface RawZoomRecordingFile {
	id?: string;
	status?: string;
	file_type?: string;
	file_extension?: string;
	file_size?: number;
	download_url?: string;
	recording_type?: string;
}

function isZoomHostname(hostname: string): boolean {
	const lower = hostname.toLowerCase();
	return lower === "zoom.us" || lower.endsWith(".zoom.us");
}

function selectPrimaryMp4File(
	files: RawZoomRecordingFile[],
): ZoomRecordingVideoFile | null {
	const candidates: Array<{
		file: ZoomRecordingVideoFile;
		priority: number;
		size: number;
	}> = [];

	for (const f of files) {
		if ((f.status ?? "").toLowerCase() !== "completed") continue;
		const isMp4 =
			(f.file_type ?? "").toUpperCase() === "MP4" ||
			(f.file_extension ?? "").toUpperCase() === "MP4";
		if (!isMp4) continue;
		const downloadUrl =
			typeof f.download_url === "string" ? f.download_url.trim() : "";
		if (!downloadUrl) continue;

		const rawType = (f.recording_type ?? "").trim();
		const priority = RECORDING_TYPE_PRIORITY[rawType.toLowerCase()] ?? 5;
		const size =
			typeof f.file_size === "number" &&
			Number.isFinite(f.file_size) &&
			f.file_size > 0
				? f.file_size
				: 0;

		candidates.push({
			priority,
			size,
			file: {
				id: typeof f.id === "string" ? f.id : "",
				downloadUrl,
				...(size > 0 ? { fileSize: size } : {}),
				...(rawType ? { recordingType: rawType } : {}),
				mimeType: "video/mp4",
			},
		});
	}

	if (candidates.length === 0) return null;
	candidates.sort((a, b) => a.priority - b.priority || b.size - a.size);
	return candidates[0]?.file ?? null;
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function readErrorMessage(res: Response, text: string): Promise<string> {
	try {
		const parsed = JSON.parse(text) as { message?: unknown };
		if (typeof parsed.message === "string" && parsed.message) {
			return parsed.message;
		}
	} catch {
		// body không phải JSON
	}
	return text.slice(0, 200) || res.statusText;
}

export function createZoomClient(
	cfg: ZoomConfig,
	fetchFn: FetchFn = fetch,
): FullZoomClient {
	if (!isZoomConfigured(cfg)) {
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.NOT_CONFIGURED,
			"Chưa cấu hình Zoom (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET).",
			503,
		);
	}
	const accountId = cfg.accountId as string;
	const clientId = cfg.clientId as string;
	const clientSecret = cfg.clientSecret as string;
	const hostUser = encodeURIComponent(cfg.hostUser || "me");
	const cacheKey = `${accountId}:${clientId}`;

	async function getToken(): Promise<string> {
		const cached = tokenCache.get(cacheKey);
		if (cached && cached.expiresAt - TOKEN_SKEW_MS > Date.now()) {
			return cached.token;
		}
		const url = `${TOKEN_URL}?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;
		const res = await fetchFn(url, {
			method: "POST",
			headers: {
				Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
			},
		});
		if (!res.ok) {
			const msg = await readErrorMessage(res, await res.text());
			throw new ZoomIntegrationError(
				ZOOM_ERROR_CODES.API_ERROR,
				`Zoom API lỗi ${res.status}: ${msg}`,
				502,
			);
		}
		const body = (await res.json()) as {
			access_token?: string;
			expires_in?: number;
		};
		if (!body.access_token) {
			throw new ZoomIntegrationError(
				ZOOM_ERROR_CODES.API_ERROR,
				"Zoom API lỗi: phản hồi token không hợp lệ.",
				502,
			);
		}
		tokenCache.set(cacheKey, {
			token: body.access_token,
			expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
		});
		return body.access_token;
	}

	async function send(path: string, init: RequestInit): Promise<Response> {
		const token = await getToken();
		return fetchFn(`${API_BASE}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
		});
	}

	// Trả về Response; 404 do caller tự xử lý, các lỗi khác ném ở đây.
	async function zoomFetch(
		path: string,
		init: RequestInit,
		allow404 = false,
	): Promise<Response> {
		let res = await send(path, init);
		if (res.status === 401) {
			tokenCache.delete(cacheKey);
			res = await send(path, init);
		}
		if (res.ok || (allow404 && res.status === 404)) return res;
		const text = await res.text();
		if (res.status === 429) {
			if (/daily/i.test(text)) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.RATE_LIMITED,
					"Zoom đã chạm giới hạn 100 lần tạo/sửa meeting trong ngày. Thử lại sau 07:00 sáng (giờ VN).",
					429,
				);
			}
			throw new ZoomIntegrationError(
				ZOOM_ERROR_CODES.RATE_LIMITED,
				"Zoom đang giới hạn tần suất gọi API, thử lại sau ít phút.",
				429,
			);
		}
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
			`Zoom API lỗi ${res.status}: ${await readErrorMessage(res, text)}`,
			502,
		);
	}

	function meetingBody(input: ZoomMeetingInput) {
		return JSON.stringify({
			topic: input.topic.slice(0, 200),
			agenda: input.agenda,
			type: 2,
			start_time: `${input.dateISO}T${input.time}:00`,
			timezone: "Asia/Ho_Chi_Minh",
			duration: input.durMinutes,
			settings: {
				auto_recording: "cloud",
				join_before_host: true,
				jbh_time: 0,
				waiting_room: false,
				meeting_authentication: false,
			},
		});
	}

	return {
		async createMeeting(input) {
			const res = await zoomFetch(`/users/${hostUser}/meetings`, {
				method: "POST",
				body: meetingBody(input),
			});
			const body = (await res.json()) as { id: number; join_url: string };
			return { meetingId: String(body.id), joinUrl: body.join_url };
		},
		async updateMeeting(meetingId, input) {
			await zoomFetch(`/meetings/${encodeURIComponent(meetingId)}`, {
				method: "PATCH",
				body: meetingBody(input),
			});
		},
		async deleteMeeting(meetingId) {
			await zoomFetch(
				`/meetings/${encodeURIComponent(meetingId)}`,
				{ method: "DELETE" },
				true,
			);
		},
		async getRecording(meetingId) {
			const res = await zoomFetch(
				`/meetings/${encodeURIComponent(meetingId)}/recordings`,
				{ method: "GET" },
				true,
			);
			if (res.status === 404) return { status: "missing" };
			const body = (await res.json()) as {
				share_url?: string;
				password?: string;
				recording_files?: RawZoomRecordingFile[];
			};
			const files = body.recording_files ?? [];
			const primaryFile = selectPrimaryMp4File(files);
			const hasProcessing = files.some(
				(f) => (f.status ?? "").toLowerCase() === "processing",
			);
			const hasCompletedAny = files.some(
				(f) => (f.status ?? "").toLowerCase() === "completed",
			);

			// Chưa có MP4 hoàn tất nhưng Zoom vẫn đang xử lý file khác (vd M4A xong trước MP4) → chờ tiếp.
			if (!primaryFile && hasProcessing) {
				return { status: "pending" };
			}
			if (
				primaryFile ||
				(hasCompletedAny && !hasProcessing && body.share_url)
			) {
				return {
					status: "ready",
					shareUrl: body.share_url ?? "",
					password: body.password || null,
					primaryFile,
				};
			}
			return { status: "pending" };
		},
		async downloadRecordingFile(downloadUrl) {
			let currentUrl: URL;
			try {
				currentUrl = new URL(downloadUrl);
			} catch {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"URL tải recording Zoom không hợp lệ.",
					502,
				);
			}
			if (
				currentUrl.protocol !== "https:" ||
				!isZoomHostname(currentUrl.hostname)
			) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"URL tải recording không thuộc miền zoom.us hợp lệ.",
					502,
				);
			}

			let retried401 = false;
			let finalRes: Response | null = null;

			for (let hop = 0; hop <= MAX_DOWNLOAD_REDIRECTS; ) {
				const onZoomHost = isZoomHostname(currentUrl.hostname);
				const headers: Record<string, string> = {};
				if (onZoomHost) {
					headers.Authorization = `Bearer ${await getToken()}`;
				}
				const res = await fetchFn(currentUrl.toString(), {
					method: "GET",
					redirect: "manual",
					headers,
				});

				if (res.status === 401 && hop === 0 && onZoomHost && !retried401) {
					await res.body?.cancel().catch(() => {});
					tokenCache.delete(cacheKey);
					retried401 = true;
					continue;
				}

				if (REDIRECT_STATUSES.has(res.status)) {
					await res.body?.cancel().catch(() => {});
					if (hop >= MAX_DOWNLOAD_REDIRECTS) {
						throw new ZoomIntegrationError(
							ZOOM_ERROR_CODES.API_ERROR,
							"Zoom chuyển hướng tải recording quá số lần cho phép.",
							502,
						);
					}
					const location = res.headers.get("location")?.trim();
					if (!location) {
						throw new ZoomIntegrationError(
							ZOOM_ERROR_CODES.API_ERROR,
							"Phản hồi chuyển hướng tải recording từ Zoom thiếu Location.",
							502,
						);
					}
					let nextUrl: URL;
					try {
						nextUrl = new URL(location, currentUrl);
					} catch {
						throw new ZoomIntegrationError(
							ZOOM_ERROR_CODES.API_ERROR,
							"URL chuyển hướng tải recording từ Zoom không hợp lệ.",
							502,
						);
					}
					if (nextUrl.protocol !== "https:") {
						throw new ZoomIntegrationError(
							ZOOM_ERROR_CODES.API_ERROR,
							"Từ chối chuyển hướng tải recording không dùng HTTPS.",
							502,
						);
					}
					currentUrl = nextUrl;
					hop += 1;
					continue;
				}

				finalRes = res;
				break;
			}

			if (!finalRes) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"Không nhận được phản hồi tải recording từ Zoom.",
					502,
				);
			}

			if (!finalRes.ok) {
				const text = await finalRes.text().catch(() => "");
				if (finalRes.status === 429) {
					throw new ZoomIntegrationError(
						ZOOM_ERROR_CODES.RATE_LIMITED,
						"Zoom đang giới hạn tần suất tải recording, thử lại sau ít phút.",
						429,
					);
				}
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					`Tải recording từ Zoom lỗi ${finalRes.status}: ${await readErrorMessage(finalRes, text)}`,
					502,
				);
			}

			const rawContentType = (
				finalRes.headers.get("content-type") ?? ""
			).trim();
			const baseMediaType =
				rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
			if (
				baseMediaType.startsWith("text/html") ||
				baseMediaType.startsWith("application/json") ||
				baseMediaType.endsWith("+json")
			) {
				await finalRes.body?.cancel().catch(() => {});
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					`Zoom trả về ${baseMediaType} thay vì file video MP4 (kiểm tra quyền tải recording hoặc phạm vi OAuth).`,
					502,
				);
			}

			if (!finalRes.body) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					"Phản hồi tải recording từ Zoom không có dữ liệu video.",
					502,
				);
			}

			const rawLength = finalRes.headers.get("content-length")?.trim();
			let contentLength: number | undefined;
			if (rawLength && /^\d+$/.test(rawLength)) {
				const parsed = Number.parseInt(rawLength, 10);
				if (Number.isSafeInteger(parsed) && parsed > 0) {
					contentLength = parsed;
				}
			}

			const contentType =
				!baseMediaType ||
				baseMediaType === "application/octet-stream" ||
				baseMediaType === "binary/octet-stream"
					? "video/mp4"
					: baseMediaType;

			return {
				body: finalRes.body,
				contentType,
				...(contentLength !== undefined ? { contentLength } : {}),
			};
		},
		async trashRecording(meetingId) {
			await zoomFetch(
				`/meetings/${encodeURIComponent(meetingId)}/recordings?action=trash`,
				{ method: "DELETE" },
				true,
			);
		},
	};
}
