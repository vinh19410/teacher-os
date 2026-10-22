import { formatMediaSize } from "@teacher-os/api/lib/quiz-media";
import {
	LIBRARY_AUDIO_MAX_BYTES,
	LIBRARY_AUDIO_MIME,
	type LibraryPartAudio,
} from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import {
	type ChangeEvent,
	type DragEvent,
	type KeyboardEvent,
	useId,
	useRef,
	useState,
} from "react";
import {
	deleteLibraryAudio,
	libraryAudioUrl,
	uploadLibraryAudio,
} from "@/lib/repos/library";
import { libraryErrorMessage } from "./library-error";

/**
 * Vùng tải lên / quản lý audio cho part listening (phase 6). Tiến trình
 * upload qua `uploadLibraryAudio` dùng XMLHttpRequest — fetch không báo
 * tiến trình upload và duplex streaming chưa khả dụng rộng; cùng lựa chọn
 * với precedent Speaking của student (`apps/student/src/lib/repos/quiz.ts`).
 * Lỗi và tiến trình hiển thị ngay tại khối (inline), không cần toast.
 */

type AudioUploadState =
	| { kind: "idle" }
	| { kind: "uploading"; file: File; progress: number }
	| { kind: "error"; message: string };

/** Thông báo từ chối file theo allowlist MIME + trần 50MB của contract. */
export function audioRejectMessage(file: File): string {
	const type = file.type.toLowerCase();
	if (!(type in LIBRARY_AUDIO_MIME)) {
		return `Định dạng ${type || "không xác định"} không hỗ trợ — dùng MP3, M4A, WAV, AAC, OGG hoặc WEBM.`;
	}
	if (file.size > LIBRARY_AUDIO_MAX_BYTES) {
		return `File lớn hơn ${formatMediaSize(LIBRARY_AUDIO_MAX_BYTES)} — hãy nén audio trước khi tải lên.`;
	}
	return "File không hợp lệ.";
}

