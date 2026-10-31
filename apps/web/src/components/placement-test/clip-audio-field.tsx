import { LIBRARY_AUDIO_MIME } from "@teacher-os/api/library-contracts";
import {
	PLACEMENT_AUDIO_MAX_BYTES,
	type PlacementAudioMeta,
} from "@teacher-os/api/placement-test-contracts";
import { Headphones, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	fetchAudioBlobUrl,
	type UploadedPlacementAudio,
	uploadAudio,
} from "@/lib/repos/placement-test";

const ACCEPT_AUDIO = Object.keys(LIBRARY_AUDIO_MIME).join(",");

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
}

export function ClipAudioField({
	clipId,
	clipNumber,
	audioId,
	audioMeta,
	onUploaded,
}: ClipAudioFieldProps) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const [progress, setProgress] = useState<number | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const [loadingPreview, setLoadingPreview] = useState(false);

	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	// Khi đổi audioId sang file khác, thu hồi blob URL cũ.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset preview when audioId changes
	useEffect(() => {
		setPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return null;
		});
	}, [audioId]);

	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;

		const mime = file.type || "audio/mpeg";
		if (!Object.hasOwn(LIBRARY_AUDIO_MIME, mime)) {
			toast.error("Định dạng file âm thanh không được hỗ trợ.");
			return;
		}
		if (file.size <= 0 || file.size > PLACEMENT_AUDIO_MAX_BYTES) {
			toast.error("Dung lượng file âm thanh không được vượt quá 20 MB.");
			return;
		}

		setUploading(true);
		setProgress(0);
		try {
			const uploaded = await uploadAudio({
				file,
				fileName: file.name,
				type: mime,
				onProgress: (fraction) => setProgress(Math.round(fraction * 100)),
			});
			onUploaded(uploaded);
			toast.success(`Đã tải lên audio "${uploaded.name}"`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Tải audio lên thất bại.",
			);
		} finally {
			setUploading(false);
			setProgress(null);
		}
	};

	const handleLoadPreview = async () => {
		if (!audioId || loadingPreview) return;
		setLoadingPreview(true);
		try {
			const url = await fetchAudioBlobUrl(audioId);
			setPreviewUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return url;
			});
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Không thể tải audio nghe thử.",
			);
		} finally {
			setLoadingPreview(false);
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
						File âm thanh đoạn {clipNumber}
					</div>
					{audioId ? (
						<div className="mt-0.5 truncate text-muted-foreground text-xs">
							{audioMeta
								? `${audioMeta.name} (${formatBytes(audioMeta.size)})`
								: `Đã gắn audio (${audioId.slice(0, 8)}…)`}
						</div>
					) : (
						<div className="mt-0.5 text-destructive text-xs">
							Chưa có file âm thanh
						</div>
					)}
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept={ACCEPT_AUDIO}
						aria-label={`Tải audio cho đoạn nghe ${clipNumber}`}
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
				</div>
			</div>

			{previewUrl && (
				<div className="mt-2">
					{/* biome-ignore lint/a11y/useMediaCaption: teacher audio preview for listening test */}
					<audio
						controls
						src={previewUrl}
						aria-label={`Trình phát nghe thử đoạn ${clipNumber}`}
						className="h-9 w-full"
					/>
				</div>
			)}
		</div>
	);
}
