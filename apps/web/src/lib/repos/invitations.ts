import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import type { StudentInvitationItem } from "@teacher-os/api/contracts";
import { getApiBaseUrl } from "./settings";

export const pendingInvitationsQueryKey = ["students", "invitations"] as const;

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
		const data = (await res.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
		};
		const error = new Error(
			data.error || `Failed to send invitation: ${res.status}`,
		) as Error & { code?: string; status: number };
		error.code = data.code;
		error.status = res.status;
		throw error;
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
		const data = (await res.json().catch(() => ({}))) as {
			error?: string;
			code?: string;
		};
		const error = new Error(
			data.error || `Failed to cancel invitation: ${res.status}`,
		) as Error & { code?: string; status: number };
		error.code = data.code;
		error.status = res.status;
		throw error;
	}
	return (await res.json()) as { ok: boolean };
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
