import { useQuery } from "@tanstack/react-query";
import {
	type StudentMe,
	type StudentOverview,
	studentMeSchema,
	studentOverviewSchema,
} from "@teacher-os/api/contracts";
import { env } from "@teacher-os/env/web";
import { HttpError } from "@/lib/query-client";

function getApiBaseUrl(): string {
	const raw = env.VITE_SERVER_URL;
	return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export async function fetchStudentMe(): Promise<StudentMe> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/me`, {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
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

export async function fetchStudentOverview(): Promise<StudentOverview> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/overview`, {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
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

export function useStudentMe() {
	return useQuery({
		queryKey: ["student", "me"],
		queryFn: fetchStudentMe,
		staleTime: 60_000,
	});
}

export function useStudentOverview() {
	return useQuery({
		queryKey: ["student", "overview"],
		queryFn: fetchStudentOverview,
		staleTime: 60_000,
	});
}
