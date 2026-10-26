/**
 * Behavioral test harness for kernel-backed screens: renders the REAL
 * DataProvider + command bus, and fakes only the HTTP kernel behind `fetch`.
 * Tests observe what the user sees (rendered data, dialogs closing) and what
 * leaves the browser (the recorded requests), never the source text.
 */

import { QueryClientProvider } from "@tanstack/react-query";
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import { render } from "@testing-library/react";
import { Component, type ReactElement, type ReactNode } from "react";
import { vi } from "vitest";
import { DataProvider } from "@/lib/data-provider";
import { createKernelQueryClient } from "@/lib/query-client";

type Row<K extends keyof KernelSnapshot> = NonNullable<
	KernelSnapshot[K]
>[number];

export function snapshotFixture(
	overrides: Partial<KernelSnapshot> = {},
): KernelSnapshot {
	return {
		students: [],
		classes: [],
		syllabi: [],
		enrollments: [],
		packages: [],
		lessons: [],
		events: [],
		assignments: [],
		assignmentPrompts: [],
		classAssignments: [],
		assignmentTests: [],
		invoices: [],
		reports: [],
		notifs: [],
		commentBank: [],
		vocabDecks: [],
		vocabSuggestions: [],
		...overrides,
	};
}

export function studentRow(overrides: Partial<Row<"students">> = {}) {
	return {
		id: "st-1",
		name: "Nguyễn Minh Anh",
		phone: "0912345678",
		email: "",
		zalo: "",
		parentName: "",
		parentPhone: "",
		...overrides,
	} as Row<"students">;
}

export function classRow(overrides: Partial<Row<"classes">> = {}) {
	return {
		id: "cl-1",
		name: "IELTS Writing",
		level: "Band 7.0",
		type: "ielts",
		skills: ["Writing"],
		mode: "Online",
		syllabusId: null,
		schedule: "T3 19:00",
		sessionsTotal: 12,
		sessionsDone: 0,
		status: "active",
		startDate: "01/08",
		tuitionFee: null,
		notes: "",
		...overrides,
	} as Row<"classes">;
}

export function enrollmentRow(overrides: Partial<Row<"enrollments">> = {}) {
	return {
		id: "en-1",
		classId: "cl-1",
		studentId: "st-1",
		status: "active",
		createdAt: "2026-08-18T01:00:00.000Z",
		...overrides,
	} as Row<"enrollments">;
}

export function syllabusRow(overrides: Partial<Row<"syllabi">> = {}) {
	return {
		id: "sy-1",
		name: "IELTS Writing 7.0",
		level: "Band 7.0",
		type: "ielts",
		classId: null,
		sourceTemplateId: null,
		skills: ["Writing"],
		description: "",
		totalLessons: 0,
		modules: [],
		...overrides,
	} as Row<"syllabi">;
}

export function invoiceRow(overrides: Partial<Row<"invoices">> = {}) {
	return {
		id: "inv-1",
		studentId: "st-1",
		enrollmentId: "en-1",
		amount: 400000,
		paidAmount: 0,
		status: "pending",
		due: "2099-12-31",
		date: "01/10",
		type: "Gói buổi",
		method: "—",
		note: "",
		createdAt: "2026-10-01T00:00:00.000Z",
		...overrides,
	} as Row<"invoices">;
}

export function lessonRow(overrides: Partial<Row<"lessons">> = {}) {
	return {
		id: "les-1",
		classId: "cl-1",
		enrollmentId: "en-1",
		day: 1,
		time: "19:00",
		dur: 90,
		date: null,
		type: "1:1",
		status: "upcoming",
		attendance: null,
		attendanceNote: null,
		topic: "Task 2",
		zoom: "",
		...overrides,
	} as Row<"lessons">;
}

export interface KernelRequest {
	method: string;
	path: string;
	body: unknown;
}

export interface KernelReply {
	status: number;
	body?: unknown;
}

/**
 * Write handler: return a reply for a request, or undefined for the default
 * `200 {}`. Mutating `server.snapshot` inside it models the write landing —
 * the bus's post-write refetch then serves the new snapshot.
 */
export type WriteHandler = (
	req: KernelRequest,
	server: KernelServer,
) => KernelReply | undefined | Promise<KernelReply | undefined>;

export interface KernelServer {
	snapshot: KernelSnapshot;
	/** Every non-snapshot request, in order. */
	writes: KernelRequest[];
	/** Number of GET /api/kernel calls served. */
	snapshotLoads: number;
	/** `credentials` mode of every request, in order (session cookie check). */
	credentials: (RequestCredentials | undefined)[];
	/** Swap the GET /api/kernel reply (e.g. to fail the post-write refresh). */
	snapshotReply?: () => KernelReply;
	onWrite?: WriteHandler;
}

function json(status: number, body: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

/** Stub global fetch with an in-memory kernel. Undo with vi.unstubAllGlobals. */
export function startKernelServer(
	snapshot: KernelSnapshot,
	onWrite?: WriteHandler,
): KernelServer {
	const server: KernelServer = {
		snapshot,
		writes: [],
		snapshotLoads: 0,
		credentials: [],
		onWrite,
	};
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const method = (init?.method ?? "GET").toUpperCase();
			server.credentials.push(init?.credentials);
			if (method === "GET" && url.pathname === "/api/kernel") {
				server.snapshotLoads += 1;
				if (server.snapshotReply) {
					const reply = server.snapshotReply();
					return json(reply.status, reply.body);
				}
				return json(200, structuredClone(server.snapshot));
			}
			const req: KernelRequest = {
				method,
				path: url.pathname + url.search,
				body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
			};
			server.writes.push(req);
			const reply = (await server.onWrite?.(req, server)) ?? {
				status: 200,
				body: {},
			};
			return json(reply.status, reply.body);
		}),
	);
	return server;
}

/** Render `ui` inside the real kernel provider stack. */
export function renderWithKernel(ui: ReactElement) {
	const client = createKernelQueryClient();
	return render(
		<QueryClientProvider client={client}>
			<DataProvider>{ui}</DataProvider>
		</QueryClientProvider>,
	);
}

/**
 * Stands in for the router's error/notFound boundary: a route that throws
 * (e.g. `throw notFound()`) renders `route-error` with the thrown message.
 */
export class RouteErrorBoundary extends Component<
	{ children: ReactNode },
	{ error: Error | null }
> {
	state = { error: null as Error | null };
	static getDerivedStateFromError(error: Error) {
		return { error };
	}
	render() {
		if (this.state.error) {
			return <div data-testid="route-error">{this.state.error.message}</div>;
		}
		return this.props.children;
	}
}
