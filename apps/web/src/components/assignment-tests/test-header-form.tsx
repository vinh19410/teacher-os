import {
	type AssignmentTestCreate,
	assignmentTestCreateSchema,
} from "@teacher-os/api/contracts";
import { useId } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/**
 * Header form của full-test builder (phase-03 Task 3.4) — metadata bộ đề
 * theo hành vi Selfomy: preset 4 skill, collection/group là input tự do +
 * datalist distinct (gõ giá trị mới = tạo mới inline).
 */

export interface TestHeaderFormValue {
	title: string;
	description: string;
	skill: string;
	/** Raw input MM:SS hoặc HH:MM:SS — parse ở buildTestPayload. */
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
 * Parse MM:SS hoặc HH:MM:SS → giây. Trả về null khi sai dạng — caller hiển
 * thị lỗi field, không đoán mò (Selfomy không normalize input giữa chừng).
 */
export function parseTimeLimit(input: string): number | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const segments = trimmed.split(":");
	if (segments.length < 2 || segments.length > 3) return null;
	if (!segments.every((segment) => /^\d+$/.test(segment))) return null;
	const numbers = segments.map((segment) => Number.parseInt(segment, 10));
	if (numbers.some((number) => !Number.isFinite(number))) return null;
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
	skill: "Chọn kỹ năng.",
	timeLimitSeconds: "Thời gian từ 1 giây đến 3:00:00.",
	collection: "Collection tối đa 200 ký tự.",
	testGroup: "Group tối đa 100 ký tự.",
};

export type BuiltTestPayload =
	| { ok: true; payload: AssignmentTestCreate }
	| { ok: false; errors: Record<string, string> };

/**
 * Validate + build payload create/update theo ĐÚNG rule zod server
 * (`assignmentTestCreateSchema` import từ packages/api — không copy rule).
 * Time limit để trống → null (không giới hạn); parse fail trên input khác
 * rỗng được bắt trước zod với message hướng dẫn dạng nhập.
 */
export function buildTestPayload(value: TestHeaderFormValue): BuiltTestPayload {
	// Để trống = không giới hạn (timeLimitSeconds null theo contract — hợp
	// cho Speaking/Writing); dạng GÕ SAI (khác rỗng mà parse không được) vẫn
	// chặn trước zod với message hướng dẫn.
	const trimmedTime = value.timeLimit.trim();
	const timeLimitSeconds =
		trimmedTime === "" ? null : parseTimeLimit(trimmedTime);
	if (timeLimitSeconds === null && trimmedTime !== "") {
		return {
			ok: false,
			errors: { timeLimit: "Nhập thời gian theo dạng MM:SS hoặc HH:MM:SS." },
		};
	}
	const payload: AssignmentTestCreate = {
		title: value.title.trim(),
		description: value.description.trim() || undefined,
		skill: value.skill as AssignmentTestCreate["skill"],
		timeLimitSeconds,
		collection: value.collection.trim() || undefined,
		testGroup: value.testGroup.trim() || undefined,
	};
	const parsed = assignmentTestCreateSchema.safeParse(payload);
	if (!parsed.success) {
		const errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const field = issue.path[0];
			const key = typeof field === "string" ? field : "title";
			if (!errors[key]) errors[key] = FIELD_ERROR_TEXT[key] ?? issue.message;
		}
		return { ok: false, errors };
	}
	return { ok: true, payload: parsed.data };
}

const PRESET_LABELS: Record<string, string> = {
	reading: "Academic IELTS Reading",
	listening: "Academic IELTS Listening",
	writing: "Academic IELTS Writing",
	speaking: "Academic IELTS Speaking",
};

export function TestHeaderForm({
	value,
	errors = {},
	showErrors,
	skillLocked,
	collections,
	groups,
	onSkillChange,
	onChange,
}: {
	value: TestHeaderFormValue;
	errors?: Record<string, string | undefined>;
	showErrors: boolean;
	/** Edit mode: skill immutable phía server — select khóa, không đổi được. */
	skillLocked: boolean;
	/** Distinct từ snapshot.assignmentTests cho datalist (tự gõ = tạo mới). */
	collections: string[];
	groups: string[];
	/** Skill đổi kèm reset slots — shell quyết định (confirm + clear). */
	onSkillChange: (skill: string) => void;
	onChange: (patch: Partial<TestHeaderFormValue>) => void;
}) {
	const collectionListId = useId();
	const groupListId = useId();
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
				help="Không bắt buộc — hiển thị khi giao bộ đề."
				error={showErrors ? errors.description : undefined}
			>
				<Textarea
					value={value.description}
					maxLength={2000}
					className="min-h-22"
					onChange={(event) => onChange({ description: event.target.value })}
				/>
			</Field>
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				<Field
					label="Time limit"
					help="MM:SS hoặc HH:MM:SS — 60:00 cho 60 phút; để trống = không giới hạn."
					error={showErrors ? errors.timeLimit : undefined}
				>
					<Input
						value={value.timeLimit}
						inputMode="numeric"
						placeholder="60:00"
						onChange={(event) => onChange({ timeLimit: event.target.value })}
					/>
				</Field>
				<Field
					label="Preset"
					help={skillLocked ? "Kỹ năng cố định theo parts đã gắn." : undefined}
				>
					<Select
						value={PRESET_LABELS[value.skill] ?? value.skill}
						disabled={skillLocked}
						onChange={(event) => {
							if (skillLocked) return;
							const entry = Object.entries(PRESET_LABELS).find(
								([, label]) => label === event.target.value,
							);
							if (entry) onSkillChange(entry[0]);
						}}
					>
						{Object.entries(PRESET_LABELS).map(([skill, label]) => (
							<option key={skill} value={label}>
								{label}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-5 max-app:grid-cols-1">
				<Field
					label="Collection"
					help="Gõ tên mới để tạo collection mới."
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
						{collections.map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</Field>
				<Field
					label="Group"
					help="Gõ tên mới để tạo group mới."
					error={showErrors ? errors.testGroup : undefined}
				>
					<Input
						value={value.testGroup}
						maxLength={100}
						list={groupListId}
						placeholder="VD: TEST 5"
						onChange={(event) => onChange({ testGroup: event.target.value })}
					/>
					<datalist id={groupListId}>
						{groups.map((name) => (
							<option key={name} value={name} />
						))}
					</datalist>
				</Field>
			</div>
		</div>
	);
}
