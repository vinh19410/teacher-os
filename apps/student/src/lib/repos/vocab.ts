import { useQuery } from "@tanstack/react-query";
import {
	type VocabAnswerInput,
	type VocabCardMutationResponse,
	type VocabLearnCommitInput,
	type VocabOverview,
	type VocabSessionData,
	type VocabSuggestionMutationResponse,
	vocabCardMutationResponseSchema,
	vocabOverviewSchema,
	vocabSessionDataSchema,
	vocabSuggestionMutationResponseSchema,
} from "@teacher-os/api/contracts";
import { HttpError } from "@/lib/query-client";
import { getApiBaseUrl, getStudentHeaders } from "./student";

async function parseErrorAndThrow(res: Response): Promise<never> {
	let code: string | undefined;
	try {
		const body = (await res.json()) as { code?: string; error?: string };
		code = body.code ?? body.error;
	} catch {
		// Non-JSON error body
	}
	throw new HttpError(res.status, `Request failed with status ${res.status}`, {
		code,
	});
}

export async function fetchVocabOverview(): Promise<VocabOverview> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/overview`, {
		method: "GET",
		headers: getStudentHeaders(),
		credentials: "include",
	});
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabOverviewSchema.parse(data);
}

export async function fetchVocabSessionData(
	deckId: string,
): Promise<VocabSessionData> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/decks/${encodeURIComponent(deckId)}/session-data`,
		{
			method: "GET",
			headers: getStudentHeaders(),
			credentials: "include",
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabSessionDataSchema.parse(data);
}

export async function postVocabAnswer(
	payload: VocabAnswerInput,
): Promise<VocabCardMutationResponse> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/answer`, {
		method: "POST",
		headers: getStudentHeaders({
			"Content-Type": "application/json",
		}),
		credentials: "include",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabCardMutationResponseSchema.parse(data);
}

export async function postVocabLearnCommit(
	payload: VocabLearnCommitInput,
): Promise<VocabCardMutationResponse> {
	const res = await fetch(`${getApiBaseUrl()}/api/student/vocab/learn-commit`, {
		method: "POST",
		headers: getStudentHeaders({
			"Content-Type": "application/json",
		}),
		credentials: "include",
		body: JSON.stringify(payload),
	});
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabCardMutationResponseSchema.parse(data);
}

export async function fetchVocabAudioObjectUrl(
	wordId: string,
	signal?: AbortSignal,
): Promise<string> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/audio/${encodeURIComponent(wordId)}`,
		{
			method: "GET",
			headers: getStudentHeaders({ Accept: "audio/*" }),
			credentials: "include",
			signal,
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const blob = await res.blob();
	return URL.createObjectURL(blob);
}

export async function acceptVocabSuggestion(
	id: string,
): Promise<VocabSuggestionMutationResponse> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/suggestions/${encodeURIComponent(id)}/accept`,
		{
			method: "POST",
			headers: getStudentHeaders({
				"Content-Type": "application/json",
			}),
			credentials: "include",
			body: JSON.stringify({}),
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabSuggestionMutationResponseSchema.parse(data);
}

export async function dismissVocabSuggestion(
	id: string,
): Promise<VocabSuggestionMutationResponse> {
	const res = await fetch(
		`${getApiBaseUrl()}/api/student/vocab/suggestions/${encodeURIComponent(id)}/dismiss`,
		{
			method: "POST",
			headers: getStudentHeaders({
				"Content-Type": "application/json",
			}),
			credentials: "include",
			body: JSON.stringify({}),
		},
	);
	if (!res.ok) {
		await parseErrorAndThrow(res);
	}
	const data = (await res.json()) as unknown;
	return vocabSuggestionMutationResponseSchema.parse(data);
}

export function useVocabOverview() {
	return useQuery({
		queryKey: ["student", "vocab-overview"],
		queryFn: fetchVocabOverview,
	});
}

export function useVocabSessionData(deckId: string) {
	return useQuery({
		queryKey: ["student", "vocab-session-data", deckId],
		queryFn: () => fetchVocabSessionData(deckId),
	});
}
