import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
	ACCOUNT_ERROR_CODES,
	STUDENT_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { authClient } from "@/lib/auth-client";
import {
	clearActiveStudentOrgId,
	getActiveStudentOrgId,
	syncActiveStudentUser,
} from "@/lib/student-org-storage";
import { validateReturnUrl } from "@/lib/validate-return-url";

export class HttpError extends Error {
	readonly status: number;
	readonly code?: string;
	readonly sentOrgId?: string;

	constructor(
		status: number,
		message: string,
		options?: { code?: string; sentOrgId?: string },
	) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.code = options?.code;
		this.sentOrgId = options?.sentOrgId;
	}
}

export function isHttpError(error: unknown): error is HttpError {
	return error instanceof HttpError;
}

export function isStudentOrgMismatchError(error: unknown): error is HttpError {
	return (
		isHttpError(error) &&
		error.status === 403 &&
		error.code === STUDENT_ERROR_CODES.ORG_MISMATCH
	);
}

export function isTeacherOnStudentPortalError(
	error: unknown,
): error is HttpError {
	return (
		isHttpError(error) &&
		error.status === 403 &&
		error.code === ACCOUNT_ERROR_CODES.TEACHER_ON_STUDENT_PORTAL
	);
}

export function healStudentOrgMismatch(
	client: QueryClient = studentQueryClient,
): void {
	clearActiveStudentOrgId();
	void client.invalidateQueries({ queryKey: ["student"] });
}

let reauthing = false;
let redirectingForWrongRole = false;
let lastAuthenticatedUserId: string | null = null;

/**
 * Đồng bộ danh tính phiên hiện tại với cả `localStorage` lẫn RAM `QueryClient`
 * (#675 review F2): khi hết phiên hoặc chuyển từ tài khoản A sang B qua SPA /
 * đa tab, xoá sạch cache trong bộ nhớ để tài khoản mới không đọc nhầm dữ liệu
 * `["student", "me"]` / `["student", "overview"]` của tài khoản trước.
 */
export function syncStudentSessionUser(
	userId: string | null | undefined,
	client: QueryClient = studentQueryClient,
): void {
	const trimmed = userId?.trim() || null;
	syncActiveStudentUser(trimmed);
	if (trimmed === null) {
		if (lastAuthenticatedUserId !== null) {
			lastAuthenticatedUserId = null;
			client.clear();
		}
		return;
	}
	if (lastAuthenticatedUserId !== null && lastAuthenticatedUserId !== trimmed) {
		client.clear();
	}
	lastAuthenticatedUserId = trimmed;
}

export function resetStudentSessionUserForTests(): void {
	lastAuthenticatedUserId = null;
}

export function resetRedirectGuardsForTests(): void {
	reauthing = false;
	redirectingForWrongRole = false;
}

if (typeof window !== "undefined") {
	window.addEventListener("pageshow", (event) => {
		if (event.persisted) {
			reauthing = false;
			redirectingForWrongRole = false;
		}
	});
}

export function reauth(): void {
	if (reauthing) return;
	reauthing = true;
	syncStudentSessionUser(null);
	void authClient.signOut().catch(() => undefined);
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = validateReturnUrl(current);
	window.location.assign(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}

export function redirectToLoginForWrongRole(
	client: QueryClient = studentQueryClient,
): void {
	syncStudentSessionUser(null, client);
	client.clear();
	authClient.clearSessionCache?.();
	if (typeof window === "undefined") return;
	if (window.location.pathname === "/login") return;
	if (redirectingForWrongRole) return;
	redirectingForWrongRole = true;
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	const returnUrl = validateReturnUrl(current);
	window.location.assign(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
}

export function createStudentQueryClient(): QueryClient {
	let client!: QueryClient;
	client = new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 60_000,
				gcTime: 5 * 60_000,
				refetchOnWindowFocus: false,
				refetchOnReconnect: false,
				retry: (failureCount, error) => {
					if (
						failureCount < 1 &&
						isStudentOrgMismatchError(error) &&
						error.sentOrgId
					) {
						if (getActiveStudentOrgId() === error.sentOrgId) {
							clearActiveStudentOrgId();
							void client.invalidateQueries({
								queryKey: ["student", "orgs"],
								exact: true,
							});
						}
						return true;
					}
					return false;
				},
				retryDelay: (attemptIndex, error) =>
					isStudentOrgMismatchError(error)
						? 0
						: Math.min(1000 * 2 ** attemptIndex, 30_000),
				networkMode: "offlineFirst",
			},
		},
		queryCache: new QueryCache({
			onError: (error) => {
				if (isHttpError(error) && error.status === 401) {
					reauth();
					return;
				}
				if (isTeacherOnStudentPortalError(error)) {
					redirectToLoginForWrongRole(client);
					return;
				}
				if (isStudentOrgMismatchError(error) && error.sentOrgId) {
					healStudentOrgMismatch(client);
				}
			},
		}),
		mutationCache: new MutationCache({
			onError: (error) => {
				if (isHttpError(error) && error.status === 401) {
					reauth();
					return;
				}
				if (isTeacherOnStudentPortalError(error)) {
					redirectToLoginForWrongRole(client);
					return;
				}
				if (isStudentOrgMismatchError(error)) {
					healStudentOrgMismatch(client);
				}
			},
		}),
	});
	return client;
}

/**
 * App-scoped QueryClient duy nhất của student app — main.tsx mount vào
 * Provider và route loader (#283) dùng cho ensureQueryData để hai phía chia
 * cùng một cache.
 */
export const studentQueryClient = createStudentQueryClient();
