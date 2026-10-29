import { isImageBasedType } from "@teacher-os/api/contracts";
import type {
	LibraryPartDto,
	LibrarySkill,
} from "@teacher-os/api/library-contracts";
import { Field, Input, Select } from "@teacher-os/ui/components/web-kit/field";
import { RichTextEditor } from "@teacher-os/ui/components/web-kit/rich-text-editor";
import { AudioUploader } from "./audio-uploader";
import { BAND_OPTIONS, type PartFormValue } from "./part-form";

/**
 * Các field tab «Nội dung» của thẻ part (#424 Task 3.4 Bước 0 — tách thuần
 * di chuyển code khỏi `part-form.tsx`, không đổi hành vi): tiêu đề, band,
 * nguồn, passage, transcript, audio, ghi chú nội bộ.
 */

export function PartContentFields({
	uid,
	skill,
	slot,
	slotLabel,
	testId,
	value,
	saved,
	testReady,
	showErrors,
	errorFor,
	patch,
	onAudioChanged,
}: {
	/** Tiền tố id (useId của PartForm) — giữ nguyên id field cũ. */
	uid: string;
	skill: LibrarySkill;
	slot: string;
	slotLabel: string;
	testId: string;
	value: PartFormValue;
	saved: LibraryPartDto | null;
	testReady: boolean;
	showErrors: boolean;
	errorFor: (field: string) => string | undefined;
	patch: (next: Partial<PartFormValue>) => void;
	onAudioChanged: () => void;
}) {
	const isListening = skill === "listening";
	const isImage = isImageBasedType(skill, value.type);

	return (
		<div className="flex flex-col gap-4">
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
			</div>
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

			<Field label="Ghi chú nội bộ" htmlFor={`${uid}-note`}>
				<RichTextEditor
					id={`${uid}-note`}
					value={value.note}
					onChange={(note) => patch({ note })}
					placeholder="Ghi chú cho giáo viên (học viên không thấy)…"
					contentClassName="[&_.ProseMirror]:min-h-16"
				/>
			</Field>
		</div>
	);
}
