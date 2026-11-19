import {
	GOOGLE_MEET_ERROR_CODES,
	GOOGLE_MEET_SCOPES,
} from "@teacher-os/api/contracts";
import { account } from "@teacher-os/db/schema/auth";
import { and, eq } from "drizzle-orm";
import type { Db } from "../../app";
import { GoogleIntegrationError, parseAccountScopes } from "./google-oauth";
import type { GoogleWorkspaceClient } from "./google-workspace-client";

export interface FakeGoogleWorkspaceController {
	setRecordingReady(ready: boolean): void;
	getClientForUser(db: Db, userId: string): Promise<GoogleWorkspaceClient>;
}

export function createFakeGoogleWorkspace(): FakeGoogleWorkspaceController {
	let seq = 1;
	let recordingReady = false;

	return {
		setRecordingReady(ready: boolean) {
			recordingReady = ready;
		},
		async getClientForUser(
			db: Db,
			userId: string,
		): Promise<GoogleWorkspaceClient> {
			const [row] = await db
				.select({
					scope: account.scope,
					refreshToken: account.refreshToken,
				})
				.from(account)
				.where(
					and(eq(account.userId, userId), eq(account.providerId, "google")),
				)
				.limit(1);

			if (!row) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.NOT_CONNECTED,
					"Tài khoản chưa liên kết Google. Vui lòng kết nối Google tại trang Hồ sơ.",
					412,
				);
			}

			const scopeSet = new Set(parseAccountScopes(row.scope));
			const hasMeetScopes = GOOGLE_MEET_SCOPES.every((s) => scopeSet.has(s));
			if (!hasMeetScopes || !row.refreshToken) {
				throw new GoogleIntegrationError(
					GOOGLE_MEET_ERROR_CODES.INSUFFICIENT_SCOPES,
					"Tài khoản Google chưa cấp đủ quyền Calendar, Meet và Drive. Vui lòng cấp lại quyền tại trang Hồ sơ.",
					412,
				);
			}

			return {
				async createCalendarEventWithMeet() {
					const n = seq++;
					const code = `e2e-meet-${String(n).padStart(3, "0")}`;
					return {
						eventId: `e2e-cal-${n}`,
						hangoutLink: `https://meet.google.com/${code}`,
						meetCode: code,
					};
				},
				async patchCalendarEvent() {},
				async deleteCalendarEvent() {},
				async configureMeetSpace({ meetCode }) {
					return {
						spaceName: `spaces/${meetCode}`,
						meetingUri: `https://meet.google.com/${meetCode}`,
						warning: null,
					};
				},
				async findReadyRecording({ meetCode }) {
					if (!recordingReady) return { status: "pending" };
					const id = meetCode ?? "e2e-rec";
					return {
						status: "ready",
						fileId: `drive-${id}`,
						exportUri: `https://drive.google.com/file/d/drive-${id}/view`,
					};
				},
				async shareDriveFileWithEmails({ emails }) {
					return { shared: emails.length, errors: [] };
				},
			};
		},
	};
}
