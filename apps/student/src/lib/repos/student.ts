import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ACCOUNT_ERROR_CODES,
	CLASS_ERROR_CODES,
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
	STUDENT_ERROR_CODES,
	type StudentClass,
	type StudentClassDetail,
	type StudentInboxResponse,
	type StudentInvitationItem,
	type StudentInvoiceItem,
	type StudentMe,
	type StudentOnboardingPayload,
	type StudentOrgItem,
	type StudentOverview,
	type StudentScheduleResponse,
	type StudentZoomJoinError,
	type StudentZoomJoinResponse,
	studentClassDetailSchema,
	studentInboxResponseSchema,
	studentMeSchema,
	studentOverviewSchema,
	studentScheduleResponseSchema,
	studentZoomJoinErrorSchema,
	studentZoomJoinResponseSchema,
} from "@teacher-os/api/contracts";
import type {
	StudentClassMaterialListResponse,
	StudentClassMaterialView,
	StudentLessonMaterialListResponse,
	StudentLessonMaterialView,
} from "@teacher-os/api/material-contracts";
import { env } from "@teacher-os/env/web";
import { isPreviewableContentType } from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { useSyncExternalStore } from "react";
import {
	HttpError,
	isHttpError,
	isTeacherOnStudentPortalError,
	reauth,
	redirectToLoginForWrongRole,
	studentQueryClient,
} from "@/lib/query-client";
import {
	clearActiveStudentOrgId,
	getActiveStudentOrgId,
	setActiveStudentOrgId,
	subscribeActiveStudentOrg,
} from "@/lib/student-org-storage";

export {
	clearActiveStudentOrgId,
	getActiveStudentOrgId,
	setActiveStudentOrgId,
};

export function getApiBaseUrl(): string {
	const raw = env.VITE_SERVER_URL;
	return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function getStudentHeaders(
	extra: Record<string, string> = {},
	explicitOrgId?: string | null,
): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/json",
		...extra,
	};
	const activeOrgId =
		explicitOrgId !== undefined ? explicitOrgId : getActiveStudentOrgId();
	if (activeOrgId) {
		headers["x-student-org-id"] = activeOrgId;
	}
	return headers;
}

async function throwStudentHttpError(
	res: Response,
	sentOrgId: string | undefined,
	fallbackMessage = `Request failed with status ${res.status}`,
	useBodyErrorAsMessage = false,
	parsedBody?: unknown,
): Promise<never> {
	let code: string | undefined;
	let message = fallbackMessage;
	try {
		const body = (parsedBody !== undefined ? parsedBody : await res.json()) as {
			code?: string;
			error?: string;
		} | null;
		if (body && typeof body === "object") {
			code = body.code ?? body.error;
			if (useBodyErrorAsMessage && body.error) {
				message = body.error;
			}
		}
	} catch {
		// Non-JSON body
	}
	const error = new HttpError(res.status, message, {
		code,
		sentOrgId,
	});
	if (isTeacherOnStudentPortalError(error)) {
		redirectToLoginForWrongRole();
	}
	throw error;
}

export async function fetchStudentMe(): Promise<StudentMe> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/me`, {
		method: "GET",
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	const data = (await res.json()) as unknown;
	return studentMeSchema.parse(data);
}

export async function submitOnboarding(
	payload: StudentOnboardingPayload,
	explicitOrgId?: string,
): Promise<StudentMe> {
	const headers = getStudentHeaders(
		{
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		explicitOrgId,
	);
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/onboarding`, {
		method: "POST",
		headers,
		credentials: "include",
		body: JSON.stringify(payload),
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	const data = (await res.json()) as unknown;
	return studentMeSchema.parse(data);
}

export async function fetchStudentOverview(): Promise<StudentOverview> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/overview`, {
		method: "GET",
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	const data = (await res.json()) as unknown;
	return studentOverviewSchema.parse(data);
}

export async function fetchStudentSchedule(): Promise<StudentScheduleResponse> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/schedule`, {
		method: "GET",
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	const data = (await res.json()) as unknown;
	return studentScheduleResponseSchema.parse(data);
}

