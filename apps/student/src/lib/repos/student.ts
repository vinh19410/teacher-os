import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type ClassmatesResponse,
	classmatesResponseSchema,
	type HistoryListResponse,
	type HistoryMonthResponse,
	type HistorySkill,
	type HistoryWeekResponse,
	historyListResponseSchema,
	historyMonthResponseSchema,
	historyWeekResponseSchema,
	type PaymentInstructions,
	type PracticeCatalogResponse,
	type PracticeSkill,
	practiceCatalogResponseSchema,
	type StartPracticeResponse,
	type StudentClassDetail,
	type StudentInboxResponse,
	type StudentInvitationItem,
	type StudentInvoiceItem,
	type StudentMe,
	type StudentOnboardingPayload,
	type StudentOrgItem,
	type StudentOverview,
	type StudentScheduleResponse,
	startPracticeResponseSchema,
	studentClassDetailSchema,
	studentInboxResponseSchema,
	studentMeSchema,
	studentOverviewSchema,
	studentScheduleResponseSchema,
} from "@teacher-os/api/contracts";
import type {
	StudentLessonMaterialListResponse,
	StudentLessonMaterialView,
} from "@teacher-os/api/material-contracts";
import { env } from "@teacher-os/env/web";
import { HttpError } from "@/lib/query-client";

export function getApiBaseUrl(): string {
	const raw = env.VITE_SERVER_URL;
	return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function getActiveStudentOrgId(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem("active_student_org_id");
}

export function setActiveStudentOrgId(orgId: string): void {
	if (typeof window === "undefined") return;
	localStorage.setItem("active_student_org_id", orgId);
}

export function getStudentHeaders(
	extra: Record<string, string> = {},
): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		...extra,
	};
	const activeOrgId = getActiveStudentOrgId();
	if (activeOrgId) {
		headers["x-student-org-id"] = activeOrgId;
	}
	return headers;
}

export async function fetchStudentMe(): Promise<StudentMe> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/me`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return studentMeSchema.parse(data);
}

export async function submitOnboarding(
	payload: StudentOnboardingPayload,
): Promise<StudentMe> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/onboarding`, {
		method: "POST",
		headers: getStudentHeaders({
			Accept: "application/json",
			"Content-Type": "application/json",
		}),
		credentials: "include",
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return studentMeSchema.parse(data);
}

export async function fetchStudentOverview(): Promise<StudentOverview> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/overview`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return studentOverviewSchema.parse(data);
}

export async function fetchStudentSchedule(): Promise<StudentScheduleResponse> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/schedule`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return studentScheduleResponseSchema.parse(data);
}

export async function fetchStudentClassDetail(
	classId: string,
): Promise<StudentClassDetail> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}`,
		{
			method: "GET",
			headers: getStudentHeaders(),
			credentials: "include",
		},
	);

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return studentClassDetailSchema.parse(data);
}

export async function fetchStudentNotifications(): Promise<
	StudentInvitationItem[]
> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/notifications`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	return (await res.json()) as StudentInvitationItem[];
}

export async function acceptStudentInvitation(
	id: string,
): Promise<{ ok: boolean; orgId: string }> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invitations/${encodeURIComponent(id)}/accept`,
		{
			method: "POST",
			headers: getStudentHeaders({ "Content-Type": "application/json" }),
			credentials: "include",
		},
	);

	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
		};
		throw new HttpError(
			res.status,
			data.error || `Failed to accept invitation: ${res.status}`,
			{ code: data.code },
		);
	}

	return (await res.json()) as { ok: boolean; orgId: string };
}

export async function rejectStudentInvitation(
	id: string,
): Promise<{ ok: boolean }> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invitations/${encodeURIComponent(id)}/reject`,
		{
			method: "POST",
			headers: getStudentHeaders({ "Content-Type": "application/json" }),
			credentials: "include",
		},
	);

	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
		};
		throw new HttpError(
			res.status,
			data.error || `Failed to reject invitation: ${res.status}`,
			{ code: data.code },
		);
	}

	return (await res.json()) as { ok: boolean };
}

