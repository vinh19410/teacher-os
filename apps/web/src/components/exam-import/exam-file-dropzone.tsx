import { EXAM_IMPORT_MIME } from "@teacher-os/api/contracts";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Dropzone chọn file đề (phase-03): PDF/PNG/JPEG, bấm chọn hoặc kéo-thả.
 * Chọn file xong gọi onFile ngay để route POST lên server; đang upload
 * (disabled) thì chặn cả click lẫn drop. Extend từ EXAM_IMPORT_MIME để
 * accept luôn khớp contract (đóng băng ở packages/api).
 */
const ACCEPT = EXAM_IMPORT_MIME.map((mime) => {
	switch (mime) {
		case "application/pdf":
			return ".pdf";
		case "image/png":
			return ".png";
		case "image/jpeg":
			return ".jpg,.jpeg";
		default:
			return mime;
	}
}).join(",");

export function ExamFileDropzone({
	disabled,
	onFile,
}: {
	disabled: boolean;
	onFile: (file: File) => void;
}) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);

	const emitFirstFile = useCallback(
		(files: FileList | null) => {
			const file = files?.[0];
			if (file && !disabled) onFile(file);
		},
		[disabled, onFile],
	);

	return (
		<>
			{/* Input nằm ngoài button để click trên input không bubble về lại
			button (tránh vòng lặp input.click() → onClick → input.click()). */}
			<input
				ref={inputRef}
				data-testid="exam-import-file-input"
				type="file"
				accept={ACCEPT}
				className="sr-only"
				disabled={disabled}
				onChange={(e) => {
					emitFirstFile(e.target.files);
					// Cho phép chọn lại cùng một file sau lỗi mà không cần đổi tên.
					e.target.value = "";
				}}
			/>
			<button
				type="button"
				data-testid="exam-import-dropzone"
				disabled={disabled}
				aria-label="Chọn tệp đề thi để nhập bằng AI"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					if (!disabled) setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					emitFirstFile(e.dataTransfer.files);
				}}
				className={cn(
					"flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					dragOver
						? "border-primary bg-accent"
						: "border-input hover:bg-accent/50",
					disabled && "pointer-events-none opacity-60",
				)}
			>
				<p className="font-medium text-sm">
					Kéo tệp đề vào đây, hoặc bấm để chọn
				</p>
				<p className="text-muted-foreground text-xs">
					PDF, PNG, JPG hoặc JPEG — tối đa 15 MB
				</p>
			</button>
		</>
	);
}
