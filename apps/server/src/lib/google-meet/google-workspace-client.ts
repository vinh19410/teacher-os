import { GOOGLE_MEET_ERROR_CODES } from "@teacher-os/api/contracts";
import { vietnamDateTimeMs } from "@teacher-os/api/vietnam-date";
import { type FetchFn, GoogleIntegrationError } from "./google-oauth";

export interface CalendarMeetEventInput {
	summary: string;
	description?: string;
	dateISO: string;
	time: string;
	dur: number;
	attendeeEmails: string[];
	requestId: string;
}

export interface CalendarMeetEventResult {
	eventId: string;
	hangoutLink: string;
	meetCode: string | null;
}

export interface CalendarPatchInput {
	eventId: string;
	summary?: string;
	description?: string;
	dateISO?: string;
	time?: string;
	dur?: number;
	attendeeEmails?: string[];
}

export interface ConfigureMeetSpaceResult {
	spaceName: string | null;
	meetingUri: string | null;
	warning: string | null;
}

export type ReadyRecordingResult =
	| { status: "ready"; fileId: string; exportUri: string }
	| { status: "pending" };

export interface ShareDriveResult {
	shared: number;
	errors: string[];
}

export interface GoogleWorkspaceClient {
	createCalendarEventWithMeet(
		input: CalendarMeetEventInput,
	): Promise<CalendarMeetEventResult>;
	patchCalendarEvent(input: CalendarPatchInput): Promise<void>;
	deleteCalendarEvent(eventId: string): Promise<void>;
	configureMeetSpace(input: {
		meetCode: string;
	}): Promise<ConfigureMeetSpaceResult>;
	findReadyRecording(input: {
		spaceName?: string | null;
		meetCode?: string | null;
	}): Promise<ReadyRecordingResult>;
	shareDriveFileWithEmails(input: {
		fileId: string;
		emails: string[];
	}): Promise<ShareDriveResult>;
}

const VIETNAM_TZ = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Format epoch ms as `YYYY-MM-DDTHH:mm:ss+07:00` (Asia/Ho_Chi_Minh has no DST). */
export function toVietnamOffsetISO(epochMs: number): string {
	const shifted = new Date(epochMs + VIETNAM_OFFSET_MS);
	return `${shifted.toISOString().slice(0, 19)}+07:00`;
}

export function buildSessionStartEndISO(
	dateISO: string,
	time: string,
	durMinutes: number,
): { startDateTime: string; endDateTime: string } {
	const startMs = vietnamDateTimeMs(dateISO, time);
	if (!Number.isFinite(startMs)) {
		throw new GoogleIntegrationError(
			GOOGLE_MEET_ERROR_CODES.API_ERROR,
			`Thời gian buổi học không hợp lệ: ${dateISO} ${time}`,
			400,
		);
	}
	const endMs = startMs + durMinutes * 60_000;
	return {
		startDateTime: toVietnamOffsetISO(startMs),
		endDateTime: toVietnamOffsetISO(endMs),
	};
}

export function extractMeetCodeFromUrl(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "meet.google.com") return null;
		const segment = parsed.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
		return segment && /^[a-z0-9-]+$/i.test(segment) ? segment : null;
	} catch {
		return null;
	}
}

function uniqueNormalizedEmails(emails: string[]): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of emails) {
		const trimmed = raw.trim().toLowerCase();
		if (!trimmed.includes("@") || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(trimmed);
	}
	return out;
}

async function readErrorMessage(res: Response): Promise<string> {
	const text = await res.text().catch(() => "");
	if (!text) return `HTTP ${res.status}`;
	try {
		const parsed = JSON.parse(text) as { error?: { message?: string } };
		return parsed.error?.message || text.slice(0, 200);
	} catch {
		return text.slice(0, 200);
	}
}

