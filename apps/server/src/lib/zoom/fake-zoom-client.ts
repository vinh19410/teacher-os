import type { ZoomClient } from "./zoom-client";

export interface FakeZoomCall {
	method: "create" | "update" | "delete" | "recording";
	meetingId?: string;
}

export interface FakeZoomController {
	client: ZoomClient;
	setRecordingReady(ready: boolean): void;
	calls: FakeZoomCall[];
}

export function createFakeZoom(): FakeZoomController {
	let seq = 900_000_000;
	let recordingReady = false;
	const calls: FakeZoomCall[] = [];

	const client: ZoomClient = {
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
			};
		},
	};

	return {
		client,
		calls,
		setRecordingReady(ready) {
			recordingReady = ready;
		},
	};
}