export async function acceptClassEnrollment(
	enrollmentId: string,
): Promise<{ ok: boolean }> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/enrollments/${encodeURIComponent(enrollmentId)}/accept`,
		{
			method: "POST",
			headers: getStudentHeaders({ "Content-Type": "application/json" }),
			credentials: "include",
		},
	);

	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
		};
		throw new HttpError(
			res.status,
			data.error || `Failed to accept enrollment: ${res.status}`,
			{ code: data.code },
		);
	}

	return (await res.json()) as { ok: boolean };
}

export async function fetchStudentOrgs(): Promise<StudentOrgItem[]> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/orgs`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	return (await res.json()) as StudentOrgItem[];
}

export function useStudentMe() {
	return useQuery({
		queryKey: ["student", "me"],
		queryFn: fetchStudentMe,
		staleTime: 60_000,
	});
}

export interface UseStudentOverviewOptions {
	refetchOnMount?: boolean | "always";
	refetchOnWindowFocus?: boolean | "always";
	staleTime?: number;
}

export function useStudentOverview(options?: UseStudentOverviewOptions) {
	return useQuery({
		queryKey: ["student", "overview"],
		queryFn: fetchStudentOverview,
		staleTime: 60_000,
		...options,
	});
}

export interface UseStudentScheduleOptions {
	refetchOnMount?: boolean | "always";
	refetchOnWindowFocus?: boolean | "always";
	staleTime?: number;
}

export function useStudentSchedule(options?: UseStudentScheduleOptions) {
	const activeOrgId = getActiveStudentOrgId();
	return useQuery({
		queryKey: ["student", "schedule", activeOrgId],
		queryFn: fetchStudentSchedule,
		staleTime: 60_000,
		...options,
	});
}

export function useStudentClassDetail(classId: string) {
	return useQuery({
		queryKey: ["student", "class", classId],
		queryFn: () => fetchStudentClassDetail(classId),
		staleTime: 60_000,
	});
}

export async function fetchStudentClassmates(
	classId: string,
): Promise<ClassmatesResponse> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}/classmates`,
		{
			method: "GET",
			headers: getStudentHeaders(),
			credentials: "include",
		},
	);

	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{
				code,
			},
		);
	}

	const data = (await res.json()) as unknown;
	return classmatesResponseSchema.parse(data);
}

/** Roster "Bạn cùng lớp" (#378) — chỉ bật khi tab Bạn cùng lớp đang mở. */
export function useClassmates(classId: string, enabled: boolean) {
	return useQuery({
		queryKey: ["student", "class", classId, "classmates"],
		queryFn: () => fetchStudentClassmates(classId),
		enabled,
		staleTime: 60_000,
	});
}

function lessonMaterialsPath(classId: string, date: string): string {
	return `${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(date)}/materials`;
}

/** URL stream file của một tài liệu trong buổi học (`download` → attachment). */
export function lessonMaterialFileUrl(
	classId: string,
	date: string,
	materialId: string,
	download = false,
): string {
	const params = new URLSearchParams();
	if (download) params.set("download", "1");
	// Thẻ media và link tải không gửi được header x-student-org-id.
	const orgId = getActiveStudentOrgId();
	if (orgId) params.set("org", orgId);
	const query = params.toString();
	return `${lessonMaterialsPath(classId, date)}/${encodeURIComponent(materialId)}/file${query ? `?${query}` : ""}`;
}

export async function fetchLessonMaterials(
	classId: string,
	date: string,
): Promise<StudentLessonMaterialView[]> {
	const res = await fetch(lessonMaterialsPath(classId, date), {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{ code },
		);
	}
	const data = (await res.json()) as StudentLessonMaterialListResponse & {
		/** #655: tài liệu ngân hàng gắn qua giáo trình của lớp (đã dedupe). */
		curriculumMaterials?: StudentLessonMaterialView[];
	};
	// #655: danh sách hợp cho UI — tài liệu direct (theo position) trước, tài
	// liệu từ giáo trình (theo position) sau; server đã dedupe theo
	// materialId, direct ưu tiên. Học viên thấy như một danh sách tài liệu
	// thường, không phân biệt nguồn.
	const direct = Array.isArray(data.items) ? data.items : [];
	const curriculum = Array.isArray(data.curriculumMaterials)
		? data.curriculumMaterials
		: [];
	return [...direct, ...curriculum];
}

/** Tài liệu của buổi học — chỉ bật khi học viên mở mục tài liệu của buổi. */
export function useLessonMaterials(
	classId: string,
	date: string,
	enabled: boolean,
) {
	return useQuery({
		queryKey: ["student", "class", classId, "materials", date],
		queryFn: () => fetchLessonMaterials(classId, date),
		enabled,
		staleTime: 60_000,
	});
}

// --- Tự luyện (phase 10, #378) ---------------------------------------------

/** GET /api/student/practice — catalog đề ready của org đang chọn. */
export async function fetchPracticeCatalog(filters: {
	skill: PracticeSkill;
	collection?: string;
	q?: string;
	page?: number;
}): Promise<PracticeCatalogResponse> {
	const params = new URLSearchParams({ skill: filters.skill });
	if (filters.collection) params.set("collection", filters.collection);
	if (filters.q) params.set("q", filters.q);
	if (filters.page && filters.page > 1)
		params.set("page", String(filters.page));
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/practice?${params.toString()}`,
		{
			method: "GET",
			headers: getStudentHeaders(),
			credentials: "include",
		},
	);
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{ code },
		);
	}
	const data = (await res.json()) as unknown;
	return practiceCatalogResponseSchema.parse(data);
}

