import {
	ASSIGNMENT_PART_TYPES,
	assignmentQuestionSchema,
	isImageBasedType,
} from "@teacher-os/api/contracts";
import {
	type LibraryPartDto,
	type LibraryPartInput,
	type LibraryPartIssue,
	type LibrarySkill,
	libraryPartUpsertSchema,
	validatePartForReady,
} from "@teacher-os/api/library-contracts";
import {
	emptyItem,
	type QuestionItem,
} from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { QuestionKeyEditor } from "@teacher-os/ui/components/assignments/editor/question-key-editor";
import {
	Button,
	buttonVariants,
} from "@teacher-os/ui/components/web-kit/button";
import { Field, Input, Select } from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import { useEffect, useId, useState } from "react";
import { AudioUploader } from "./audio-uploader";
import { formatIssue } from "./part-issues";

/**
 * Form nội dung MỘT part (slot) của đề thư viện. Trạng thái form sống ở
 * component (parent key theo `${slot}:${saved?.updatedAt}` để remount sau
 * khi lưu + refetch); dirty tính thuần từ `saved` → tab hiển thị chấm cảnh
 * báo và blocker chặn rời trang dùng cùng một hàm `isPartDirty`.
 */

export interface PartFormValue {
	type: string;
	title: string;
	band: string;
	source: string;
	intro: string;
	passage: string;
	transcript: string;
	imageUrl: string;
	questions: QuestionItem[];
	optionBank: string[];
	note: string;
}

export const BAND_OPTIONS = ["6.0", "6.5", "7.0", "7.5"] as const;

/** Dạng bài hợp lệ của slot theo catalog skill. */
export function slotTypes(
	skill: LibrarySkill,
	slot: string,
): readonly string[] {
	return ASSIGNMENT_PART_TYPES[skill]?.types[slot] ?? [];
}

/** Part mới chưa có dữ liệu — 1 câu rỗng để giáo viên gõ ngay. */
export function emptyPartValue(
	skill: LibrarySkill,
	slot: string,
): PartFormValue {
	const type = slotTypes(skill, slot)[0] ?? "";
	return {
		type,
		title: "",
		band: "6.0",
		source: "",
		intro: "",
		passage: "",
		transcript: "",
		imageUrl: "",
		questions: type ? [emptyItem(type)] : [],
		optionBank: [],
		note: "",
	};
}

/** questions trên wire là `unknown[]` — chuẩn hóa từng câu qua schema gốc. */
export function normalizeQuestions(raw: unknown[]): QuestionItem[] {
	return raw.map((question) => {
		const parsed = assignmentQuestionSchema.safeParse(question);
		if (parsed.success) {
			// zod output cho phép undefined (nullish) — đút về đúng hình dạng
			// `AssignmentQuestion` (opts/pin: null tường minh) để dirty-compare
			// và QuestionKeyEditor nhận nguyên văn.
			return {
				stem: parsed.data.stem,
				opts: parsed.data.opts ?? null,
				answer: parsed.data.answer,
				alts: parsed.data.alts,
				type: parsed.data.type ?? null,
				pin: parsed.data.pin ?? null,
			};
		}
		const fallbackType =
			typeof question === "object" &&
			question !== null &&
			"type" in question &&
			typeof question.type === "string"
				? question.type
				: "";
		return emptyItem(fallbackType);
	});
}

export function partValueFromDto(dto: LibraryPartDto): PartFormValue {
	return {
		type: dto.type,
		title: dto.title,
		band: dto.band,
		source: dto.source,
		intro: dto.intro,
		passage: dto.passage,
		transcript: dto.transcript,
		imageUrl: dto.imageUrl,
		questions: normalizeQuestions(dto.questions),
		optionBank: dto.optionBank,
		note: dto.note,
	};
}

/** Chuẩn hóa value về hình dạng cố định để so sánh dirty/JSON ổn định. */
function canonicalValue(value: PartFormValue): string {
	return JSON.stringify({
		type: value.type,
		title: value.title,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		optionBank: value.optionBank,
		note: value.note,
	});
}

