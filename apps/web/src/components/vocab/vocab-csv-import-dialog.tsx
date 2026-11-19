import {
	formatVocabLessonDeckTitle,
	parseVocabCsv,
	VOCAB_SAMPLE_CSV_CONTENT,
	VOCAB_SAMPLE_CSV_FILENAME,
	type VocabCsvParseResult,
} from "@teacher-os/api/lib/vocab-csv";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";
import { VocabGroupSelectField } from "./vocab-group-select-field";

const PREVIEW_ROW_LIMIT = 20;
const MAX_CSV_FILE_BYTES = 2 * 1024 * 1024;

export type VocabCsvImportDialogProps =
	| {
			open: boolean;
			onClose: () => void;
			mode: "create-decks";
			classId: string | null;
			onImported?: () => Promise<void> | void;
	  }
	| {
			open: boolean;
			onClose: () => void;
			mode: "append-words";
			deckId: string;
			deckTitle: string;
			onImported?: () => Promise<void> | void;
	  };

function readCsvFileText(file: File): Promise<string> {
	if (typeof file.text === "function") {
		return file.text();
	}
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result ?? ""));
		reader.onerror = () =>
			reject(reader.error ?? new Error("Failed to read CSV file"));
		reader.readAsText(file, "utf-8");
	});
}

function formatDeckLessonSummary(
	lessonNumber: number | null | undefined,
	topic: string | null | undefined,
): string | null {
	const cleanTopic = topic?.trim() ?? "";
	const hasLesson =
		typeof lessonNumber === "number" &&
		Number.isInteger(lessonNumber) &&
		lessonNumber >= 1;
	if (hasLesson && cleanTopic) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")} · ${cleanTopic}`;
	}
	if (hasLesson) {
		return `Buổi ${String(lessonNumber).padStart(2, "0")}`;
	}
	return cleanTopic || null;
}

