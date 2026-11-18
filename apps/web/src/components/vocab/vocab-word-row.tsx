import type {
	VocabEntryType,
	VocabTeacherWord,
} from "@teacher-os/api/contracts";
import { QUIZ_MEDIA_MAX_BYTES } from "@teacher-os/api/contracts";
import type { QuizMediaRejectReason } from "@teacher-os/api/lib/quiz-media";
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import { MediaDropzone } from "@teacher-os/ui/components/quiz/media-dropzone";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

const VOCAB_AUDIO_ACCEPT = [
	...Object.keys(LIBRARY_AUDIO_MIME),
	".mp3",
	".m4a",
	".aac",
	".wav",
	".wave",
	".ogg",
	".oga",
	".opus",
	".webm",
	".weba",
].join(",");

export function vocabAudioRejectMessage(
	reason: QuizMediaRejectReason,
): string | null {
	switch (reason) {
		case "none":
			return null;
		case "multiple":
			return "Chỉ tải lên được 1 file âm thanh mỗi lần.";
		case "size":
			return "Dung lượng file âm thanh vượt quá 50 MB.";
		case "empty":
			return "File âm thanh rỗng.";
		case "name":
			return "Tên file âm thanh không hợp lệ (tối đa 200 ký tự).";
		case "type":
			return "Định dạng âm thanh không hỗ trợ (chỉ nhận MP3, M4A, WAV, AAC, OGG, WEBM).";
	}
}
/**
 * Một hàng từ vựng trong editor deck (#359): word / IPA / translation
 * editable inline + nút Lưu / Xoá / upload audio. Audio upload dùng
 * media-dropzone và PUT trực tiếp lên kernel route (không qua command bus).
 */
export function VocabWordRow({
	row,
	saving,
	onSave,
	onRemove,
	onUploadAudio,
}: {
	row: VocabTeacherWord;
	saving: boolean;
	onSave: (row: VocabTeacherWord) => Promise<void>;
	onRemove: (wordId: string) => Promise<void>;
	onUploadAudio: (wordId: string, file: File) => Promise<"ok" | "error">;
}) {
	const initialEntryType: VocabEntryType = row.entryType ?? "word";
	const [prevRow, setPrevRow] = useState(row);
	const [entryType, setEntryType] = useState<VocabEntryType>(initialEntryType);
	const [word, setWord] = useState(row.word);
	const [ipa, setIpa] = useState(row.ipa ?? "");
	const [pos, setPos] = useState(row.pos ?? "");
	const [translation, setTranslation] = useState(row.translation);
	const [example, setExample] = useState(row.example ?? "");

	if (
		row.entryType !== prevRow.entryType ||
		row.word !== prevRow.word ||
		row.ipa !== prevRow.ipa ||
		row.pos !== prevRow.pos ||
		row.translation !== prevRow.translation ||
		row.example !== prevRow.example
	) {
		setPrevRow(row);
		setEntryType(row.entryType ?? "word");
		setWord(row.word);
		setIpa(row.ipa ?? "");
		setPos(row.pos ?? "");
		setTranslation(row.translation);
		setExample(row.example ?? "");
	}

	const isDraft = row.id.startsWith("draft-");
	const dirty =
		entryType !== initialEntryType ||
		word !== row.word ||
		ipa !== (row.ipa ?? "") ||
		pos !== (row.pos ?? "") ||
		translation !== row.translation ||
		example !== (row.example ?? "");

	return (
		<div
			data-testid={`vocab-word-row-${row.id}`}
			className="space-y-3 rounded-md border border-border bg-card p-3"
		>
			<div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
				<div className="sm:col-span-3">
					<label
						htmlFor={`vocab-type-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						Loại
					</label>
					<Select
						id={`vocab-type-${row.id}`}
						data-testid={`vocab-type-${row.id}`}
						value={entryType}
						onChange={(e) => setEntryType(e.target.value as VocabEntryType)}
						className="mt-1"
					>
						<option value="word">Từ đơn (Word)</option>
						<option value="chunk">Cụm từ (Chunk)</option>
					</Select>
				</div>
				<div className="sm:col-span-5">
					<label
						htmlFor={`vocab-word-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						Từ vựng
					</label>
					<Input
						id={`vocab-word-${row.id}`}
						value={word}
						onChange={(e) => setWord(e.target.value)}
						placeholder="resilient"
						className="mt-1"
					/>
				</div>
				<div className="sm:col-span-4">
					<label
						htmlFor={`vocab-ipa-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						IPA
					</label>
					<Input
						id={`vocab-ipa-${row.id}`}
						value={ipa}
						onChange={(e) => setIpa(e.target.value)}
						placeholder="/rɪˈzɪl.i.ənt/"
						className="mt-1 font-mono"
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
				<div className="sm:col-span-3">
					<label
						htmlFor={`vocab-pos-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						Từ loại
					</label>
					<Input
						id={`vocab-pos-${row.id}`}
						data-testid={`vocab-pos-${row.id}`}
						value={pos}
						onChange={(e) => setPos(e.target.value)}
						placeholder="n., v., phr. v."
						className="mt-1"
					/>
				</div>
				<div className="sm:col-span-4">
					<label
						htmlFor={`vocab-translation-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						Nghĩa tiếng Việt
					</label>
					<Input
						id={`vocab-translation-${row.id}`}
						value={translation}
						onChange={(e) => setTranslation(e.target.value)}
						placeholder="kiên cường"
						className="mt-1"
					/>
				</div>
				<div className="sm:col-span-5">
					<label
						htmlFor={`vocab-example-${row.id}`}
						className="block font-medium text-muted-foreground text-xs"
					>
						Ví dụ
					</label>
					<Input
						id={`vocab-example-${row.id}`}
						data-testid={`vocab-example-${row.id}`}
						value={example}
						onChange={(e) => setExample(e.target.value)}
						placeholder="Can I introduce my friend Nam?"
						className="mt-1"
					/>
				</div>
			</div>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-col gap-1.5">
					{row.audioKey || row.audioUrl ? (
						<p className="font-medium text-primary text-xs">Đã có audio</p>
					) : null}
					<MediaDropzone
						accept={VOCAB_AUDIO_ACCEPT}
						maxBytes={QUIZ_MEDIA_MAX_BYTES}
						disabled={isDraft || saving}
						hint="MP3/M4A/WAV · tối đa 50 MB"
						onFile={(file) => void onUploadAudio(row.id, file)}
						onReject={(reason) => {
							const message = vocabAudioRejectMessage(reason);
							if (message) toast.error(message);
						}}
					/>
				</div>

				<div className="flex gap-2">
					<Button
						size="sm"
						data-testid={`vocab-save-word-${row.id}`}
						disabled={!dirty || saving || word.trim().length === 0}
						onClick={() =>
							void onSave({
								...row,
								entryType,
								word,
								ipa: ipa.trim() ? ipa.trim() : null,
								pos: pos.trim() ? pos.trim() : null,
								translation,
								example: example.trim() ? example.trim() : null,
							})
						}
					>
						{saving ? "Đang lưu..." : isDraft ? "Thêm" : "Lưu"}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						data-testid={`vocab-remove-word-${row.id}`}
						disabled={saving}
						onClick={() => void onRemove(row.id)}
					>
						Xoá
					</Button>
				</div>
			</div>
		</div>
	);
}