/** Dirty so với bản đã lưu (null = so với part rỗng của slot). */
export function isPartDirty(
	skill: LibrarySkill,
	slot: string,
	saved: LibraryPartDto | null,
	value: PartFormValue,
): boolean {
	const baseline = saved
		? partValueFromDto(saved)
		: emptyPartValue(skill, slot);
	return canonicalValue(baseline) !== canonicalValue(value);
}

export type BuiltPartPayload =
	| { ok: true; input: LibraryPartInput }
	| { ok: false; errors: Record<string, string> };

const FIELD_ERROR_TEXT: Record<string, string> = {
	type: "Dạng bài không hợp lệ cho part này.",
	title: "Tiêu đề part 1–200 ký tự.",
	band: "Chọn band 6.0 / 6.5 / 7.0 / 7.5.",
	source: "Nguồn tối đa 200 ký tự.",
	passage: "Passage tối đa 20.000 ký tự.",
	transcript: "Transcript tối đa 10.000 ký tự.",
	intro: "Hướng dẫn tối đa 2000 ký tự.",
	note: "Ghi chú tối đa 2000 ký tự.",
	imageUrl: "Ảnh phải là URL https hợp lệ (tối đa 500 ký tự).",
	questions: "Tối đa 40 câu hỏi.",
	optionBank: "Ngân hàng đáp án tối đa 8 mục.",
};

/** Build input PUT theo ĐÚNG `libraryPartUpsertSchema` (phase 2). */
export function partInputFromValue(
	slot: string,
	value: PartFormValue,
): BuiltPartPayload {
	const parsed = libraryPartUpsertSchema.safeParse({
		part: slot,
		type: value.type,
		title: value.title,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		optionBank: value.optionBank,
		note: value.note,
	});
	if (!parsed.success) {
		const errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			const key = typeof issue.path[0] === "string" ? issue.path[0] : "title";
			if (!errors[key]) errors[key] = FIELD_ERROR_TEXT[key] ?? issue.message;
		}
		return { ok: false, errors };
	}
	return { ok: true, input: parsed.data };
}

/**
 * `canSave` — cùng hàm validate với server (phase 2). Title rỗng KHÔNG phải
 * điều kiện ready phía server, nên thay tạm title nháp để zod không che các
 * lý do thật (passage/audio/questions). Parse hỏng vì lý do cấu trúc
 * (vd > 40 câu) vẫn được xếp vào issues.
 */
export function partReadyIssues(
	skill: LibrarySkill,
	slot: string,
	value: PartFormValue,
): LibraryPartIssue[] {
	const draftTitle = value.title.trim() || "(chưa đặt tiêu đề part)";
	const parsed = libraryPartUpsertSchema.safeParse({
		part: slot,
		type: value.type,
		title: draftTitle,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		optionBank: value.optionBank,
		note: value.note,
	});
	if (!parsed.success) {
		return parsed.error.issues.map((issue) => ({
			path: typeof issue.path[0] === "string" ? issue.path[0] : "title",
			message: FIELD_ERROR_TEXT[issue.path[0] as string] ?? issue.message,
		}));
	}
	return validatePartForReady(skill, parsed.data);
}

