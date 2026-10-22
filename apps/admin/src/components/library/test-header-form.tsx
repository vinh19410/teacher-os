import {
	type LibrarySkill,
	type LibraryTestCreate,
	type LibraryTestUpdate,
	libraryTestCreateSchema,
	libraryTestUpdateSchema,
} from "@teacher-os/api/library-contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { Field, Input, Select } from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import { useId } from "react";

/**
 * Form header bộ đề thư viện — metadata chung của đề (phase 6). Tái dùng
 * cấu trúc form header full-test builder của web nhưng validate bằng ĐÚNG
 * schema thư viện (`libraryTestCreateSchema`/`libraryTestUpdateSchema`,
 * phase 2): skill chỉ Reading/Listening và CHỈ ở lúc tạo; thời gian bắt
 * buộc 1 phút – 4 giờ (mặc định 60 phút).
 */

export interface TestHeaderFormValue {
	title: string;
	description: string;
	skill: LibrarySkill;
	/** Input thô MM:SS hoặc HH:MM:SS — parse ở buildHeaderPayload. */
	timeLimit: string;
	collection: string;
	testGroup: string;
}

export function emptyTestHeader(): TestHeaderFormValue {
	return {
		title: "",
		description: "",
		skill: "reading",
		timeLimit: "60:00",
		collection: "",
		testGroup: "",
	};
}

/** "60:00" cho 3600s — MM:SS với MM không chặn 59 (giờ lấn sang phút). */
export function formatTimeLimit(seconds: number): string {
	const minutes = Math.floor(seconds / 60);
	const secs = seconds % 60;
	return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Parse MM:SS hoặc HH:MM:SS → giây. Trả về null khi sai dạng — caller
 * hiển thị lỗi field, không tự đoán thay người dùng.
 */
export function parseTimeLimit(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const segments = trimmed.split(":");
	if (segments.length < 2 || segments.length > 3) return null;
	if (!segments.every((segment) => /^\d+$/.test(segment))) return null;
	const numbers = segments.map((segment) => Number.parseInt(segment, 10));
	if (segments.length === 3) {
		const [hours, minutes, secs] = numbers;
		if (minutes > 59 || secs > 59) return null;
		return hours * 3600 + minutes * 60 + secs;
	}
	const [minutes, secs] = numbers;
	if (secs > 59) return null;
	return minutes * 60 + secs;
}

const FIELD_ERROR_TEXT: Record<string, string> = {
	title: "Tiêu đề 1–200 ký tự.",
	description: "Mô tả tối đa 2000 ký tự.",
	timeLimitSeconds: "Thời gian từ 1:00 đến 4:00:00.",
	collection: "Collection tối đa 200 ký tự.",
	testGroup: "Group tối đa 200 ký tự.",
};

export type BuiltHeaderPayload<T> =
	| { ok: true; payload: T }
	| { ok: false; errors: Record<string, string> };

function zodFieldErrors(error: {
	issues: ReadonlyArray<{ path: ReadonlyArray<unknown>; message: string }>;
}): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of error.issues) {
		const field = issue.path[0];
		const key = typeof field === "string" ? field : "title";
		if (!errors[key]) errors[key] = FIELD_ERROR_TEXT[key] ?? issue.message;
	}
	return errors;
}

/**
 * Build payload TẠO đề: validate bằng `libraryTestCreateSchema` (skill bắt
 * buộc, timeLimit default 3600 khi bỏ trống — UI vẫn khuyến khích nhập).
 */
export function buildCreatePayload(
	value: TestHeaderFormValue,
): BuiltHeaderPayload<LibraryTestCreate> {
	const seconds = parseTimeLimit(value.timeLimit);
	if (seconds === null) {
		return {
			ok: false,
			errors: {
				timeLimitSeconds: "Nhập thời gian theo dạng MM:SS hoặc HH:MM:SS.",
			},
		};
	}
	const parsed = libraryTestCreateSchema.safeParse({
		title: value.title.trim(),
		description: isEmptyRichText(value.description)
			? undefined
			: value.description,
		skill: value.skill,
		timeLimitSeconds: seconds,
		collection: value.collection.trim(),
		testGroup: value.testGroup.trim(),
	});
	if (!parsed.success) {
		return { ok: false, errors: zodFieldErrors(parsed.error) };
	}
	return { ok: true, payload: parsed.data };
}