export function VocabCsvImportDialog(props: VocabCsvImportDialogProps) {
	const { open, onClose, mode, onImported } = props;
	const { data, dispatch } = useData();
	const fileInputId = useId();
	const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
	const [selectedGroupId, setSelectedGroupId] = useState("");
	const [parseResult, setParseResult] = useState<VocabCsvParseResult | null>(
		null,
	);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		setSelectedFileName(null);
		setSelectedGroupId("");
		setParseResult(null);
		setSubmitError(null);
		setSubmitting(false);
	}, [open]);

	const handleDownloadSample = () => {
		const blob = new Blob([VOCAB_SAMPLE_CSV_CONTENT], {
			type: "text/csv;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = VOCAB_SAMPLE_CSV_FILENAME;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const handleFileChange = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setSubmitError(null);
		setSelectedFileName(file.name);
		if (file.size > MAX_CSV_FILE_BYTES) {
			setParseResult({
				ok: false,
				errors: ["Dung lượng file CSV vượt quá giới hạn 2 MB."],
			});
			return;
		}
		try {
			const text = await readCsvFileText(file);
			setParseResult(parseVocabCsv(text, { mode }));
		} catch {
			setParseResult({
				ok: false,
				errors: ["Không đọc được nội dung file CSV. Vui lòng thử lại."],
			});
		}
	};

	const handleSubmit = async () => {
		if (!parseResult?.ok || submitting) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const effectiveGroupId =
				selectedGroupId.length > 0 &&
				data.vocabGroups.some((g) => g.id === selectedGroupId)
					? selectedGroupId
					: "";
			const result =
				props.mode === "create-decks"
					? await dispatch({
							type: "import-vocab-csv-decks",
							payload: {
								classId: props.classId,
								...(effectiveGroupId.length > 0
									? { groupId: effectiveGroupId }
									: {}),
								decks: parseResult.decks,
							},
						})
					: await dispatch({
							type: "import-vocab-deck-words",
							deckId: props.deckId,
							words: parseResult.words,
						});

			if (result.kind === "refreshed") {
				await onImported?.();
				toast.success(
					props.mode === "create-decks"
						? `Đã import ${parseResult.decks.length} bộ từ (${parseResult.totalWords} từ/cụm).`
						: `Đã thêm ${parseResult.totalWords} từ/cụm vào "${props.deckTitle}".`,
				);
				onClose();
				return;
			}

			if (result.kind === "committed") {
				const msg =
					"Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setSubmitError(msg);
				return;
			}

			if (result.kind === "definite-failure") {
				const msg = result.reason
					? `Không thể import CSV (${result.reason}).`
					: "Không thể import CSV.";
				toast.error(msg);
				setSubmitError(msg);
				return;
			}

			const unknownMsg =
				"Không rõ kết quả mạng — hãy kiểm tra danh sách trước khi thử lại.";
			toast.error(unknownMsg);
			setSubmitError(unknownMsg);
		} finally {
			setSubmitting(false);
		}
	};

	const previewWords = parseResult?.ok
		? parseResult.words.slice(0, PREVIEW_ROW_LIMIT)
		: [];
	const remainingCount = parseResult?.ok
		? Math.max(0, parseResult.words.length - PREVIEW_ROW_LIMIT)
		: 0;

	return (
		<Modal
			open={open}
			onClose={onClose}
			size="xl"
			scrollableBody
			title={
				props.mode === "create-decks"
					? "Import từ vựng từ CSV"
					: `Import CSV vào "${props.deckTitle}"`
			}
			description={
				props.mode === "create-decks"
					? "Tạo bộ từ theo từng buổi học (Lesson / Topic) từ file CSV chuẩn 9 cột."
					: "Thêm hàng loạt từ đơn (Word) và cụm từ (Chunk) vào bộ từ hiện tại."
			}
			footer={
				<>
					<Button
						type="button"
						variant="secondary"
						onClick={onClose}
						disabled={submitting}
					>
						Hủy
					</Button>
					<Button
						type="button"
						data-testid="vocab-csv-submit-btn"
						disabled={!parseResult?.ok || submitting}
						onClick={() => void handleSubmit()}
					>
						{submitting
							? "Đang import..."
							: props.mode === "create-decks"
								? "Tạo bộ từ từ CSV"
								: "Thêm vào bộ từ"}
					</Button>
				</>
			}
		>
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-4">
				<div className="min-w-0 flex-1 space-y-1">
					<p className="font-medium text-foreground text-sm">
						Định dạng CSV chuẩn (9 cột UTF-8)
					</p>
					<p className="break-words font-mono text-muted-foreground text-xs">
						Lesson, Topic, Type, No, Word / Chunk, IPA, Part of speech,
						Vietnamese, Example
					</p>
				</div>
				<Button
					type="button"
					size="sm"
					variant="secondary"
					data-testid="vocab-csv-download-sample"
					onClick={handleDownloadSample}
				>
					<Download className="mr-1.5 size-4" aria-hidden="true" />
					Tải file mẫu
				</Button>
			</div>

			{props.mode === "create-decks" ? (
				<VocabGroupSelectField
					groups={data.vocabGroups}
					value={selectedGroupId}
					onChange={setSelectedGroupId}
					disabled={submitting}
					testIdPrefix="vocab-csv-group-select"
				/>
			) : null}

			<div className="space-y-2">
				<label
					htmlFor={fileInputId}
					className="block font-medium text-foreground text-sm"
				>
					Chọn file CSV
				</label>
				<div className="flex flex-wrap items-center gap-3 rounded-lg border border-input border-dashed bg-card p-4">
					<Upload
						className="size-5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
					<div className="min-w-0 flex-1">
						<input
							id={fileInputId}
							type="file"
							accept=".csv,text/csv"
							data-testid="vocab-csv-file-input"
							onChange={(e) => void handleFileChange(e)}
							className="block w-full cursor-pointer rounded-md text-foreground text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-1.5 file:font-medium file:text-secondary-foreground file:text-xs hover:file:bg-accent focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
						/>
						{selectedFileName ? (
							<p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-xs">
								<FileSpreadsheet className="size-3.5" aria-hidden="true" />
								<span className="truncate">{selectedFileName}</span>
							</p>
						) : (
							<p className="mt-1 text-muted-foreground text-xs">
								Hỗ trợ file .csv mã hoá UTF-8 (Word / Chunk và Vietnamese là bắt
								buộc).
							</p>
						)}
					</div>
				</div>
			</div>

			{parseResult && !parseResult.ok ? (
				<div
					role="alert"
					data-testid="vocab-csv-errors"
					className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
				>
					<p className="font-medium">
						File CSV có {parseResult.errors.length} lỗi cần sửa:
					</p>
					<ul className="list-disc space-y-1 pl-5 text-xs">
						{parseResult.errors.map((err) => (
							<li key={err}>{err}</li>
						))}
					</ul>
				</div>
			) : null}

			{submitError ? (
				<div
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm"
				>
					{submitError}
				</div>
			) : null}

			{parseResult?.ok ? (
				<div data-testid="vocab-csv-preview" className="space-y-3">
					{props.mode === "create-decks" ? (
						<div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
							<p className="font-medium text-foreground text-sm">
								Sẽ tạo{" "}
								<span className="tabular-nums">{parseResult.decks.length}</span>{" "}
								bộ từ ({parseResult.wordCount} từ đơn · {parseResult.chunkCount}{" "}
								cụm từ)
							</p>
							<div className="divide-y divide-border rounded-md border border-border bg-card">
								{parseResult.decks.map((deck) => {
									const deckWordCount = deck.words.filter(
										(w) => w.entryType !== "chunk",
									).length;
									const deckChunkCount = deck.words.length - deckWordCount;
									const meta = formatDeckLessonSummary(
										deck.lessonNumber,
										deck.topic,
									);
									const displayTitle =
										deck.title ||
										formatVocabLessonDeckTitle(deck.lessonNumber, deck.topic);
									return (
										<div
											key={`${deck.lessonNumber ?? ""}::${deck.topic ?? ""}::${deck.title}`}
											className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
										>
											<div className="min-w-0">
												<p className="truncate font-medium text-foreground">
													{displayTitle}
												</p>
												{meta ? (
													<p className="truncate text-muted-foreground text-xs">
														{meta}
													</p>
												) : null}
											</div>
											<p className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
												{deckWordCount} từ · {deckChunkCount} cụm
											</p>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						<div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
							<span className="font-medium text-foreground">
								Bộ từ đích: {props.deckTitle}
							</span>
							<span className="font-mono text-muted-foreground text-xs tabular-nums">
								{parseResult.wordCount} Word · {parseResult.chunkCount} Chunk (
								{parseResult.totalWords} mục)
							</span>
						</div>
					)}

					<div className="overflow-x-auto rounded-md border border-border bg-card">
						<table className="w-full border-collapse text-left text-xs">
							<thead>
								<tr className="bg-muted/50 text-muted-foreground">
									<th className="px-3 py-2 font-medium">#</th>
									<th className="px-3 py-2 font-medium">Loại</th>
									<th className="px-3 py-2 font-medium">Từ / Cụm từ</th>
									<th className="px-3 py-2 font-medium">IPA</th>
									<th className="px-3 py-2 font-medium">Từ loại</th>
									<th className="px-3 py-2 font-medium">Nghĩa tiếng Việt</th>
									<th className="px-3 py-2 font-medium">Ví dụ</th>
								</tr>
							</thead>
							<tbody>
								{previewWords.map((item, idx) => (
									<tr
										key={`${idx}-${item.word}`}
										className="border-border border-t align-top"
									>
										<td className="px-3 py-2 font-mono text-muted-foreground tabular-nums">
											{idx + 1}
										</td>
										<td className="px-3 py-2">
											<span className="inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
												{item.entryType === "chunk" ? "Chunk" : "Word"}
											</span>
										</td>
										<td className="px-3 py-2 font-medium text-foreground">
											{item.word}
										</td>
										<td className="px-3 py-2 font-mono text-muted-foreground">
											{item.ipa ?? "—"}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{item.pos ?? "—"}
										</td>
										<td className="px-3 py-2 text-foreground">
											{item.translation}
										</td>
										<td className="px-3 py-2 text-muted-foreground">
											{item.example ?? "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{remainingCount > 0 ? (
						<p className="text-right font-mono text-muted-foreground text-xs tabular-nums">
							+{remainingCount} từ/cụm nữa
						</p>
					) : null}
				</div>
			) : null}
		</Modal>
	);
}
