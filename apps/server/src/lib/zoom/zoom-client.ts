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
			/** Buổi bị ghi thành nhiều đoạn: bản chính không thay được cả buổi. */
			hasMultipleSegments?: boolean;
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
	return Boolean(
		cfg?.accountId?.trim() &&
			cfg?.clientId?.trim() &&
			cfg?.clientSecret?.trim(),
	);
}

const ZOOM_EMAIL_LOCAL_REGEX =
	/^[A-Za-z0-9!#$%&'*+_~-]+(?:\.[A-Za-z0-9!#$%&'*+_~-]+)*$/;
const ZOOM_EMAIL_DOMAIN_LABEL_REGEX =
	/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const ZOOM_USER_ID_REGEX = /^[A-Za-z0-9_-]{16,64}$/;

function isValidZoomEmail(value: string): boolean {
	if (value.length > 254) return false;
	const atIndex = value.indexOf("@");
	if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;
	const local = value.slice(0, atIndex);
	const domain = value.slice(atIndex + 1);
	if (local.length > 64 || !ZOOM_EMAIL_LOCAL_REGEX.test(local)) return false;
	const labels = domain.split(".");
	if (labels.length < 2) return false;
	const tld = labels[labels.length - 1] ?? "";
	if (tld.length < 2) return false;
	return labels.every((label) => ZOOM_EMAIL_DOMAIN_LABEL_REGEX.test(label));
}

function isValidRuntimeZoomHostUser(value: string): boolean {
	return (
		value.toLowerCase() === "me" ||
		isValidZoomEmail(value) ||
		ZOOM_USER_ID_REGEX.test(value)
	);
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
	recording_start?: string;
}

function isMp4File(f: RawZoomRecordingFile): boolean {
	return (
		(f.file_type ?? "").toUpperCase() === "MP4" ||
		(f.file_extension ?? "").toUpperCase() === "MP4"
	);
}

/**
 * Các bố cục (`recording_type`) của cùng một đoạn có chung `recording_start`.
 * Hai mốc bắt đầu khác nhau, hoặc một bố cục lặp lại, nghĩa là có nhiều đoạn.
 */
function hasMultipleMp4Segments(files: RawZoomRecordingFile[]): boolean {
	const starts = new Set<string>();
	const types = new Set<string>();
	for (const f of files) {
		if (!isMp4File(f)) continue;
		if (f.recording_start) starts.add(f.recording_start);
		const type = (f.recording_type ?? "").trim().toLowerCase();
		if (!type) continue;
		if (types.has(type)) return true;
		types.add(type);
	}
	return starts.size > 1;
}

function isZoomHostname(hostname: string): boolean {
	const lower = hostname.trim().toLowerCase().replace(/\.$/, "");
	return lower === "zoom.us" || lower.endsWith(".zoom.us");
}

function isDisallowedDownloadHost(url: URL): boolean {
	if (url.username || url.password) return true;
	// Trên HTTPS, WHATWG URL chuẩn hoá cổng mặc định :443 về chuỗi rỗng — từ chối cổng không chuẩn.
	if (url.port !== "") return true;
	const hostname = url.hostname.trim().toLowerCase().replace(/\.$/, "");
	if (!hostname.includes(".")) return true;
	if (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		hostname.endsWith(".local") ||
		hostname.endsWith(".internal")
	) {
		return true;
	}
	// Chặn mọi IPv6 literal ([::1], [fe80::1], ...) và IPv4 literal (WHATWG URL chuẩn hóa cả hex/int/octal về dotted-quad).
	if (hostname.includes(":")) return true;
	if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return true;
	return false;
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
		if (!isMp4File(f)) continue;
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

function parseZoomError(
	res: Response,
	text: string,
): { code?: number; message: string } {
	let code: number | undefined;
	let message = "";
	try {
		const parsed = JSON.parse(text) as { code?: unknown; message?: unknown };
		if (typeof parsed.code === "number" && Number.isFinite(parsed.code)) {
			code = parsed.code;
		}
		if (typeof parsed.message === "string" && parsed.message) {
			message = parsed.message;
		}
	} catch {
		// body không phải JSON
	}
	return {
		...(code !== undefined ? { code } : {}),
		message: message || text.slice(0, 200) || res.statusText,
	};
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
	const accountId = (cfg.accountId as string).trim();
	const clientId = (cfg.clientId as string).trim();
	const clientSecret = (cfg.clientSecret as string).trim();
	const rawHostUser = cfg.hostUser?.trim() || "me";
	const normalizedHostUser =
		rawHostUser.toLowerCase() === "me" ? "me" : rawHostUser;
	const hostUser = encodeURIComponent(normalizedHostUser);
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
			const msg = parseZoomError(res, await res.text()).message;
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

	// Trả về Response; 404 do caller tự xử lý khi allow404=true, các lỗi khác ném ở đây.
	async function zoomFetch(
		path: string,
		init: RequestInit,
		allow404 = false,
		opts?: { mapUserNotFoundToInvalidConfig?: boolean },
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
		const parsedErr = parseZoomError(res, text);
		if (
			opts?.mapUserNotFoundToInvalidConfig &&
			res.status === 404 &&
			(parsedErr.code === 1001 ||
				/user does not exist/i.test(parsedErr.message))
		) {
			console.warn("[zoom] host user does not exist on Zoom", {
				status: res.status,
				zoomCode: parsedErr.code,
				message: parsedErr.message,
			});
			throw new ZoomIntegrationError(
				ZOOM_ERROR_CODES.INVALID_CONFIG,
				'Tài khoản Zoom host (ZOOM_HOST_USER) không tồn tại trên Zoom. Liên hệ quản trị để kiểm tra email tài khoản Zoom hoặc Zoom User ID (không dùng tên hiển thị hay "me").',
				502,
			);
		}
		throw new ZoomIntegrationError(
			ZOOM_ERROR_CODES.API_ERROR,
			`Zoom API lỗi ${res.status}: ${parsedErr.message}`,
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
			if (!isValidRuntimeZoomHostUser(normalizedHostUser)) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.INVALID_CONFIG,
					"Cấu hình ZOOM_HOST_USER không hợp lệ. Liên hệ quản trị để đặt email tài khoản Zoom hoặc Zoom User ID (không dùng tên hiển thị).",
					503,
				);
			}
			const res = await zoomFetch(
				`/users/${hostUser}/meetings`,
				{
					method: "POST",
					body: meetingBody(input),
				},
				false,
				{ mapUserNotFoundToInvalidConfig: true },
			);
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
			const hasProcessingMp4 = files.some((f) => {
				if ((f.status ?? "").toLowerCase() !== "processing") return false;
				const ft = (f.file_type ?? "").trim().toUpperCase();
				const ext = (f.file_extension ?? "").trim().toUpperCase();
				return ft === "MP4" || ext === "MP4" || (!ft && !ext);
			});
			const hasCompletedAny = files.some(
				(f) => (f.status ?? "").toLowerCase() === "completed",
			);

			// Còn đoạn MP4 đang xử lý (tránh chọn nhầm đoạn ngắn xong trước rồi Trash cả buổi),
			// hoặc chưa có MP4 hoàn tất mà Zoom vẫn đang xử lý file khác (vd M4A xong trước MP4) → chờ tiếp.
			if (hasProcessingMp4 || (!primaryFile && hasProcessing)) {
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
					...(hasMultipleMp4Segments(files)
						? { hasMultipleSegments: true }
						: {}),
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
				isDisallowedDownloadHost(currentUrl) ||
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
					if (
						nextUrl.protocol !== "https:" ||
						isDisallowedDownloadHost(nextUrl)
					) {
						throw new ZoomIntegrationError(
							ZOOM_ERROR_CODES.API_ERROR,
							"Từ chối chuyển hướng tải recording sang địa chỉ không hợp lệ hoặc không dùng HTTPS.",
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
					`Tải recording từ Zoom lỗi ${finalRes.status}: ${parseZoomError(finalRes, text).message}`,
					502,
				);
			}

			const rawContentType = (
				finalRes.headers.get("content-type") ?? ""
			).trim();
			const baseMediaType =
				rawContentType.split(";")[0]?.trim().toLowerCase() ?? "";
			const isAllowedDownloadMime =
				!baseMediaType ||
				baseMediaType === "application/octet-stream" ||
				baseMediaType === "binary/octet-stream" ||
				(baseMediaType.startsWith("video/") &&
					baseMediaType.length > "video/".length);
			if (!isAllowedDownloadMime) {
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

			// Nếu upstream nén bằng Content-Encoding (vd gzip), runtime giải nén trong suốt
			// khiến độ dài byte thực của stream lệch khỏi Content-Length → đi qua multipart.
			const rawEncoding =
				finalRes.headers.get("content-encoding")?.trim().toLowerCase() ?? "";
			const hasIdentityEncoding = !rawEncoding || rawEncoding === "identity";
			const rawLength = finalRes.headers.get("content-length")?.trim();
			let contentLength: number | undefined;
			if (hasIdentityEncoding && rawLength && /^\d+$/.test(rawLength)) {
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
