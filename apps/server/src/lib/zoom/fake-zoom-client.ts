import { ZOOM_ERROR_CODES } from "@teacher-os/api/contracts";
import { type FullZoomClient, ZoomIntegrationError } from "./zoom-client";

export interface FakeZoomCall {
	method: "create" | "update" | "delete" | "recording" | "download" | "trash";
	meetingId?: string;
	downloadUrl?: string;
}

export interface FakeZoomController {
	client: FullZoomClient;
	setRecordingReady(ready: boolean): void;
	setDownloadError(message: string | null): void;
	setTrashError(message: string | null): void;
	setVideoBytes(bytes: Uint8Array): void;
	calls: FakeZoomCall[];
}

// File MP4 nhỏ hợp lệ (ftypisom + moov + VP9 + mdat, ~1 KB) để `<video>` trong
// Chromium headless E2E nạp được metadata mà không cần codec độc quyền.
const DEFAULT_FAKE_MP4_BASE64 =
	"AAAAIGZ0eXBpc29tAAACAGlzb21pc282aXNvMm1wNDEAAALXbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAAAAAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAdl0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAF1bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAAABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABIG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAOBzdGJsAAAAlHN0c2QAAAAAAAAAAQAAAIR2cDA5AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABGExhdmM2MC4zMS4xMDIgbGlidnB4LXZwOQAAAAAAAAAAGP//AAAAFHZwY0MBAAAAAAqCAgICAAAAAAAKZmllbAEAAAAAEHBhc3AAAAABAAAAAQAAABBzdHRzAAAAAAAAAAAAAAAQc3RzYwAAAAAAAAAAAAAAFHN0c3oAAAAAAAAAAAAAAAAAAAAQc3RjbwAAAAAAAAAAAAAAKG12ZXgAAAAgdHJleAAAAAAAAAABAAAAAQAAAAAAAAAAAAAAAAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAAfG1vb2YAAAAQbWZoZAAAAAAAAAABAAAAZHRyYWYAAAAkdGZoZAAAADkAAAABAAAAAAAAAvcAAAgAAAAAHAEBAAAAAAAUdGZkdAEAAAAAAAAAAAAAAAAAACR0cnVuAAACBQAAAAMAAACEAgAAAAAAABwAAAAPAAAADwAAAEJtZGF0gkmDQgAA8AD2ADgkHBhKAAAwYAAAEL///UiMAIYAQJKcAFAAAAMgAABCQIYAQJKcAE7gAAMgAABCQAAAAENtZnJhAAAAK3RmcmEBAAAAAAAAAQAAAAAAAAABAAAAAAAAAAAAAAAAAAAC9wEBAQAAABBtZnJvAAAAAAAAAEM=";

function decodeBase64(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i += 1) {
		out[i] = bin.charCodeAt(i);
	}
	return out;
}

const DEFAULT_FAKE_MP4_BYTES = decodeBase64(DEFAULT_FAKE_MP4_BASE64);

export function createFakeZoom(): FakeZoomController {
	let seq = 900_000_000;
	let recordingReady = false;
	let downloadError: string | null = null;
	let trashError: string | null = null;
	let videoBytes: Uint8Array = DEFAULT_FAKE_MP4_BYTES;
	const calls: FakeZoomCall[] = [];

	const client: FullZoomClient = {
		async createMeeting() {
			seq += 1;
			const meetingId = String(seq);
			calls.push({ method: "create", meetingId });
			return { meetingId, joinUrl: `https://zoom.us/j/${meetingId}` };
		},
		async updateMeeting(meetingId) {
			calls.push({ method: "update", meetingId });
		},
		async deleteMeeting(meetingId) {
			calls.push({ method: "delete", meetingId });
		},
		async getRecording(meetingId) {
			calls.push({ method: "recording", meetingId });
			if (!recordingReady) return { status: "pending" };
			return {
				status: "ready",
				shareUrl: `https://zoom.us/rec/share/fake-${meetingId}`,
				password: "rec123",
				primaryFile: {
					id: `rec-file-${meetingId}`,
					downloadUrl: `https://us06web.zoom.us/rec/download/fake-${meetingId}`,
					fileSize: videoBytes.byteLength,
					recordingType: "shared_screen_with_speaker_view",
					mimeType: "video/mp4",
				},
			};
		},
		async downloadRecordingFile(downloadUrl) {
			calls.push({ method: "download", downloadUrl });
			if (downloadError) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					downloadError,
					502,
				);
			}
			const chunk = new Uint8Array(videoBytes);
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(chunk);
					controller.close();
				},
			});
			return {
				body,
				contentType: "video/mp4",
				contentLength: chunk.byteLength,
			};
		},
		async trashRecording(meetingId) {
			calls.push({ method: "trash", meetingId });
			if (trashError) {
				throw new ZoomIntegrationError(
					ZOOM_ERROR_CODES.API_ERROR,
					trashError,
					502,
				);
			}
		},
	};

	return {
		client,
		calls,
		setRecordingReady(ready) {
			recordingReady = ready;
		},
		setDownloadError(message) {
			downloadError = message;
		},
		setTrashError(message) {
			trashError = message;
		},
		setVideoBytes(bytes) {
			videoBytes = bytes;
		},
	};
}