export function usePracticeCatalog(filters: {
	skill: PracticeSkill;
	collection?: string;
	q?: string;
	page?: number;
}) {
	return useQuery({
		queryKey: [
			"student",
			"practice",
			filters.skill,
			filters.collection ?? "",
			filters.q ?? "",
			filters.page ?? 1,
		],
		queryFn: () => fetchPracticeCatalog(filters),
		staleTime: 30_000,
	});
}

/** POST /api/student/practice/:testId/attempts — 201 lượt mới / 200 resume. */
export async function startPractice(
	testId: string,
): Promise<StartPracticeResponse> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/practice/${encodeURIComponent(testId)}/attempts`,
		{
			method: "POST",
			headers: getStudentHeaders({
				"Content-Type": "application/json",
				Origin: window.location.origin,
			}),
			credentials: "include",
			body: JSON.stringify({}),
		},
	);
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{ code },
		);
	}
	const data = (await res.json()) as unknown;
	return startPracticeResponseSchema.parse(data);
}

export function useStartPractice() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: startPractice,
		onSuccess: (_data, testId) => {
			void queryClient.invalidateQueries({
				queryKey: ["student", "quiz", "practice", testId],
			});
		},
	});
}

// --- Lịch sử học tập (phase 11, #378) ---------------------------------------

async function historyGet<T>(
	path: string,
	parse: (raw: unknown) => T,
): Promise<T> {
	const res = await fetch(`${getApiBaseUrl()}${path}`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.json()) as { code?: string; error?: string };
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		throw new HttpError(
			res.status,
			`Request failed with status ${res.status}`,
			{ code },
		);
	}
	return parse(await res.json());
}

/** GET /api/student/history/month?ym= — các ngày có hoạt động của tháng. */
export async function fetchHistoryMonth(
	ym: string,
): Promise<HistoryMonthResponse> {
	return historyGet(
		`/api/student/history/month?ym=${encodeURIComponent(ym)}`,
		(raw) => historyMonthResponseSchema.parse(raw),
	);
}

export function useHistoryMonth(ym: string) {
	return useQuery({
		queryKey: ["student", "history", "month", ym] as const,
		queryFn: () => fetchHistoryMonth(ym),
		staleTime: 30_000,
	});
}

/** GET /api/student/history/week?monday= — bảng tuần theo kỹ năng. */
export async function fetchHistoryWeek(
	monday: string,
): Promise<HistoryWeekResponse> {
	return historyGet(
		`/api/student/history/week?monday=${encodeURIComponent(monday)}`,
		(raw) => historyWeekResponseSchema.parse(raw),
	);
}

export function useHistoryWeek(monday: string) {
	return useQuery({
		queryKey: ["student", "history", "week", monday] as const,
		queryFn: () => fetchHistoryWeek(monday),
		staleTime: 30_000,
	});
}

/** GET /api/student/history?skill=&page= — danh sách chi tiết phân trang.
 * `enabled=false` cho phép trang Practice đếm HistoryButton mà không phát
 * request ở nơi không cần (skill vocabulary). */
export async function fetchHistoryList(filters: {
	skill?: HistorySkill;
	page?: number;
}): Promise<HistoryListResponse> {
	const params = new URLSearchParams();
	if (filters.skill) params.set("skill", filters.skill);
	if (filters.page && filters.page > 1)
		params.set("page", String(filters.page));
	const query = params.toString();
	return historyGet(`/api/student/history${query ? `?${query}` : ""}`, (raw) =>
		historyListResponseSchema.parse(raw),
	);
}

export function useHistoryList(
	filters: { skill?: HistorySkill; page?: number },
	enabled = true,
) {
	return useQuery({
		queryKey: [
			"student",
			"history",
			"list",
			filters.skill ?? "all",
			filters.page ?? 1,
		] as const,
		queryFn: () => fetchHistoryList(filters),
		enabled,
		staleTime: 30_000,
	});
}

export function useStudentNotifications() {
	return useQuery({
		queryKey: ["student", "notifications"],
		queryFn: fetchStudentNotifications,
		staleTime: 10_000,
		refetchInterval: 15_000,
	});
}

// --- Inbox in-app (TOS-21 D7) ----------------------------------------------

export async function fetchStudentInbox(): Promise<StudentInboxResponse> {
	return historyGet("/api/student/inbox", (raw) =>
		studentInboxResponseSchema.parse(raw),
	);
}

export async function markInboxRead(id: string): Promise<{ ok: boolean }> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/inbox/${encodeURIComponent(id)}/read`,
		{
			method: "POST",
			headers: getStudentHeaders({ "Content-Type": "application/json" }),
			credentials: "include",
		},
	);
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed with status ${res.status}`);
	}
	return { ok: true };
}

export function useStudentInbox() {
	return useQuery({
		queryKey: ["student", "inbox"],
		queryFn: fetchStudentInbox,
		staleTime: 10_000,
		refetchInterval: 15_000,
	});
}

export function useMarkInboxRead() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: markInboxRead,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["student", "inbox"] });
		},
	});
}

export function useStudentOrgs() {
	return useQuery({
		queryKey: ["student", "orgs"],
		queryFn: fetchStudentOrgs,
		staleTime: 30_000,
	});
}

export function useAcceptInvitation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: acceptStudentInvitation,
		onSuccess: (data) => {
			if (data.orgId) {
				setActiveStudentOrgId(data.orgId);
			}
			void queryClient.invalidateQueries({ queryKey: ["student"] });
		},
	});
}

export function useRejectInvitation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: rejectStudentInvitation,
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["student", "notifications"],
			});
		},
	});
}

export function useSubmitOnboarding() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: submitOnboarding,
		onSuccess: (data) => {
			queryClient.setQueryData(["student", "me"], data);
			void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
		},
	});
}

export function useAcceptClassEnrollment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: acceptClassEnrollment,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
		},
	});
}

// --- Học phí (#320) -------------------------------------------------------

/** Unsettled tuition invoices of THIS student in the CURRENT org. */
export async function fetchStudentInvoices(): Promise<StudentInvoiceItem[]> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/invoices`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed with status ${res.status}`);
	}
	return (await res.json()) as StudentInvoiceItem[];
}

export function useStudentInvoices() {
	return useQuery({
		queryKey: ["student", "invoices"],
		queryFn: fetchStudentInvoices,
		staleTime: 30_000,
	});
}

export async function fetchStudentInvoicePayment(
	invoiceId: string,
): Promise<PaymentInstructions> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invoices/${invoiceId}/payment`,
		{
			method: "GET",
			headers: getStudentHeaders(),
			credentials: "include",
		},
	);
	if (!res.ok) {
		throw new HttpError(res.status, `Request failed with status ${res.status}`);
	}
	return (await res.json()) as PaymentInstructions;
}
