import {
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
	EXAM_IMPORT_MIME,
} from "@teacher-os/api/contracts";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { checkExamFile, type ExamFileCheckError } from "@/lib/exam-file-check";

/**
 * Dropzone chọn file đề (phase-03): PDF/PNG/JPEG, bấm chọn hoặc kéo-thả.
 * Chọn file xong kiểm tra NGAY Ở client (TOS-27 phase-02): sai kiểu / quá
 * 15 MB / quá 20 trang / PDF có mật khẩu → alert E-003 kèm lý do cụ thể,
 * KHÔNG gọi API (server vẫn kiểm lại — guard này chỉ fail-fast). Đang
 * upload (disabled) thì chặn cả click lẫn drop. Extend từ EXAM_IMPORT_MIME
 * để accept luôn khớp contract (đóng băng ở packages/api).
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
	const [fileError, setFileError] = useState<ExamFileCheckError | null>(null);
	const [checking, setChecking] = useState(false);

	const emitFirstFile = useCallback(
		async (files: FileList | null) => {
			const file = files?.[0];
			if (!file || disabled || checking) return;
			setChecking(true);
			setFileError(null);
			try {
				const error = await checkExamFile(file);
				if (error) {
					setFileError(error);
					return;
				}
				onFile(file);
			} finally {
				setChecking(false);
			}
		},
		[disabled, checking, onFile],
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
					void emitFirstFile(e.target.files);
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
					void emitFirstFile(e.dataTransfer.files);
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
					PDF, PNG, JPG hoặc JPEG — tối đa 20 trang, 15 MB, không khóa mật khẩu
				</p>
			</button>
			{fileError && (
				<div
					role="alert"
					data-testid="exam-import-file-error"
					className="mt-3 rounded-lg border border-warn bg-warn/10 p-4 text-sm"
				>
					<p>
						{EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE]}
					</p>
					<p className="mt-1 font-medium">{fileError.detail}</p>
				</div>
			)}
		</>
	);
}
