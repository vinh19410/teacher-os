import {
	CLASS_ERROR_CODES,
	type ClassConfirmOpeningInput,
	type ClassConfirmOpeningResponse,
	classConfirmOpeningResponseSchema,
} from "@teacher-os/api/contracts";
import { reauth } from "@/lib/reauth";
import { getApiBaseUrl } from "./api-base-url";

export class ClassOpeningApiError extends Error {
	readonly status: number;
	readonly code?: string;

	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = "ClassOpeningApiError";
		this.status = status;
		this.code = code;
	}
}

function defaultErrorMessage(status: number, code?: string): string {
	if (status === 401) {
		return "Phiên đăng nhập đã hết hạn. Đang chuyển hướng đăng nhập…";
	}
	if (code === CLASS_ERROR_CODES.OPENING_VERSION_CONFLICT) {
		return "Thông tin chốt khai giảng vừa thay đổi từ thao tác khác. Dữ liệu lớp đã được làm mới, vui lòng kiểm tra lại.";
	}
	if (code === CLASS_ERROR_CODES.CLASS_PAUSED) {
		return "Lớp đang tạm dừng — không thể chốt khai giảng lúc này.";
	}
	if (code === CLASS_ERROR_CODES.SCHEDULE_LOCKED) {
		return "Lớp đã có buổi học thực tế nên không thể đổi ngày khai giảng.";
	}
	return "Không thể chốt khai giảng. Vui lòng thử lại.";
}

async function buildClassOpeningApiError(
	res: Response,
): Promise<ClassOpeningApiError> {
	const raw: unknown = await res.json().catch(() => ({}));
	const data =
		raw && typeof raw === "object" && !Array.isArray(raw)
			? (raw as Record<string, unknown>)
			: {};
	const code =
		typeof data.code === "string" && data.code.trim().length > 0
			? data.code.trim()
			: undefined;
	const message =
		typeof data.error === "string" && data.error.trim().length > 0
			? data.error.trim()
			: defaultErrorMessage(res.status, code);
	return new ClassOpeningApiError(message, res.status, code);
}

export async function confirmClassOpening(
	classId: string,
	input: ClassConfirmOpeningInput,
	baseUrl: string = getApiBaseUrl(),
): Promise<ClassConfirmOpeningResponse> {
	const url = `${baseUrl}/api/classes/${encodeURIComponent(classId)}/confirm-opening`;
	const res = await fetch(url, {
		method: "POST",
		credentials: "include",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(input),
	});

	if (!res.ok) {
		if (res.status === 401) {
			reauth();
		}
		throw await buildClassOpeningApiError(res);
	}

	return classConfirmOpeningResponseSchema.parse(await res.json());
}
