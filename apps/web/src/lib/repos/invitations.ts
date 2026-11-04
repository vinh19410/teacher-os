import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type {
	StudentInvitationItem,
	StudentInviteResendResponse,
} from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "./api-base-url";
import { kernelQueryKey } from "./kernel";

export const pendingInvitationsQueryKey = ["students", "invitations"] as const;

export interface InviteApiError extends Error {
	code?: string;
	status: number;
	invitationId?: string;
	existingStudentId?: string;
	existingStudentName?: string;
	portalLinked?: boolean;
	retryAfterSeconds?: number;
}

async function buildInviteApiError(
	res: Response,
	fallbackMessage: string,
): Promise<InviteApiError> {
	const raw: unknown = await res.json().catch(() => ({}));
	const data =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const message =
		typeof data.error === "string" && data.error.trim().length > 0
			? data.error
			: fallbackMessage;
	const error = new Error(message) as InviteApiError;
	error.status = res.status;
	if (typeof data.code === "string") error.code = data.code;
	if (typeof data.invitationId === "string") {
		error.invitationId = data.invitationId;
	}
	if (typeof data.existingStudentId === "string") {
		error.existingStudentId = data.existingStudentId;
	}
	if (typeof data.existingStudentName === "string") {
		error.existingStudentName = data.existingStudentName;
	}
	if (typeof data.portalLinked === "boolean") {
		error.portalLinked = data.portalLinked;
	}
	if (typeof data.retryAfterSeconds === "number") {
		error.retryAfterSeconds = data.retryAfterSeconds;
	}
	return error;
}

export async function fetchPendingInvitations(
	baseUrl: string = getApiBaseUrl(),
	signal?: AbortSignal,
): Promise<StudentInvitationItem[]> {
	const res = await fetch(`${baseUrl}/api/students/invitations`, {
		method: "GET",
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch invitations: ${res.status}`);
	}
	return (await res.json()) as StudentInvitationItem[];
}

export async function sendStudentInvitation(
	email: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<StudentInvitationItem> {
	const res = await fetch(`${baseUrl}/api/students/invite`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		credentials: "include",
		body: JSON.stringify({ email }),
	});
	if (!res.ok) {
		throw await buildInviteApiError(
			res,
			`Failed to send invitation: ${res.status}`,
		);
	}
	return (await res.json()) as StudentInvitationItem;
}

export async function cancelStudentInvitation(
	id: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<{ ok: boolean }> {
	const res = await fetch(
		`${baseUrl}/api/students/invitations/${encodeURIComponent(id)}`,
		{
			method: "DELETE",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
		},
	);
	if (!res.ok) {
		throw await buildInviteApiError(
			res,
			`Failed to cancel invitation: ${res.status}`,
		);
	}
	return (await res.json()) as { ok: boolean };
}

export async function resendStudentInvitation(
	id: string,
	baseUrl: string = getApiBaseUrl(),
): Promise<StudentInviteResendResponse> {
	const res = await fetch(
		`${baseUrl}/api/students/invitations/${encodeURIComponent(id)}/resend`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: "{}",
		},
	);
	if (!res.ok) {
		throw await buildInviteApiError(
			res,
			`Failed to resend invitation: ${res.status}`,
		);
	}
	return (await res.json()) as StudentInviteResendResponse;
}

export async function resendStudentProfileInvite(
	input: { studentId: string; enrollmentId?: string },
	baseUrl: string = getApiBaseUrl(),
): Promise<StudentInviteResendResponse> {
	const res = await fetch(
		`${baseUrl}/api/students/${encodeURIComponent(input.studentId)}/resend-invite`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			credentials: "include",
			body: JSON.stringify(
				input.enrollmentId ? { enrollmentId: input.enrollmentId } : {},
			),
		},
	);
	if (!res.ok) {
		throw await buildInviteApiError(
			res,
			`Failed to resend student invite: ${res.status}`,
		);
	}
	return (await res.json()) as StudentInviteResendResponse;
}

export function pendingInvitationsQueryOptions(
	baseUrl: string = getApiBaseUrl(),
) {
	return queryOptions({
		queryKey: pendingInvitationsQueryKey,
		queryFn: ({ signal }) => fetchPendingInvitations(baseUrl, signal),
		staleTime: 10_000,
	});
}

export function usePendingInvitations(baseUrl: string = getApiBaseUrl()) {
	return useQuery(pendingInvitationsQueryOptions(baseUrl));
}

export function useInviteStudent(baseUrl: string = getApiBaseUrl()) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (email: string) => sendStudentInvitation(email, baseUrl),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: pendingInvitationsQueryKey,
			});
		},
	});
}

export function useCancelInvitation(baseUrl: string = getApiBaseUrl()) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => cancelStudentInvitation(id, baseUrl),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: pendingInvitationsQueryKey,
			});
		},
	});
}

export function useResendInvitation(baseUrl: string = getApiBaseUrl()) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => resendStudentInvitation(id, baseUrl),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: pendingInvitationsQueryKey,
			});
		},
		onError: (err: unknown) => {
			if (
				err &&
				typeof err === "object" &&
				"status" in err &&
				err.status === 404
			) {
				void queryClient.invalidateQueries({
					queryKey: pendingInvitationsQueryKey,
				});
			}
		},
	});
}

export function useResendStudentInvite(baseUrl: string = getApiBaseUrl()) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: { studentId: string; enrollmentId?: string }) =>
			resendStudentProfileInvite(input, baseUrl),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: kernelQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: pendingInvitationsQueryKey,
			});
		},
	});
}