export async function fetchStudentClassDetail(
	classId: string,
): Promise<StudentClassDetail> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	const data = (await res.json()) as unknown;
	return studentClassDetailSchema.parse(data);
}

export type StudentZoomJoinResult =
	| { ok: true; data: StudentZoomJoinResponse }
	| { ok: false; status: number; error: StudentZoomJoinError };

const ZOOM_JOIN_AUTH_ERROR_CODES = new Set<string>([
	ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL,
	STUDENT_ERROR_CODES.EMAIL_UNVERIFIED,
	STUDENT_ERROR_CODES.NOT_LINKED,
	STUDENT_ERROR_CODES.ORG_MISMATCH,
]);

export async function requestStudentZoomJoin(
	classId: string,
	date: string,
): Promise<StudentZoomJoinResult> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}/sessions/${encodeURIComponent(date)}/zoom-join`,
		{
			method: "GET",
			headers,
			credentials: "include",
			cache: "no-store",
		},
	);

	if (res.ok) {
		const data = (await res.json()) as unknown;
		return { ok: true, data: studentZoomJoinResponseSchema.parse(data) };
	}

	if (res.status === 401) {
		return await throwStudentHttpError(res, sentOrgId);
	}

	if (
		res.status === 400 ||
		res.status === 403 ||
		res.status === 404 ||
		res.status === 409
	) {
		let raw: unknown;
		try {
			raw = await res.json();
		} catch {
			return await throwStudentHttpError(
				res,
				sentOrgId,
				undefined,
				false,
				null,
			);
		}
		const parsed = studentZoomJoinErrorSchema.safeParse(raw);
		if (parsed.success && !ZOOM_JOIN_AUTH_ERROR_CODES.has(parsed.data.code)) {
			return { ok: false, status: res.status, error: parsed.data };
		}
		return await throwStudentHttpError(res, sentOrgId, undefined, false, raw);
	}

	return await throwStudentHttpError(res, sentOrgId);
}

export async function fetchStudentNotifications(): Promise<
	StudentInvitationItem[]
> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/notifications`, {
		method: "GET",
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}

	return (await res.json()) as StudentInvitationItem[];
}

export async function acceptStudentInvitation(
	id: string,
): Promise<{ ok: boolean; orgId: string }> {
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invitations/${encodeURIComponent(id)}/accept`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);

	if (!res.ok) {
		await throwStudentHttpError(
			res,
			sentOrgId,
			`Failed to accept invitation: ${res.status}`,
			true,
		);
	}

	return (await res.json()) as { ok: boolean; orgId: string };
}

export async function rejectStudentInvitation(
	id: string,
): Promise<{ ok: boolean }> {
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invitations/${encodeURIComponent(id)}/reject`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);

	if (!res.ok) {
		await throwStudentHttpError(
			res,
			sentOrgId,
			`Failed to reject invitation: ${res.status}`,
			true,
		);
	}

	return (await res.json()) as { ok: boolean };
}

