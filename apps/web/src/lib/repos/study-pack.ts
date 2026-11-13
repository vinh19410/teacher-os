import type {
	AssignStudyPackInput,
	ClassStudyPacksResponse,
	StudyPackCreateInput,
	StudyPackDetailView,
	StudyPackSummaryView,
	StudyPackUpdateInput,
} from "@teacher-os/api/contracts";
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import { getApiBaseUrl } from "./api-base-url";

async function requestJson<T>(
	method: "GET" | "POST" | "PUT" | "DELETE",
	path: string,
	body?: unknown,
	baseUrl: string = getApiBaseUrl(),
): Promise<T> {
	const init: RequestInit = {
		method,
		credentials: "include",
	};
	if (method === "POST" || method === "PUT") {
		init.headers = { "content-type": "application/json" };
		init.body = JSON.stringify(body ?? {});
	}
	const res = await fetch(`${baseUrl}${path}`, init);
	const raw: unknown = await res.json().catch(() => null);
	if (!res.ok) {
		const error =
			raw != null &&
			typeof raw === "object" &&
			"error" in raw &&
			typeof raw.error === "string"
				? raw.error
				: "request-failed";
		throw Object.assign(new Error(error), {
			studyPackErrorCode: error,
			status: res.status,
		});
	}
	return raw as T;
}

export async function fetchStudyPacks(
	baseUrl?: string,
): Promise<{ packs: StudyPackSummaryView[] }> {
	return requestJson<{ packs: StudyPackSummaryView[] }>(
		"GET",
		"/api/study-packs",
		undefined,
		baseUrl,
	);
}

export async function fetchStudyPackDetail(
	packId: string,
	baseUrl?: string,
): Promise<{ pack: StudyPackDetailView }> {
	return requestJson<{ pack: StudyPackDetailView }>(
		"GET",
		`/api/study-packs/${encodeURIComponent(packId)}`,
		undefined,
		baseUrl,
	);
}

export async function createStudyPack(
	input: StudyPackCreateInput,
	baseUrl?: string,
): Promise<{ pack: StudyPackDetailView }> {
	return requestJson<{ pack: StudyPackDetailView }>(
		"POST",
		"/api/study-packs",
		input,
		baseUrl,
	);
}

export async function updateStudyPack(
	packId: string,
	input: StudyPackUpdateInput,
	baseUrl?: string,
): Promise<{ pack: StudyPackDetailView }> {
	return requestJson<{ pack: StudyPackDetailView }>(
		"PUT",
		`/api/study-packs/${encodeURIComponent(packId)}`,
		input,
		baseUrl,
	);
}

export async function deleteStudyPack(
	packId: string,
	baseUrl?: string,
): Promise<{ ok: true }> {
	return requestJson<{ ok: true }>(
		"DELETE",
		`/api/study-packs/${encodeURIComponent(packId)}`,
		undefined,
		baseUrl,
	);
}

export async function cloneStudyPack(
	packId: string,
	baseUrl?: string,
): Promise<{ pack: StudyPackDetailView }> {
	return requestJson<{ pack: StudyPackDetailView }>(
		"POST",
		`/api/study-packs/${encodeURIComponent(packId)}/clone`,
		{},
		baseUrl,
	);
}

export async function fetchClassStudyPacks(
	classId: string,
	baseUrl?: string,
): Promise<ClassStudyPacksResponse> {
	return requestJson<ClassStudyPacksResponse>(
		"GET",
		`/api/classes/${encodeURIComponent(classId)}/study-packs`,
		undefined,
		baseUrl,
	);
}

export async function assignStudyPackToClass(
	classId: string,
	input: AssignStudyPackInput,
	baseUrl?: string,
): Promise<ClassStudyPacksResponse> {
	return requestJson<ClassStudyPacksResponse>(
		"POST",
		`/api/classes/${encodeURIComponent(classId)}/study-packs`,
		input,
		baseUrl,
	);
}

export async function cancelClassStudyPack(
	classId: string,
	classPackId: string,
	baseUrl?: string,
): Promise<ClassStudyPacksResponse> {
	return requestJson<ClassStudyPacksResponse>(
		"DELETE",
		`/api/classes/${encodeURIComponent(classId)}/study-packs/${encodeURIComponent(classPackId)}`,
		undefined,
		baseUrl,
	);
}

export async function fetchStudyPackExerciseAudioObjectUrl(
	exerciseId: string,
	signal?: AbortSignal,
	baseUrl: string = getApiBaseUrl(),
): Promise<string> {
	const res = await fetch(
		`${baseUrl}/api/study-packs/exercises/${encodeURIComponent(exerciseId)}/audio`,
		{ credentials: "include", signal },
	);
	if (!res.ok) {
		await res.body?.cancel().catch(() => {});
		throw new Error(`Audio fetch failed (${res.status})`);
	}
	const rawType = (res.headers.get("Content-Type") ?? "").toLowerCase();
	const mimeType = rawType.split(";")[0]?.trim() ?? "";
	if (!Object.hasOwn(LIBRARY_AUDIO_MIME, mimeType)) {
		await res.body?.cancel().catch(() => {});
		throw new Error("Unexpected listening audio content type");
	}
	const blob = new Blob([await res.blob()], { type: mimeType });
	return URL.createObjectURL(blob);
}