export function AudioUploader({
	testId,
	slot,
	audio,
	locked,
	onChanged,
}: {
	testId: string;
	slot: string;
	/** Audio đã lưu trên server (null = chưa có). */
	audio: LibraryPartAudio | null;
	/** Đề đang `ready`: khóa thay/xóa audio kèm giải thích. */
	locked: boolean;
	/** Gọi sau khi upload/xóa thành công để parent refetch detail. */
	onChanged: () => void;
}) {
	const uid = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const abortRef = useRef<AbortController | null>(null);
	const dragDepth = useRef(0);
	const [state, setState] = useState<AudioUploadState>({ kind: "idle" });

	const accept = Object.keys(LIBRARY_AUDIO_MIME).join(",");

	const startUpload = (file: File) => {
		const type = file.type.toLowerCase();
		if (!(type in LIBRARY_AUDIO_MIME) || file.size > LIBRARY_AUDIO_MAX_BYTES) {
			setState({ kind: "error", message: audioRejectMessage(file) });
			return;
		}
		const controller = new AbortController();
		abortRef.current = controller;
		setState({ kind: "uploading", file, progress: 0 });
		uploadLibraryAudio({
			testId,
			slot,
			file,
			type,
			signal: controller.signal,
			onProgress: (progress) => {
				setState((previous) =>
					previous.kind === "uploading" ? { ...previous, progress } : previous,
				);
			},
		})
			.then(() => {
				setState({ kind: "idle" });
				onChanged();
			})
			.catch((error: unknown) => {
				if (error instanceof DOMException && error.name === "AbortError") {
					setState({ kind: "idle" });
					return;
				}
				setState({ kind: "error", message: libraryErrorMessage(error) });
			});
	};

	const handleDelete = () => {
		if (
			!window.confirm(
				`Xóa audio «${audio?.name}»? Phải tải lên lại nếu muốn phục hồi.`,
			)
		) {
			return;
		}
		deleteLibraryAudio(testId, slot)
			.then(() => onChanged())
			.catch((error: unknown) => {
				setState({
					kind: "error",
					message: libraryErrorMessage(error),
				});
			});
	};

	const openPicker = () => {
		if (!locked && state.kind !== "uploading") inputRef.current?.click();
	};

	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		dragDepth.current = 0;
		if (locked || state.kind === "uploading") return;
		const file = event.dataTransfer.files[0];
		if (file) startUpload(file);
	};

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		if (locked || state.kind === "uploading") return;
		dragDepth.current += 1;
	};

	const handleDragLeave = () => {
		dragDepth.current = Math.max(0, dragDepth.current - 1);
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openPicker();
		}
	};

	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) startUpload(file);
		event.target.value = "";
	};

	if (audio) {
		return (
			<div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{audio.name}</p>
						<p className="text-muted-foreground text-xs">
							{formatMediaSize(audio.size)} · đã tải{" "}
							{new Date(audio.uploadedAt).toLocaleString("vi-VN")}
						</p>
					</div>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={locked}
							title={
								locked
									? "Đề đã xuất bản — hãy hạ về nháp để thay audio."
									: undefined
							}
							onClick={openPicker}
							className={buttonVariants({
								variant: "outline",
								size: "sm",
								className: locked ? "pointer-events-none opacity-50" : "",
							})}
						>
							Thay file
						</button>
						<button
							type="button"
							disabled={locked}
							title={
								locked
									? "Đề đã xuất bản — hãy hạ về nháp để xóa audio."
									: undefined
							}
							onClick={handleDelete}
							className={buttonVariants({
								variant: "destructive",
								size: "sm",
								className: locked ? "pointer-events-none opacity-50" : "",
							})}
						>
							Xóa audio
						</button>
					</div>
				</div>
				{/* biome-ignore lint/a11y/useMediaCaption: audio đề listening không có track phụ đề kèm theo */}
				<audio
					controls
					preload="none"
					src={libraryAudioUrl(testId, slot)}
					className="w-full"
				/>
				{state.kind === "error" && (
					<p role="alert" className="text-destructive text-xs">
						{state.message}
					</p>
				)}
				<input
					ref={inputRef}
					type="file"
					accept={accept}
					hidden
					tabIndex={-1}
					onChange={handleChange}
					data-testid={`${uid}-audio-input`}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<span className="font-medium text-sm">Audio của part</span>
			{state.kind === "uploading" ? (
				<div className="flex flex-col gap-1 rounded-md border p-3">
					<p className="text-sm">
						Đang tải «{state.file.name}»… {Math.round(state.progress * 100)}%
					</p>
					<div
						role="progressbar"
						aria-valuenow={Math.round(state.progress * 100)}
						aria-valuemin={0}
						aria-valuemax={100}
						aria-label="Tiến trình tải audio"
						className="h-2 w-full overflow-hidden rounded-full bg-muted"
					>
						<div
							className="h-full bg-primary transition-[width]"
							style={{ width: `${Math.round(state.progress * 100)}%` }}
						/>
					</div>
					<button
						type="button"
						className={buttonVariants({
							variant: "ghost",
							size: "sm",
							className: "self-start",
						})}
						onClick={() => abortRef.current?.abort()}
					>
						Hủy tải lên
					</button>
				</div>
			) : (
				// biome-ignore lint/a11y/useSemanticElements: vùng thả file chứa nhãn + nút giả; <button> không nhận drop.
				<div
					role="button"
					data-slot="library-audio-dropzone"
					tabIndex={locked ? -1 : 0}
					aria-disabled={locked || undefined}
					aria-label="Kéo thả file audio vào đây hoặc chọn file"
					data-dragging={dragDepth.current > 0 || undefined}
					onClick={openPicker}
					onKeyDown={handleKeyDown}
					onDragEnter={handleDragEnter}
					onDragOver={(event) => event.preventDefault()}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					className="flex flex-col items-center gap-2 rounded-md border-2 border-border border-dashed bg-muted px-6 py-8 text-center transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
				>
					<p className="text-foreground text-sm">
						Kéo thả file audio vào đây hoặc{" "}
						<span
							className={buttonVariants({
								variant: "outline",
								size: "sm",
								className: "ml-1 align-middle",
							})}
						>
							Chọn file
						</span>
					</p>
					<p className="text-muted-foreground text-xs">
						MP3, M4A, WAV, AAC, OGG, WEBM · tối đa{" "}
						{formatMediaSize(LIBRARY_AUDIO_MAX_BYTES)}
						{locked ? " · đề đã xuất bản — hãy hạ về nháp để tải audio." : ""}
					</p>
				</div>
			)}
			{state.kind === "error" && (
				<p role="alert" className="text-destructive text-xs">
					{state.message}
				</p>
			)}
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				hidden
				tabIndex={-1}
				onChange={handleChange}
				data-testid={`${uid}-audio-input`}
			/>
		</div>
	);
}