export async function acceptClassEnrollment(
	enrollmentId: string,
): Promise<{ ok: boolean }> {
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/enrollments/${encodeURIComponent(enrollmentId)}/accept`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);

	if (!res.ok) {
		await throwStudentHttpError(
			res,
			sentOrgId,
			`Failed to accept enrollment: ${res.status}`,
			true,
		);
	}

	return (await res.json()) as { ok: boolean };
}

export async function fetchStudentOrgs(): Promise<StudentOrgItem[]> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/orgs`, {
		method: "GET",
		headers,
		credentials: "include",
	});

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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
	const activeOrgId = useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
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
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}/classmates`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);

	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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

function classMaterialsPath(classId: string): string {
	return `${getApiBaseUrl()}/api/student/classes/${encodeURIComponent(classId)}/materials`;
}

function appendMaterialFileParams(baseUrl: string, download: boolean): string {
	const params = new URLSearchParams();
	if (download) params.set("download", "1");
	// Thẻ media và link tải không gửi được header x-student-org-id.
	const orgId = getActiveStudentOrgId();
	if (orgId) params.set("org", orgId);
	const query = params.toString();
	return `${baseUrl}${query ? `?${query}` : ""}`;
}

/** URL stream file của một tài liệu trong buổi học (`download` → attachment). */
export function lessonMaterialFileUrl(
	classId: string,
	date: string,
	materialId: string,
	download = false,
): string {
	return appendMaterialFileParams(
		`${lessonMaterialsPath(classId, date)}/${encodeURIComponent(materialId)}/file`,
		download,
	);
}

/** URL stream file của một tài liệu chung cấp lớp (`download` → attachment). */
export function classMaterialFileUrl(
	classId: string,
	materialId: string,
	download = false,
): string {
	return appendMaterialFileParams(
		`${classMaterialsPath(classId)}/${encodeURIComponent(materialId)}/file`,
		download,
	);
}

/**
 * Tải file tài liệu về `blob:` URL để xem trước inline trong app (server trả
 * `attachment` + CSP khoá cứng). Xử lý 401 `reauth()`, 403
 * `STUDENT_ORG_MISMATCH` tự xoá org stale và thử lại 1 lần, kiểm sai vai trò
 * giáo viên trên portal học viên, và kiểm `Content-Type` allowlist trước
 * `URL.createObjectURL`.
 */
async function fetchStudentMaterialBlobUrl(
	url: string,
	signal?: AbortSignal,
): Promise<string> {
	const headers = getStudentHeaders({ Accept: "*/*" });
	const sentOrgId = headers["x-student-org-id"];
	let res = await fetch(url, {
		method: "GET",
		headers,
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		let code: string | undefined;
		try {
			const body = (await res.clone().json()) as {
				code?: string;
				error?: string;
			};
			code = body.code ?? body.error;
		} catch {
			// Non-JSON body
		}
		if (
			res.status === 403 &&
			code === STUDENT_ERROR_CODES.ORG_MISMATCH &&
			sentOrgId
		) {
			if (getActiveStudentOrgId() === sentOrgId) {
				clearActiveStudentOrgId();
				void studentQueryClient.invalidateQueries({
					queryKey: ["student", "orgs"],
					exact: true,
				});
			}
			res = await fetch(url, {
				method: "GET",
				headers: getStudentHeaders({ Accept: "*/*" }, null),
				credentials: "include",
				signal,
			});
			if (!res.ok) {
				if (res.status === 401) reauth();
				await throwStudentHttpError(res, undefined);
			}
		} else {
			if (res.status === 401) reauth();
			const error = new HttpError(
				res.status,
				`Request failed with status ${res.status}`,
				{
					code,
					sentOrgId,
				},
			);
			if (isTeacherOnStudentPortalError(error)) {
				redirectToLoginForWrongRole();
			}
			throw error;
		}
	}
	if (!isPreviewableContentType(res.headers.get("content-type"))) {
		void res.body?.cancel().catch(() => {});
		throw new HttpError(415, "Unsupported preview media type", {
			code: "UNSUPPORTED_FILE_TYPE",
		});
	}
	return URL.createObjectURL(await res.blob());
}

/** Tải file tài liệu buổi học về `blob:` URL để xem trước inline trong app. */
export async function fetchLessonMaterialBlobUrl(
	classId: string,
	date: string,
	materialId: string,
	signal?: AbortSignal,
): Promise<string> {
	return fetchStudentMaterialBlobUrl(
		`${lessonMaterialsPath(classId, date)}/${encodeURIComponent(materialId)}/file`,
		signal,
	);
}

/** Tải file tài liệu chung của lớp về `blob:` URL để xem trước inline trong app. */
export async function fetchClassMaterialBlobUrl(
	classId: string,
	materialId: string,
	signal?: AbortSignal,
): Promise<string> {
	return fetchStudentMaterialBlobUrl(
		`${classMaterialsPath(classId)}/${encodeURIComponent(materialId)}/file`,
		signal,
	);
}

export async function fetchLessonMaterials(
	classId: string,
	date: string,
): Promise<StudentLessonMaterialView[]> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(lessonMaterialsPath(classId, date), {
		method: "GET",
		headers,
		credentials: "include",
	});
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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

export async function fetchClassMaterials(
	classId: string,
	signal?: AbortSignal,
): Promise<StudentClassMaterialView[]> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(classMaterialsPath(classId), {
		method: "GET",
		headers,
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}
	const data = (await res.json()) as Partial<StudentClassMaterialListResponse>;
	return Array.isArray(data.items) ? data.items : [];
}

/** Tài liệu chung cấp lớp — chỉ bật khi học viên mở tab Tài liệu chung. */
export function useClassMaterials(classId: string, enabled = true) {
	return useQuery({
		queryKey: ["student", "class", classId, "shared-materials"],
		queryFn: ({ signal }) => fetchClassMaterials(classId, signal),
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
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/practice?${params.toString()}`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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

