import type { QuizAttemptMedia } from "@teacher-os/api/contracts";
import { isVideoMediaType } from "@teacher-os/api/lib/quiz-media";
import { Button } from "@teacher-os/ui/components/button";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchQuizMediaObjectUrl } from "@/lib/repos/quiz";

/**
 * Phát lại file bài nói (#305). `localUrl` (file vừa chọn, blob của chính
 * File) → phát ngay, không tốn mạng. Không có → nút "Nghe lại bài nói"
 * tải blob qua API khi học viên bấm (có header org, xem
 * `fetchQuizMediaObjectUrl`). Blob tự tải được revoke khi unmount; caller
 * key component theo `media.uploadedAt` để file mới luôn có player mới.
 */
export function QuizMediaPlayer({
	media,
	attemptId,
	localUrl = null,
}: {
	media: QuizAttemptMedia;
	attemptId: string;
	localUrl?: string | null;
}) {
	const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [playbackError, setPlaybackError] = useState(false);
	const isVideo = isVideoMediaType(media.type);

	useEffect(() => {
		return () => {
			if (fetchedUrl) URL.revokeObjectURL(fetchedUrl);
		};
	}, [fetchedUrl]);

	const url = localUrl ?? fetchedUrl;

	const load = async () => {
		setLoading(true);
		setLoadError(false);
		try {
			setFetchedUrl(await fetchQuizMediaObjectUrl(attemptId));
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	};

	if (url === null) {
		return (
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="outline"
					onClick={() => void load()}
					disabled={loading}
				>
					{loading ? (
						<Loader2Icon aria-hidden className="animate-spin" />
					) : (
						<PlayIcon aria-hidden />
					)}
					{isVideo ? "Xem lại bài nói" : "Nghe lại bài nói"}
				</Button>
				{loadError && (
					<p role="alert" className="text-danger text-sm">
						Không tải được file. Thử lại.
					</p>
				)}
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{isVideo ? (
				// biome-ignore lint/a11y/useMediaCaption: bài nói học viên tự quay, không có phụ đề.
				<video
					src={url}
					controls
					playsInline
					preload="metadata"
					aria-label="Bài nói đã nộp"
					onError={() => setPlaybackError(true)}
					className="max-h-80 w-full rounded-md border border-line bg-fg/5"
				/>
			) : (
				// biome-ignore lint/a11y/useMediaCaption: bài nói học viên tự ghi âm, không có phụ đề.
				<audio
					src={url}
					controls
					preload="metadata"
					aria-label="Bài nói đã nộp"
					onError={() => setPlaybackError(true)}
					className="w-full"
				/>
			)}
			{playbackError && (
				<p role="alert" className="text-muted-fg text-sm">
					Trình duyệt không phát được định dạng này.{" "}
					<a
						href={url}
						download={media.name}
						className="text-accent-blue underline-offset-4 hover:underline"
					>
						Tải file về
					</a>
				</p>
			)}
		</div>
	);
}