export function createGoogleWorkspaceClient(input: {
	accessToken: string;
	fetchFn?: FetchFn;
}): GoogleWorkspaceClient {
	const fetchFn = input.fetchFn ?? fetch;
	const authHeader = { authorization: `Bearer ${input.accessToken}` };

	async function googleJson<T>(
		url: string,
		init?: RequestInit,
	): Promise<
		{ ok: true; data: T } | { ok: false; status: number; message: string }
	> {
		const res = await fetchFn(url, {
			...init,
			headers: {
				...authHeader,
				...(init?.body ? { "content-type": "application/json" } : {}),
				...(init?.headers ?? {}),
			},
		});
		if (!res.ok) {
			return {
				ok: false,
				status: res.status,
				message: await readErrorMessage(res),
			};
		}
		if (res.status === 204) {
			return { ok: true, data: {} as T };
		}
		const data = (await res.json().catch(() => ({}))) as T;
		return { ok: true, data };
	}

	return {
		async createCalendarEventWithMeet(params) {
			const { startDateTime, endDateTime } = buildSessionStartEndISO(
				params.dateISO,
				params.time,
				params.dur,
			);
			const attendees = uniqueNormalizedEmails(params.attendeeEmails).map(
				(email) => ({ email }),
			);
			const result = await googleJson<{
				id?: string;
				hangoutLink?: string;
				conferenceData?: { conferenceId?: string };
			}>(
				"https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
				{
					method: "POST",
					body: JSON.stringify({
						summary: params.summary,
						...(params.description ? { description: params.description } : {}),
						start: { dateTime: startDateTime, timeZone: VIETNAM_TZ },
						end: { dateTime: endDateTime, timeZone: VIETNAM_TZ },
						...(attendees.length > 0 ? { attendees } : {}),
						conferenceData: {
							createRequest: {
								requestId: params.requestId,
								conferenceSolutionKey: { type: "hangoutsMeet" },
							},
						},
					}),
				},
			);

			if (!result.ok) {
				throw new GoogleIntegrationError(
					result.status === 401 || result.status === 403
						? GOOGLE_MEET_ERROR_CODES.REAUTH_REQUIRED
						: GOOGLE_MEET_ERROR_CODES.API_ERROR,
					`Không tạo được sự kiện Google Calendar (${result.status}): ${result.message}`,
					result.status === 401 ? 412 : 502,
				);
			}

			const hangoutLink = result.data.hangoutLink ?? "";
			const eventId = result.data.id ?? "";
			if (!eventId || !hangoutLink) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.API_ERROR,
					"Google Calendar không trả về link Google Meet.",
					502,
				);
			}

			return {
				eventId,
				hangoutLink,
				meetCode:
					result.data.conferenceData?.conferenceId ??
					extractMeetCodeFromUrl(hangoutLink),
			};
		},

		async patchCalendarEvent(params) {
			const body: Record<string, unknown> = {};
			if (params.summary !== undefined) body.summary = params.summary;
			if (params.description !== undefined)
				body.description = params.description;
			if (
				params.dateISO !== undefined &&
				params.time !== undefined &&
				params.dur !== undefined
			) {
				const { startDateTime, endDateTime } = buildSessionStartEndISO(
					params.dateISO,
					params.time,
					params.dur,
				);
				body.start = { dateTime: startDateTime, timeZone: VIETNAM_TZ };
				body.end = { dateTime: endDateTime, timeZone: VIETNAM_TZ };
			}
			if (params.attendeeEmails !== undefined) {
				body.attendees = uniqueNormalizedEmails(params.attendeeEmails).map(
					(email) => ({ email }),
				);
			}
			if (Object.keys(body).length === 0) return;

			const res = await googleJson(
				`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(params.eventId)}?sendUpdates=all`,
				{
					method: "PATCH",
					body: JSON.stringify(body),
				},
			);
			if (!res.ok && res.status !== 404 && res.status !== 410) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.API_ERROR,
					`Không cập nhật được sự kiện Google Calendar (${res.status}): ${res.message}`,
					502,
				);
			}
		},

		async deleteCalendarEvent(eventId) {
			const res = await googleJson(
				`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
				{ method: "DELETE" },
			);
			if (!res.ok && res.status !== 404 && res.status !== 410) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.API_ERROR,
					`Không hủy được sự kiện Google Calendar (${res.status}): ${res.message}`,
					502,
				);
			}
		},

		async configureMeetSpace({ meetCode }) {
			const spaceLookup = await googleJson<{
				name?: string;
				meetingUri?: string;
			}>(
				`https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetCode)}`,
				{
					method: "GET",
				},
			);

			if (!spaceLookup.ok || !spaceLookup.data.name) {
				return {
					spaceName: null,
					meetingUri: null,
					warning:
						"Đã tạo link Meet nhưng chưa cấu hình được phòng tự động (không tìm thấy Meet space).",
				};
			}

			const spaceName = spaceLookup.data.name;
			const meetingUri = spaceLookup.data.meetingUri ?? null;

			// Thử đặt OPEN + autoRecordingGeneration=ON trước; fallback từng bước nếu gói Workspace/policy hạn chế.
			const fullPatch = await googleJson(
				`https://meet.googleapis.com/v2/${spaceName}?updateMask=config.accessType,config.artifactConfig.recordingConfig.autoRecordingGeneration`,
				{
					method: "PATCH",
					body: JSON.stringify({
						config: {
							accessType: "OPEN",
							artifactConfig: {
								recordingConfig: { autoRecordingGeneration: "ON" },
							},
						},
					}),
				},
			);
			if (fullPatch.ok) {
				return { spaceName, meetingUri, warning: null };
			}

			const openOnlyPatch = await googleJson(
				`https://meet.googleapis.com/v2/${spaceName}?updateMask=config.accessType`,
				{
					method: "PATCH",
					body: JSON.stringify({ config: { accessType: "OPEN" } }),
				},
			);
			if (openOnlyPatch.ok) {
				return {
					spaceName,
					meetingUri,
					warning:
						"Đã tạo Meet mở (OPEN), nhưng gói Workspace không hỗ trợ tự động bật ghi hình — giáo viên nhớ bấm Ghi hình trong phòng họp.",
				};
			}

			const trustedPatch = await googleJson(
				`https://meet.googleapis.com/v2/${spaceName}?updateMask=config.accessType`,
				{
					method: "PATCH",
					body: JSON.stringify({ config: { accessType: "TRUSTED" } }),
				},
			);
			if (trustedPatch.ok) {
				return {
					spaceName,
					meetingUri,
					warning:
						"Chính sách Workspace không cho phép mở phòng OPEN — đã đặt chế độ TRUSTED (học viên ngoài org cần được duyệt vào phòng).",
				};
			}

			return {
				spaceName,
				meetingUri,
				warning:
					"Đã tạo link Meet nhưng chưa áp dụng được cấu hình phòng tự động.",
			};
		},

		async findReadyRecording({ spaceName, meetCode }) {
			const filter = spaceName
				? `space.name="${spaceName}"`
				: meetCode
					? `space.meeting_code="${meetCode}"`
					: null;
			if (!filter) return { status: "pending" };

			const confRes = await googleJson<{
				conferenceRecords?: Array<{ name?: string; startTime?: string }>;
			}>(
				`https://meet.googleapis.com/v2/conferenceRecords?filter=${encodeURIComponent(filter)}`,
				{ method: "GET" },
			);
			if (!confRes.ok) {
				throw new GoogleIntegrationError(
					confRes.status === 401
						? GOOGLE_MEET_ERROR_CODES.REAUTH_REQUIRED
						: GOOGLE_MEET_ERROR_CODES.API_ERROR,
					`Lỗi kiểm tra conferenceRecords (${confRes.status}): ${confRes.message}`,
					confRes.status === 401 ? 412 : 502,
				);
			}

			const records = [...(confRes.data.conferenceRecords ?? [])].sort((a, b) =>
				(b.startTime ?? "").localeCompare(a.startTime ?? ""),
			);

			for (const rec of records) {
				if (!rec.name) continue;
				const recRes = await googleJson<{
					recordings?: Array<{
						state?: string;
						driveDestination?: { file?: string; exportUri?: string };
					}>;
				}>(`https://meet.googleapis.com/v2/${rec.name}/recordings`, {
					method: "GET",
				});
				if (!recRes.ok) continue;
				for (const item of recRes.data.recordings ?? []) {
					if (
						item.state === "FILE_GENERATED" &&
						item.driveDestination?.exportUri &&
						item.driveDestination?.file
					) {
						return {
							status: "ready",
							fileId: item.driveDestination.file.replace(/^files\//, ""),
							exportUri: item.driveDestination.exportUri,
						};
					}
				}
			}

			return { status: "pending" };
		},

		async shareDriveFileWithEmails({ fileId, emails }) {
			const unique = uniqueNormalizedEmails(emails);
			let shared = 0;
			const errors: string[] = [];
			for (const emailAddress of unique) {
				const res = await googleJson(
					`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
					{
						method: "POST",
						body: JSON.stringify({
							role: "reader",
							type: "user",
							emailAddress,
						}),
					},
				);
				if (res.ok) {
					shared += 1;
				} else {
					errors.push(`${emailAddress}: ${res.message}`);
				}
			}
			return { shared, errors };
		},
	};
}
