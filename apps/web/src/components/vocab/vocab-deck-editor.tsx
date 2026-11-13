import {
	QUIZ_MEDIA_MAX_BYTES,
	type VocabTeacherWord,
} from "@teacher-os/api/contracts";
import {
	resolveLibraryAudioMimeType,
	sanitizeMediaFileName,
} from "@teacher-os/api/lib/quiz-media";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import { VocabWordRow } from "./vocab-word-row";

export function prepareVocabAudioUpload(
	file: File,
):
	| { ok: true; contentType: string; encodedFileName: string }
	| { ok: false; message: string } {
	if (sanitizeMediaFileName(file.name) === null) {
		return {
			ok: false,
			message: "Tên file âm thanh không hợp lệ (tối đa 200 ký tự).",
		};
	}
	const contentType = resolveLibraryAudioMimeType(file.name, file.type);
	if (!contentType) {
		return {
			ok: false,
			message:
				"Định dạng âm thanh không hỗ trợ (chỉ nhận MP3, M4A, WAV, AAC, OGG, WEBM).",
		};
	}
	if (file.size <= 0) {
		return { ok: false, message: "File âm thanh rỗng." };
	}
	if (file.size > QUIZ_MEDIA_MAX_BYTES) {
		return {
			ok: false,
			message: "Dung lượng file âm thanh vượt quá 50 MB.",
		};
	}
	return {
		ok: true,
		contentType,
		encodedFileName: encodeURIComponent(file.name),
	};
}

/**
 * Editor soạn từ vựng của một deck (#359). Words load per-deck qua
 * GET /api/kernel/vocab/decks/:deckId/words (KHÔNG qua snapshot —
 * tránh phình payload org-wide). Upload audio đi thẳng PUT
 * /api/kernel/vocab/words/:wordId/audio (raw body — không qua command bus).
 */
export function VocabDeckEditorDialog({
	deckId,
	onClose,
}: {
	deckId: string;
	onClose: () => void;
}) {
	const { dispatch } = useData();
	const [words, setWords] = useState<VocabTeacherWord[]>([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(false);
	const [savingId, setSavingId] = useState<string | null>(null);
	const [uploadingWordId, setUploadingWordId] = useState<string | null>(null);
	const draftCounterRef = useRef(0);

	const loadWords = useCallback(async () => {
		setLoading(true);
		setLoadError(false);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab/decks/${deckId}/words`,
				{
					credentials: "include",
				},
			);
			if (!res.ok) throw new Error(`Failed: ${res.status}`);
			const body = (await res.json()) as { words: VocabTeacherWord[] };
			setWords(body.words);
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, [deckId]);

	useEffect(() => {
		void loadWords();
	}, [loadWords]);

	const handleAddRow = () => {
		draftCounterRef.current += 1;
		const draftId = `draft-${draftCounterRef.current}`;
		setWords((prev) => [
			...prev,
			{
				id: draftId,
				deckId,
				word: "",
				ipa: null,
				translation: "",
				audioKey: null,
				audioUrl: null,
				sortOrder: prev.length,
			},
		]);
	};

	const handleSaveRow = async (row: VocabTeacherWord) => {
		if (savingId) return;
		const word = row.word.trim();
		if (word.length === 0) {
			toast.error("Từ vựng không được để trống.");
			return;
		}
		setSavingId(row.id);
		try {
			const isDraft = row.id.startsWith("draft-");
			const action = {
				type: "upsert-vocab-word" as const,
				payload: {
					deckId,
					...(isDraft ? {} : { id: row.id }),
					word,
					ipa: row.ipa ? row.ipa : null,
					translation: row.translation,
					sortOrder: row.sortOrder,
				},
			};
			const result = await dispatch(action);
			if (result.kind !== "refreshed") return; // lỗi đã báo bởi command bus
			await loadWords();
		} finally {
			setSavingId(null);
		}
	};

	const handleRemoveRow = async (wordId: string) => {
		if (savingId) return;
		if (wordId.startsWith("draft-")) {
			setWords((prev) => prev.filter((w) => w.id !== wordId));
			return;
		}
		setSavingId(wordId);
		try {
			const result = await dispatch({ type: "remove-vocab-word", wordId });
			if (result.kind !== "refreshed") return; // lỗi đã báo bởi command bus
			await loadWords();
		} finally {
			setSavingId(null);
		}
	};

	const handleUploadAudio = async (
		wordId: string,
		file: File,
	): Promise<"ok" | "error"> => {
		if (savingId || uploadingWordId) return "error";
		const prepared = prepareVocabAudioUpload(file);
		if (!prepared.ok) {
			toast.error(prepared.message);
			return "error";
		}
		setUploadingWordId(wordId);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab/words/${encodeURIComponent(wordId)}/audio`,
				{
					method: "PUT",
					credentials: "include",
					headers: {
						"Content-Type": prepared.contentType,
						"X-File-Name": prepared.encodedFileName,
					},
					body: file,
				},
			);
			if (!res.ok) {
				if (res.status === 415) {
					toast.error(
						"Định dạng âm thanh không hợp lệ hoặc nội dung file không khớp đuôi file.",
					);
				} else if (res.status === 413) {
					toast.error("Dung lượng file âm thanh vượt quá 50 MB.");
				} else {
					toast.error("Không upload được file âm thanh phát âm.");
				}
				return "error";
			}
			await loadWords();
			return "ok";
		} finally {
			setUploadingWordId(null);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title="Soạn từ vựng"
			footer={
				<Button type="button" onClick={onClose}>
					Hoàn tất
				</Button>
			}
		>
			<p className="text-muted-foreground text-sm">
				Thêm, sửa hoặc xoá từng từ. File âm thanh (MP3/M4A/WAV) dùng cho
				minigame Listening.
			</p>

			{loading ? (
				<p className="py-6 text-center text-muted-foreground text-sm">
					Đang tải danh sách từ...
				</p>
			) : loadError ? (
				<div className="space-y-3 py-6 text-center">
					<p className="text-muted-foreground text-sm">
						Không tải được danh sách từ vựng.
					</p>
					<Button
						size="sm"
						variant="secondary"
						onClick={() => void loadWords()}
					>
						Thử lại
					</Button>
				</div>
			) : (
				<div className="space-y-2">
					{words.map((row) => (
						<VocabWordRow
							key={row.id}
							row={row}
							saving={savingId === row.id || uploadingWordId === row.id}
							onSave={handleSaveRow}
							onRemove={handleRemoveRow}
							onUploadAudio={handleUploadAudio}
						/>
					))}
					<Button
						size="sm"
						variant="secondary"
						data-testid="vocab-add-word-btn"
						onClick={handleAddRow}
						className="mt-3 w-full"
					>
						+ Thêm từ
					</Button>
				</div>
			)}
		</Modal>
	);
}
