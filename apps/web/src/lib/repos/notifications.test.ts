import type { NotificationLogResponse } from "@teacher-os/api/contracts";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { HttpError } from "@/lib/kernel-load-state";
import {
	fetchNotificationLogs,
	notificationLogsQueryKey,
	notificationLogsQueryOptions,
} from "./notifications";

const BASE = "http://api";

const validResponse: NotificationLogResponse = {
	rows: [
		{
			id: "nt-1",
			createdAt: "2026-10-20T01:00:00.000Z",
			recipientName: "Minh Tran",
			recipientEmail: "minh@gmail.com",
			eventType: "class_enrolled",
			eventGroup: "class_invite",
			channels: "email,in_app",
			status: "read",
			title: "Mời vào lớp",
			body: "Nội dung",
			linkPath: "/student",
			senderName: "Cô Lan",
			replyToEmail: "lan@school.vn",
			sentAt: "2026-10-20T01:00:00.000Z",
			readAt: null,
			retryCount: 0,
			lastError: null,
			refType: "class",
			refId: "cl-1",
		},
	],
	total: 1,
	counts: { queued: 0, sent: 0, read: 1, failed: 0, all: 1 },
	page: 1,
	pageSize: 20,
};

function stubFetch(handler: (url: URL) => Response) {
	let seenUrl = "";
	let seenInit: RequestInit | undefined;
	vi.stubGlobal("fetch", (input: string | URL, init?: RequestInit) => {
		seenUrl = String(input);
		seenInit = init;
		return Promise.resolve(handler(new URL(seenUrl)));
	});
	return {
		url: () => seenUrl,
		init: () => seenInit,
		restore: () => vi.unstubAllGlobals(),
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("fetchNotificationLogs", () => {
	test("GET /api/notification-logs với credentials include và parse contract", async () => {
		const stub = stubFetch(
			() => new Response(JSON.stringify(validResponse), { status: 200 }),
		);
		const data = await fetchNotificationLogs(
			{ q: "minh", event: "class_invite", status: "read" },
			BASE,
		);
		expect(data.total).toBe(1);
		expect(stub.url()).toBe(
			`${BASE}/api/notification-logs?q=minh&event=class_invite&status=read`,
		);
		// credentials include để mang cookie session.
		expect(stub.init()?.credentials).toBe("include");
		stub.restore();
	});

	test("bỏ qua param mặc định (page 1, filter rỗng) để URL sạch", async () => {
		const stub = stubFetch(
			() => new Response(JSON.stringify(validResponse), { status: 200 }),
		);
		await fetchNotificationLogs({}, BASE);
		expect(stub.url()).toBe(`${BASE}/api/notification-logs`);
		stub.restore();
	});

	test("page > 1 nằm trên query string", async () => {
		const stub = stubFetch(
			() => new Response(JSON.stringify(validResponse), { status: 200 }),
		);
		await fetchNotificationLogs({ page: 2 }, BASE);
		expect(stub.url()).toBe(`${BASE}/api/notification-logs?page=2`);
		stub.restore();
	});

	test("response !ok ném HttpError kèm status", async () => {
		stubFetch(() => new Response("{}", { status: 401 }));
		await expect(fetchNotificationLogs({}, BASE)).rejects.toMatchObject({
			name: "HttpError",
			status: 401,
		} satisfies Partial<HttpError>);
	});

	test("body không khớp contract ném ZodError", async () => {
		stubFetch(
			() => new Response(JSON.stringify({ rows: "x" }), { status: 200 }),
		);
		await expect(fetchNotificationLogs({}, BASE)).rejects.toThrow();
	});

	test("queryOptions dựng key theo bộ lọc", () => {
		const opts = notificationLogsQueryOptions({ page: 3 });
		expect(opts.queryKey).toEqual(notificationLogsQueryKey({ page: 3 }));
	});
});