/** Build payload SỬA header — không có `skill` (immutable sau tạo). */
export function buildUpdatePayload(
	value: TestHeaderFormValue,
): BuiltHeaderPayload<LibraryTestUpdate> {
	const seconds = parseTimeLimit(value.timeLimit);
	if (seconds === null) {
		return {
			ok: false,
			errors: {
				timeLimitSeconds: "Nhập thời gian theo dạng MM:SS hoặc HH:MM:SS.",
			},
		};
	}
	const parsed = libraryTestUpdateSchema.safeParse({
		title: value.title.trim(),
		description: isEmptyRichText(value.description)
			? undefined
			: value.description,
		timeLimitSeconds: seconds,
		collection: value.collection.trim(),
		testGroup: value.testGroup.trim(),
	});
	if (!parsed.success) {
		return { ok: false, errors: zodFieldErrors(parsed.error) };
	}
	return { ok: true, payload: parsed.data };
}

const SKILL_OPTIONS: ReadonlyArray<{ id: LibrarySkill; label: string }> = [
	{ id: "reading", label: "Reading (Đọc)" },
	{ id: "listening", label: "Listening (Nghe)" },
];

export function TestHeaderForm({
	value,
	errors = {},
	showErrors,
	skillLocked,
	collections,
	groups,
	idPrefix,
	onChange,
}: {
	value: TestHeaderFormValue;
	errors?: Record<string, string | undefined>;
	showErrors: boolean;
	/** Edit mode: skill immutable phía server — khóa select kèm giải thích. */
	skillLocked?: boolean;
	/** Gợi ý distinct cho datalist (gõ tên mới = tạo mới). */
	collections?: string[];
	groups?: string[];
	/** ids datalist cần phân biệt khi trang có nhiều form. */
	idPrefix?: string;
	onChange: (patch: Partial<TestHeaderFormValue>) => void;
}) {
	const uid = useId();
	const collectionListId = `${idPrefix ?? "hdr"}-collection-${uid}`;
	const groupListId = `${idPrefix ?? "hdr"}-group-${uid}`;
	const skillLabel = SKILL_OPTIONS.find((option) => option.id === value.skill);
	return (
		<div className="flex flex-col gap-4">
			<Field
				label="Tiêu đề"
				required
				error={showErrors ? errors.title : undefined}
			>
				<Input
					value={value.title}
					maxLength={200}
					placeholder="VD: IELTS Reading Mock Test 01"
					onChange={(event) => onChange({ title: event.target.value })}
				/>
			</Field>
			<Field
				label="Mô tả"
				help="Không bắt buộc — tối đa 2000 ký tự."
				error={showErrors ? errors.description : undefined}
			>
				<RichTextEditor
					value={value.description}
					onChange={(description) => onChange({ description })}
					placeholder="Giới thiệu ngắn về bộ đề…"
					contentClassName="[&_.ProseMirror]:min-h-22"
				/>
			</Field>
			<div className="grid grid-cols-2 gap-5">
				<Field
					label="Thời gian làm bài"
					help="Dạng MM:SS hoặc HH:MM:SS — 60:00 cho 60 phút."
					error={showErrors ? errors.timeLimitSeconds : undefined}
				>
					<Input
						value={value.timeLimit}
						inputMode="numeric"
						placeholder="60:00"
						onChange={(event) => onChange({ timeLimit: event.target.value })}
					/>
				</Field>
				<Field
					label="Kỹ năng"
					help={
						skillLocked
							? "Kỹ năng cố định sau khi tạo đề."
							: "Không đổi được sau khi tạo đề."
					}
				>
					<Select
						value={skillLabel?.label ?? value.skill}
						disabled={skillLocked}
						onChange={(event) => {
							const entry = SKILL_OPTIONS.find(
								(option) => option.label === event.target.value,
							);
							if (entry) onChange({ skill: entry.id });
						}}
					>
						{SKILL_OPTIONS.map((option) => (
							<option key={option.id} value={option.label}>
								{option.label}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-5">
				<Field
					label="Bộ sưu tập"
					help="Không bắt buộc — gõ tên mới để tạo bộ sưu tập."
					error={showErrors ? errors.collection : undefined}
				>
					<Input
						value={value.collection}
						maxLength={200}
						list={collectionListId}
						placeholder="VD: Cambridge IELTS 18"
						onChange={(event) => onChange({ collection: event.target.value })}
					/>
					<datalist id={collectionListId}>
						{(collections ?? []).map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</Field>
				<Field
					label="Nhóm đề"
					help="Không bắt buộc — gõ tên mới để tạo nhóm."
					error={showErrors ? errors.testGroup : undefined}
				>
					<Input
						value={value.testGroup}
						maxLength={200}
						list={groupListId}
						placeholder="VD: TEST 5"
						onChange={(event) => onChange({ testGroup: event.target.value })}
					/>
					<datalist id={groupListId}>
						{(groups ?? []).map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</Field>
			</div>
		</div>
	);
}
