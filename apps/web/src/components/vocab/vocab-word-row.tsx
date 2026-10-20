import type { VocabTeacherWord } from "@teacher-os/api/contracts";
import { QUIZ_MEDIA_MAX_BYTES } from "@teacher-os/api/contracts";
import { MediaDropzone } from "@teacher-os/ui/components/quiz/media-dropzone";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

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
	const [word, setWord] = useState(row.word);
	const [ipa, setIpa] = useState(row.ipa ?? "");
	const [translation, setTranslation] = useState(row.translation);
	const isDraft = row.id.startsWith("draft-");
	const dirty =
		word !== row.word ||
		ipa !== (row.ipa ?? "") ||
		translation !== row.translation;

	return (
		<div
			data-testid={`vocab-word-row-${row.id}`}
			className="flex flex-wrap items-end gap-2 rounded-md border border-border p-3"
		>
			<div className="min-w-[140px] flex-1">
				<label
					htmlFor={`vocab-word-${row.id}`}
					className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
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
			<div className="w-[160px]">
				<label
					htmlFor={`vocab-ipa-${row.id}`}
					className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
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
			<div className="min-w-[180px] flex-[2]">
				<label
					htmlFor={`vocab-translation-${row.id}`}
					className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest"
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

			<div className="flex flex-col gap-2">
				{row.audioKey || row.audioUrl ? (
					<p className="font-mono text-[10px] text-primary uppercase tracking-widest">
						Đã có audio
					</p>
				) : null}
				<MediaDropzone
					accept="audio/*"
					maxBytes={QUIZ_MEDIA_MAX_BYTES}
					disabled={isDraft}
					hint="MP3/M4A/WAV · tối đa 50 MB"
					onFile={(file) => void onUploadAudio(row.id, file)}
					onReject={() => undefined}
				/>
			</div>

			<div className="flex gap-2">
				<Button
					size="sm"
					data-testid={`vocab-save-word-${row.id}`}
					disabled={!dirty || saving || word.trim().length === 0}
					onClick={() => void onSave({ ...row, word, ipa, translation })}
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
	);
}
