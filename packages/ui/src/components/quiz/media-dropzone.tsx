import {
	type QuizMediaRejectReason,
	validateQuizMediaFiles,
} from "@teacher-os/api/lib/quiz-media";
import { buttonVariants } from "@teacher-os/ui/components/button";
import { cn } from "@teacher-os/ui/lib/utils";
import { UploadIcon } from "lucide-react";
import {
	type ChangeEvent,
	type DragEvent,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";

/** Kết quả chọn file đã validate — dùng chung dropzone và input "Thay file". */
export function handlePickedFiles(
	files: ArrayLike<File>,
	maxBytes: number,
	onFile: (file: File, type: string) => void,
	onReject: (reason: QuizMediaRejectReason, file?: File) => void,
): void {
	const result = validateQuizMediaFiles(files, maxBytes);
	if (result.ok) {
		onFile(result.file, result.type);
	} else {
		onReject(result.reason, "file" in result ? result.file : undefined);
	}
}

/**
 * Vùng kéo-thả hoặc bấm chọn 1 file audio/video (#305) — thuần trình bày,
 * không biết upload. Validate qua `validateQuizMediaFiles` trước khi gọi
 * `onFile`. Bàn phím: Enter/Space mở hộp chọn file.
 */
export function MediaDropzone({
	accept,
	maxBytes,
	disabled = false,
	onFile,
	onReject,
	hint,
}: {
	accept: string;
	maxBytes: number;
	disabled?: boolean;
	onFile: (file: File, type: string) => void;
	onReject: (reason: QuizMediaRejectReason, file?: File) => void;
	hint?: ReactNode;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const hintId = useId();
	// Đếm enter/leave: rê qua phần tử con bắn dragleave của cha — đếm để
	// trạng thái "Thả để tải lên" không nhấp nháy.
	const dragDepth = useRef(0);
	const [dragging, setDragging] = useState(false);

	const openPicker = () => {
		if (!disabled) inputRef.current?.click();
	};

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		if (disabled) return;
		dragDepth.current += 1;
		setDragging(true);
	};
	const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
	};
	const handleDragLeave = () => {
		dragDepth.current = Math.max(0, dragDepth.current - 1);
		if (dragDepth.current === 0) setDragging(false);
	};
	const handleDrop = (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		dragDepth.current = 0;
		setDragging(false);
		if (disabled) return;
		handlePickedFiles(event.dataTransfer.files, maxBytes, onFile, onReject);
	};
	const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			handlePickedFiles(files, maxBytes, onFile, onReject);
		}
		// Reset để chọn lại đúng file đó vẫn bắn change.
		event.target.value = "";
	};
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openPicker();
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: vùng thả file chứa nhãn và nút giả; <button> không nhận drop + nội dung khối.
		<div
			role="button"
			data-slot="media-dropzone"
			tabIndex={disabled ? -1 : 0}
			aria-disabled={disabled || undefined}
			aria-label="Kéo thả file vào đây hoặc chọn file"
			aria-describedby={hint ? hintId : undefined}
			data-dragging={dragging || undefined}
			onClick={openPicker}
			onKeyDown={handleKeyDown}
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={cn(
				"flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 border-border border-dashed bg-muted px-6 py-10 text-center transition-colors focus-visible:outline-2 focus-visible:outline-primary",
				dragging
					? "border-primary border-solid bg-primary/5"
					: "hover:border-primary/60",
				disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
			)}
		>
			<UploadIcon aria-hidden className="size-6 text-muted-foreground" />
			<p className="text-foreground text-sm">
				{dragging ? (
					"Thả để tải lên"
				) : (
					<>
						Kéo thả file vào đây hoặc{" "}
						<span
							className={cn(
								buttonVariants({ variant: "outline", size: "sm" }),
								"ml-1 align-middle",
							)}
						>
							Chọn file
						</span>
					</>
				)}
			</p>
			{hint && (
				<p id={hintId} className="text-muted-foreground text-xs">
					{hint}
				</p>
			)}
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				hidden
				tabIndex={-1}
				// input.click() bubble lên div cha (onClick → openPicker) — chặn
				// để không mở hộp chọn file lần hai.
				onClick={(event) => event.stopPropagation()}
				onChange={handleChange}
				data-testid="media-dropzone-input"
			/>
		</div>
	);
}
