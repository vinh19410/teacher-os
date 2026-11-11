import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	STUDENT_ERROR_CODES,
	type VocabAnswerInput,
	type VocabCardMutationResponse,
	type VocabLearnCommitInput,
	type VocabOverview,
	type VocabSessionData,
	type VocabStudentLibraryCoursesResponse,
	type VocabStudentLibraryDecksResponse,
	type VocabSuggestionMutationResponse,
	vocabCardMutationResponseSchema,
	vocabOverviewSchema,
	vocabSessionDataSchema,
	vocabStudentLibraryCoursesResponseSchema,
	vocabStudentLibraryDecksResponseSchema,
	vocabSuggestionMutationResponseSchema,
} from "@teacher-os/api/contracts";
import { normalizeMediaType } from "@teacher-os/api/lib/quiz-media";
import {
	HttpError,
	healStudentOrgMismatch,
	studentQueryClient,
} from "@/lib/query-client";
import {
	clearActiveStudentOrgId,
	getActiveStudentOrgId,
} from "@/lib/student-org-storage";
import { getApiBaseUrl, getStudentHeaders } from "./student";

async function extractErrorCode(res: Response): Promise<string | undefined> {
	try {
		const body = (await res.json()) as { code?: string; error?: string };
		return body.code ?? body.error;
	} catch {
		return undefined;
	}
}

async function parseErrorAndThrow(
	res: Response,
	sentOrgId?: string,
): Promise<never> {
	const code = await extractErrorCode(res);
	throw new HttpError(res.status, `Request failed with status ${res.status}`, {
		code,
		sentOrgId,
	});
}

async function parseWriteErrorAndThrow(
	res: Response,
	sentOrgId?: string,
): Promise<never> {
	const code = await extractErrorCode(res);
	if (res.status === 403 && code === STUDENT_ERROR_CODES.ORG_MISMATCH) {
		healStudentOrgMismatch();
	}
	throw new HttpError(res.status, `Request failed with status ${res.status}`, {
		code,
		sentOrgId,
	});
}

export async function fetchVocabOverview(): Promise<VocabOverview> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/overview`, {
		method: "GET",
		headers,
		credentials: "include",
	});
	if (!res.ok) {
		await parseErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabOverviewSchema.parse(data);
}

export async function fetchVocabSessionData(
	deckId: string,
): Promise<VocabSessionData> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/decks/${encodeURIComponent(deckId)}/session-data`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabSessionDataSchema.parse(data);
}

export async function postVocabAnswer(
	payload: VocabAnswerInput,
): Promise<VocabCardMutationResponse> {
	const headers = getStudentHeaders({
		"Content-Type": "application/json",
	});
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/answer`, {
		method: "POST",
		headers,
		credentials: "include",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		await parseWriteErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabCardMutationResponseSchema.parse(data);
}

export async function postVocabLearnCommit(
	payload: VocabLearnCommitInput,
): Promise<VocabCardMutationResponse> {
	const headers = getStudentHeaders({
		"Content-Type": "application/json",
	});
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/learn-commit`, {
		method: "POST",
		headers,
		credentials: "include",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		await parseWriteErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabCardMutationResponseSchema.parse(data);
}

export async function fetchVocabAudioObjectUrl(
	wordId: string,
	signal?: AbortSignal,
): Promise<string> {
	const url = `${getApiBaseUrl()}/api/student/vocab/audio/${encodeURIComponent(wordId)}`;
	const headers = getStudentHeaders({ Accept: "audio/*" });
	const sentOrgId = headers["x-student-org-id"];
	let res = await fetch(url, {
		method: "GET",
		headers,
		credentials: "include",
		signal,
	});
	if (!res.ok) {
		const code = await extractErrorCode(res);
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
				headers: getStudentHeaders({ Accept: "audio/*" }, null),
				credentials: "include",
				signal,
			});
			if (!res.ok) {
				await parseErrorAndThrow(res);
			}
		} else {
			throw new HttpError(
				res.status,
				`Request failed with status ${res.status}`,
				{ code, sentOrgId },
			);
		}
	}
	const type = normalizeMediaType(res.headers.get("Content-Type") ?? "");
	if (!type.startsWith("audio/") || type.length <= "audio/".length) {
		throw new HttpError(res.status, "Unexpected vocab audio content type");
	}
	const blob = new Blob([await res.blob()], { type });
	return URL.createObjectURL(blob);
}

export async function acceptVocabSuggestion(
	id: string,
): Promise<VocabSuggestionMutationResponse> {
	const headers = getStudentHeaders({
		"Content-Type": "application/json",
	});
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/suggestions/${encodeURIComponent(id)}/accept`,
		{
			method: "POST",
			headers,
			credentials: "include",
			body: JSON.stringify({}),
		},
	);
	if (!res.ok) {
		await parseWriteErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabSuggestionMutationResponseSchema.parse(data);
}

export async function dismissVocabSuggestion(
	id: string,
): Promise<VocabSuggestionMutationResponse> {
	const headers = getStudentHeaders({
		"Content-Type": "application/json",
	});
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/suggestions/${encodeURIComponent(id)}/dismiss`,
		{
			method: "POST",
			headers,
			credentials: "include",
			body: JSON.stringify({}),
		},
	);
	if (!res.ok) {
		await parseWriteErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabSuggestionMutationResponseSchema.parse(data);
}

export async function fetchVocabLibraryCourses(): Promise<VocabStudentLibraryCoursesResponse> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/library/courses`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabStudentLibraryCoursesResponseSchema.parse(data);
}

export async function fetchVocabLibraryCourseDecks(
	courseId: string,
): Promise<VocabStudentLibraryDecksResponse> {
	const headers = getStudentHeaders();
	const sentOrgId = headers["x-student-org-id"];
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/library/courses/${encodeURIComponent(courseId)}/decks`,
		{
			method: "GET",
			headers,
			credentials: "include",
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res, sentOrgId);
	}
	const data = (await res.json()) as unknown;
	return vocabStudentLibraryDecksResponseSchema.parse(data);
}

export function useVocabOverview() {
	return useQuery({
		queryKey: ["student", "vocab-overview"],
		queryFn: fetchVocabOverview,
	});
}

export function useVocabSessionData(deckId: string) {
	const queryClient = useQueryClient();
	return useQuery({
		queryKey: ["student", "vocab-session-data", deckId],
		queryFn: async () => {
			const data = await fetchVocabSessionData(deckId);
			void queryClient.invalidateQueries({
				queryKey: ["student", "vocab-overview"],
			});
			void queryClient.invalidateQueries({
				queryKey: ["student", "vocab-library"],
			});
			return data;
		},
	});
}

export function useVocabLibraryCourses() {
	return useQuery({
		queryKey: ["student", "vocab-library", "courses"],
		queryFn: fetchVocabLibraryCourses,
	});
}

export function useVocabLibraryCourseDecks(courseId: string | null) {
	return useQuery({
		queryKey: ["student", "vocab-library", "decks", courseId],
		queryFn: () => fetchVocabLibraryCourseDecks(courseId ?? ""),
		enabled: Boolean(courseId),
	});
}