export function PartForm({
	skill,
	slot,
	slotLabel,
	testId,
	saved,
	testReady,
	saving,
	initialValue,
	onDraftChange,
	onSave,
	onAudioChanged,
	onDelete,
	deleting,
}: {
	skill: LibrarySkill;
	slot: string;
	slotLabel: string;
	testId: string;
	/** Part đã lưu trên server (null = slot trống). */
	saved: LibraryPartDto | null;
	/** Đề đang `ready`: khóa xóa part/audio, nội dung vẫn sửa được. */
	testReady: boolean;
	saving: boolean;
	/** Nháp đang soạn của slot (state lift ở parent) — form bị remount sau
	 * khi lưu / upload audio (key theo `saved.updatedAt`) sẽ khôi phục nội
	 * dung đang gõ thay vì reset về bản đã lưu. */
	initialValue?: PartFormValue;
	/** Báo dirty + giá trị nháp lên parent (tab chấm đỏ, ready-check). */
	onDraftChange: (
		slot: string,
		draft: { dirty: boolean; value: PartFormValue },
	) => void;
	onSave: (input: LibraryPartInput) => Promise<unknown>;
	/** Sau khi audio upload/xóa thành công — parent refetch detail. */
	onAudioChanged: () => void;
	onDelete: () => void;
	deleting: boolean;
}) {
	const uid = useId();
	const [value, setValue] = useState<PartFormValue>(
		() =>
			initialValue ??
			(saved ? partValueFromDto(saved) : emptyPartValue(skill, slot)),
	);
	const [showErrors, setShowErrors] = useState(false);
	const [live, setLive] = useState("");

	const dirty = isPartDirty(skill, slot, saved, value);
	useEffect(() => {
		onDraftChange(slot, { dirty, value });
		// saved đổi (remount bằng key nên không xảy ra trong một mount) —
		// deps đủ để reporter luôn bắn trạng thái nháp mới nhất.
	}, [dirty, slot, onDraftChange, value]);

	const patch = (next: Partial<PartFormValue>) =>
		setValue((previous) => ({ ...previous, ...next }));

	const isListening = skill === "listening";
	const isImage = isImageBasedType(skill, value.type);
	const issues =
		showErrors || testReady ? partReadyIssues(skill, slot, value) : [];
	const errorFor = (field: string): string | undefined =>
		showErrors
			? issues.find((issue) => issue.path === field)?.message
			: undefined;
	const questionIssueCount = issues.filter((issue) =>
		issue.path.startsWith("questions"),
	).length;

	const handleSave = async () => {
		const built = partInputFromValue(slot, value);
		if (!built.ok) {
			setShowErrors(true);
			setLive("Chưa lưu được — kiểm tra các trường có lỗi.");
			return;
		}
		try {
			await onSave(built.input);
			setShowErrors(false);
			setLive("Đã lưu part.");
		} catch {
			setLive("Chưa lưu được part — xem thông báo lỗi.");
		}
	};

	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-2 gap-4">
				<Field
					label="Tiêu đề part"
					required
					htmlFor={`${uid}-title`}
					error={showErrors ? errorFor("title") : undefined}
				>
					<Input
						id={`${uid}-title`}
						value={value.title}
						maxLength={200}
						placeholder={`VD: ${slotLabel}`}
						onChange={(event) => patch({ title: event.target.value })}
					/>
				</Field>
				<Field
					label="Dạng bài"
					required
					htmlFor={`${uid}-type`}
					error={showErrors ? errorFor("type") : undefined}
				>
					<Select
						id={`${uid}-type`}
						value={value.type}
						onChange={(event) => {
							const type = event.target.value;
							// Đổi dạng: câu giữ nội dung (stem/answer), chỉ câu
							// rỗng mới nhận shape của dạng mới (same as web composer).
							patch({
								type,
								questions: value.questions.map((question) =>
									question.stem || question.answer ? question : emptyItem(type),
								),
							});
						}}
					>
						{slotTypes(skill, slot).map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</Select>
				</Field>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<Field label="Band điểm" htmlFor={`${uid}-band`}>
					<Select
						id={`${uid}-band`}
						value={value.band}
						onChange={(event) => patch({ band: event.target.value })}
					>
						{BAND_OPTIONS.map((band) => (
							<option key={band} value={band}>
								{band}
							</option>
						))}
					</Select>
				</Field>
				<Field
					label="Nguồn"
					htmlFor={`${uid}-source`}
					help="Không bắt buộc — tên bài gốc / tài liệu tham khảo."
				>
					<Input
						id={`${uid}-source`}
						value={value.source}
						maxLength={200}
						onChange={(event) => patch({ source: event.target.value })}
					/>
				</Field>
			</div>

			<Field
				label="Đoạn văn (Passage)"
				htmlFor={`${uid}-passage`}
				help="Rich text — tối đa 20.000 ký tự."
				error={showErrors ? errorFor("passage") : undefined}
			>
				<RichTextEditor
					id={`${uid}-passage`}
					value={value.passage}
					onChange={(passage) => patch({ passage })}
					placeholder="Dán đoạn văn đọc…"
					contentClassName="[&_.ProseMirror]:min-h-48"
				/>
			</Field>

			{isListening && (
				<Field
					label="Transcript (Lời thoại)"
					htmlFor={`${uid}-transcript`}
					help="Rich text — tối đa 10.000 ký tự."
					error={showErrors ? errorFor("transcript") : undefined}
				>
					<RichTextEditor
						id={`${uid}-transcript`}
						value={value.transcript}
						onChange={(transcript) => patch({ transcript })}
						placeholder="Dán lời thoại đầy đủ của section…"
						contentClassName="[&_.ProseMirror]:min-h-32"
					/>
				</Field>
			)}

			{isImage && (
				<p className="text-muted-foreground text-xs">
					Dạng bài dùng ảnh — nhập URL ảnh và đặt ghim cho từng câu ở khối «Câu
					hỏi và đáp án đúng» bên dưới.
				</p>
			)}

			{isListening && (
				<AudioUploader
					testId={testId}
					slot={slot}
					audio={saved?.audio ?? null}
					locked={testReady}
					onChanged={onAudioChanged}
				/>
			)}

			<QuestionKeyEditor
				skill={skill}
				partId={slot}
				typeId={value.type}
				intro={value.intro}
				items={value.questions as QuestionItem[]}
				showErrors={showErrors}
				status={testReady ? "ready" : "draft"}
				imageUrl={value.imageUrl}
				optionBank={value.optionBank}
				onIntroChange={(intro) => patch({ intro })}
				onImageUrlChange={(imageUrl) => patch({ imageUrl })}
				onItemsChange={(questions) => patch({ questions })}
				onBankChange={(optionBank) => patch({ optionBank })}
				imageUrlError={errorFor("imageUrl")}
				optionBankError={errorFor("optionBank")}
				questionsError={
					questionIssueCount > 0
						? `${questionIssueCount} câu hỏi chưa đạt điều kiện xuất bản — xem chi tiết ở danh sách lý do.`
						: undefined
				}
			/>

			<Field label="Ghi chú nội bộ" htmlFor={`${uid}-note`}>
				<RichTextEditor
					id={`${uid}-note`}
					value={value.note}
					onChange={(note) => patch({ note })}
					placeholder="Ghi chú cho giáo viên (học viên không thấy)…"
					contentClassName="[&_.ProseMirror]:min-h-16"
				/>
			</Field>

			{showErrors && issues.length > 0 && (
				<div
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
				>
					<p className="font-medium text-destructive text-sm">
						{slotLabel} chưa đạt điều kiện lưu/xuất bản:
					</p>
					<ul className="mt-1 list-disc pl-5 text-destructive text-xs">
						{issues.map((issue) => (
							<li key={`${issue.path}:${issue.message}`}>
								{formatIssue(issue, skill)}
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={() => void handleSave()} disabled={saving}>
					{saving ? "Đang lưu…" : "Lưu part"}
				</Button>
				{saved && (
					<button
						type="button"
						disabled={testReady || deleting}
						title={
							testReady
								? "Đề đã xuất bản — hãy hạ về nháp để xóa part."
								: undefined
						}
						onClick={() => {
							if (
								window.confirm(
									`Xóa nội dung ${slotLabel}? Câu hỏi và audio (nếu có) sẽ bị xóa vĩnh viễn.`,
								)
							) {
								onDelete();
							}
						}}
						className={buttonVariants({
							variant: "destructive",
							size: "sm",
							className: testReady ? "pointer-events-none opacity-50" : "",
						})}
					>
						{deleting ? "Đang xóa…" : "Xóa part"}
					</button>
				)}
				{dirty && (
					<span className="flex items-center gap-1.5 text-amber-600 text-xs">
						<span
							aria-hidden="true"
							className="inline-block size-2 rounded-full bg-amber-500"
						/>
						Có thay đổi chưa lưu
					</span>
				)}
				<p
					aria-live="polite"
					role="status"
					className="text-muted-foreground text-xs"
				>
					{live}
				</p>
			</div>
			{testReady && (
				<p className="text-muted-foreground text-xs">
					Đề đã xuất bản: vẫn sửa được nội dung (server sẽ kiểm tra lại luật
					«ready» khi lưu), nhưng phải hạ về nháp để xóa part hoặc audio.
				</p>
			)}
		</div>
	);
}