// --- Lịch sử học tập (phase 11, #378) ---------------------------------------

async function historyGet<T>(
	path: string,
	parse: (raw: unknown) => T,
): Promise<T> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}${path}`, {
		method: "GET",
		headers,
		credentials: "include",
	});
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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
	const headers = getStudentHeaders({ "Content-Type": "application/json" });
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/inbox/${encodeURIComponent(id)}/read`,
		{
			method: "POST",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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

export function useSubmitOnboarding(explicitOrgId?: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (payload: StudentOnboardingPayload) =>
			submitOnboarding(payload, explicitOrgId),
		onSuccess: (data) => {
			queryClient.setQueryData(["student", "me"], data);
			void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
		},
	});
}

export function countActiveEnrolledClasses(
	classes: readonly Pick<StudentClass, "status" | "enrollmentStatus">[],
): number {
	return classes.filter(
		(c) => c.enrollmentStatus === "active" && c.status === "active",
	).length;
}

export function resolveAcceptEnrollmentErrorMessage(error: unknown): string {
	if (isHttpError(error)) {
		if (error.code === CLASS_ERROR_CODES.CLASS_PAUSED) {
			return "Lớp đang tạm dừng — chưa thể tham gia lúc này.";
		}
		if (error.status === 404) {
			return "Lời mời tham gia lớp không còn hiệu lực.";
		}
	}
	return "Không thể xác nhận tham gia lớp. Vui lòng thử lại.";
}

export function useAcceptClassEnrollment() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: acceptClassEnrollment,
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["student", "overview"] });
			void queryClient.invalidateQueries({ queryKey: ["student", "schedule"] });
			void queryClient.invalidateQueries({ queryKey: ["student", "class"] });
			void queryClient.invalidateQueries({
				queryKey: ["student", "notifications"],
			});
		},
		onError: (error) => {
			if (
				isHttpError(error) &&
				(error.code === CLASS_ERROR_CODES.CLASS_PAUSED ||
					error.status === 404 ||
					error.status === 409)
			) {
				void queryClient.invalidateQueries({
					queryKey: ["student", "overview"],
				});
				void queryClient.invalidateQueries({
					queryKey: ["student", "schedule"],
				});
				void queryClient.invalidateQueries({
					queryKey: ["student", "class"],
				});
				void queryClient.invalidateQueries({
					queryKey: ["student", "notifications"],
				});
			}
		},
	});
}

// --- Học phí (#320) -------------------------------------------------------

/** Unsettled tuition invoices of THIS student in the CURRENT org. */
export async function fetchStudentInvoices(): Promise<StudentInvoiceItem[]> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/invoices`, {
		method: "GET",
		headers,
		credentials: "include",
	});
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
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
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/invoices/${invoiceId}/payment`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await throwStudentHttpError(res, sentOrgId);
	}
	return (await res.json()) as PaymentInstructions;
}
