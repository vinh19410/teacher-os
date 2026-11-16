import { resolveLibraryAudioMimeType } from "@teacher-os/api/lib/quiz-media";
import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import {
	PLACEMENT_AUDIO_MAX_BYTES,
	type PlacementAudioMeta,
} from "@teacher-os/api/placement-test-contracts";
import { Headphones, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	fetchAudioBlobUrl,
	isPlacementHttpError,
	type UploadedPlacementAudio,
	uploadAudio,
} from "@/lib/repos/placement-test";

const ACCEPT_AUDIO = [
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

export function preparePlacementAudioFile(
	file: File,
): { ok: true; mimeType: string } | { ok: false; message: string } {
	const mimeType = resolveLibraryAudioMimeType(file.name, file.type);
	if (!mimeType) {
		return {
			ok: false,
			message: "Định dạng file âm thanh không được hỗ trợ.",
		};
	}
	if (file.size <= 0) {
		return { ok: false, message: "File âm thanh rỗng." };
	}
	if (file.size > PLACEMENT_AUDIO_MAX_BYTES) {
		return {
			ok: false,
			message: "Dung lượng file âm thanh không được vượt quá 20 MB.",
		};
	}
	return { ok: true, mimeType };
}

export function placementAudioErrorMessage(error: unknown): string {
	if (isPlacementHttpError(error)) {
		if (error.code === "UNSUPPORTED_AUDIO_TYPE" || error.status === 415) {
			return "Định dạng file âm thanh không được hỗ trợ.";
		}
		if (error.code === "AUDIO_TOO_LARGE" || error.status === 413) {
			return "Dung lượng file âm thanh không được vượt quá 20 MB.";
		}
		if (error.code === "INVALID_AUDIO" || error.status === 400) {
			return "File âm thanh không hợp lệ.";
		}
		return error.message;
	}
	return error instanceof Error ? error.message : "Tải audio lên thất bại.";
}
function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface ClipAudioFieldProps {
	clipId: string;
	clipNumber: number;
	audioId: string | null;
	audioMeta?: PlacementAudioMeta;
	onUploaded: (uploaded: UploadedPlacementAudio) => void;
	optional?: boolean;
	titleLabel?: string;
	emptyHint?: string;
	uploadAriaLabel?: string;
	previewAriaLabel?: string;
	clearAriaLabel?: string;
	onClear?: () => void;
}

export function ClipAudioField({
	clipId,
	clipNumber,
	audioId,
	audioMeta,
	onUploaded,
	optional = false,
	titleLabel,
	emptyHint,
	uploadAriaLabel,
	previewAriaLabel,
	clearAriaLabel,
	onClear,
}: ClipAudioFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const mountedRef = useRef(true);
	const previewRequestRef = useRef(0);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			previewRequestRef.current += 1;
		};
	}, []);

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	// Khi đổi audioId sang file khác, hủy preview request cũ và thu hồi blob URL cũ.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset preview when audioId changes
	useEffect(() => {
		previewRequestRef.current += 1;
		setLoadingPreview(false);
		setPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});
	}, [audioId]);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		const prepared = preparePlacementAudioFile(file);
		if (!prepared.ok) {
			toast.error(prepared.message);
			return;
		}

		setUploading(true);
		setProgress(0);
		try {
			const uploaded = await uploadAudio({
				file,
				fileName: file.name,
				type: prepared.mimeType,
				onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
			});
			onUploaded(uploaded);
			toast.success(`Đã tải lên audio "${uploaded.name}"`);
		} catch (error) {
			toast.error(placementAudioErrorMessage(error));
		} finally {
			setUploading(false);
			setProgress(null);
		}
	};

	const handleLoadPreview = async () => {
		if (!audioId || loadingPreview) return;
		const reqId = ++previewRequestRef.current;
		setLoadingPreview(true);
		try {
			const url = await fetchAudioBlobUrl(audioId);
			if (!mountedRef.current || reqId !== previewRequestRef.current) {
				URL.revokeObjectURL(url);
				return;
			}
			setPreviewUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return url;
			});
		} catch (error) {
			if (!mountedRef.current || reqId !== previewRequestRef.current) return;
			toast.error(
				error instanceof Error
					? error.message
					: "Không thể tải audio nghe thử.",
			);
		} finally {
			if (mountedRef.current && reqId === previewRequestRef.current) {
				setLoadingPreview(false);
			}
		}
	};

	return (
		<div
			data-clip-audio={clipId}
			className="rounded-md border border-border bg-muted/40 p-3"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="min-w-0">
					<div className="font-medium text-foreground text-xs">
						{titleLabel ?? `File âm thanh đoạn ${clipNumber}`}
					</div>
					{audioId ? (
						<div className="mt-0.5 truncate text-muted-foreground text-xs">
							{audioMeta
								? `${audioMeta.name} (${formatBytes(audioMeta.size)})`
								: `Đã gắn audio (${audioId.slice(0, 8)}…)`}
						</div>
					) : (
						<div
							className={`mt-0.5 text-xs ${
								optional ? "text-muted-foreground" : "text-destructive"
							}`}
						>
							{emptyHint ??
								(optional
									? "Tùy chọn — bỏ trống hệ thống tự đọc câu hỏi bằng giọng tiếng Anh"
									: "Chưa có file âm thanh")}
						</div>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept={ACCEPT_AUDIO}
						aria-label={
							uploadAriaLabel ?? `Tải audio cho đoạn nghe ${clipNumber}`
						}
						onChange={handleFileChange}
						className="sr-only"
					/>
					<Button
						variant="outline"
						size="sm"
						disabled={uploading}
						onClick={() => fileInputRef.current?.click()}
					>
						<Upload className="size-3.5" />
						{uploading
							? `Đang tải${progress !== null ? ` ${progress}%` : "..."}`
							: audioId
								? "Thay audio"
								: "Tải audio lên"}
					</Button>

					{audioId && !previewUrl && (
						<Button
							variant="secondary"
							size="sm"
							disabled={loadingPreview}
							onClick={handleLoadPreview}
						>
							<Headphones className="size-3.5" />
							{loadingPreview ? "Đang tải..." : "Nghe thử"}
						</Button>
					)}

					{audioId && onClear && (
						<Button
							variant="ghost"
							size="sm"
							disabled={uploading}
							aria-label={clearAriaLabel ?? `Gỡ audio đoạn ${clipNumber}`}
							onClick={() => {
								setPreviewUrl((prev) => {
									if (prev) URL.revokeObjectURL(prev);
									return null;
								});
								onClear();
							}}
						>
							<X className="size-3.5" />
							Gỡ audio
						</Button>
					)}
				</div>
			</div>

			{audioId && previewUrl && (
				<div className="mt-2">
					{/* biome-ignore lint/a11y/useMediaCaption: teacher audio preview for placement test */}
					<audio
						controls
						src={previewUrl}
						aria-label={
							previewAriaLabel ?? `Trình phát nghe thử đoạn ${clipNumber}`
						}
						className="h-9 w-full"
					/>
				</div>
			)}
		</div>
	);
}
