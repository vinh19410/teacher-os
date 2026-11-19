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

export type ZoomRecordingResult =
	| { status: "ready"; shareUrl: string; password: string | null }
	| { status: "pending" }
	| { status: "missing" };

export interface ZoomClient {
	createMeeting(input: ZoomMeetingInput): Promise<ZoomMeetingResult>;
	updateMeeting(meetingId: string, input: ZoomMeetingInput): Promise<void>;
	deleteMeeting(meetingId: string): Promise<void>;
	getRecording(meetingId: string): Promise<ZoomRecordingResult>;
}

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
): ZoomClient {
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
				recording_files?: { status?: string }[];
			};
			const done = (body.recording_files ?? []).some(
				(f) => f.status === "completed",
			);
			if (done && body.share_url) {
				return {
					status: "ready",
					shareUrl: body.share_url,
					password: body.password || null,
				};
			}
			return { status: "pending" };
		},
	};
}
