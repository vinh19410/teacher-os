import type { QuizAttemptMedia } from "@teacher-os/api/contracts";
import { isVideoMediaType } from "@teacher-os/api/lib/quiz-media";
import { Loader2Icon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import { fetchSubmissionMediaObjectUrl } from "@/lib/repos/grading";

/**
 * Phát lại file bài nói học viên cho giáo viên chấm (#319). Nút tải blob
 * qua `/api/grading/:attemptId/media` khi bấm (header cùng route học viên,
 * xem `fetchSubmissionMediaObjectUrl`). Blob tự tải được revoke khi
 * unmount; caller key component theo `media.uploadedAt` để file mới luôn
 * có player mới.
 */
export function SubmissionMediaPlayer({
	media,
	attemptId,
}: {
	media: QuizAttemptMedia;
	attemptId: string;
}) {
	const [fetchedUrl, setFetchedUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(false);
	const [playbackError, setPlaybackError] = useState(false);
	const isVideo = isVideoMediaType(media.type);

	// Tải dở khi unmount (rời trang chấm): hủy request và không tạo URL mới
	// — blob tới sau unmount sẽ không ai revoke.
	const loadController = useRef<AbortController | null>(null);
	useEffect(() => {
		return () => loadController.current?.abort();
	}, []);

	useEffect(() => {
		return () => {
			if (fetchedUrl) URL.revokeObjectURL(fetchedUrl);
		};
	}, [fetchedUrl]);

	const load = async () => {
		const controller = new AbortController();
		loadController.current = controller;
		setLoading(true);
		setLoadError(false);
		try {
			const objectUrl = await fetchSubmissionMediaObjectUrl(
				attemptId,
				controller.signal,
			);
			if (controller.signal.aborted) {
				URL.revokeObjectURL(objectUrl);
				return;
			}
			setFetchedUrl(objectUrl);
		} catch (error) {
			if (controller.signal.aborted) return;
			if (isHttpError(error) && error.status === 401) {
				reauth();
				return;
			}
			setLoadError(true);
		} finally {
			if (!controller.signal.aborted) setLoading(false);
		}
	};

	if (fetchedUrl === null) {
		return (
			<div className="flex flex-wrap items-center gap-3">
				<Button
					type="button"
					variant="secondary"
					onClick={() => void load()}
					disabled={loading}
				>
					{loading ? (
						<Loader2Icon aria-hidden className="animate-spin" />
					) : (
						<PlayIcon aria-hidden />
					)}
					{isVideo ? "Xem bài nói" : "Nghe bài nói"}
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
					src={fetchedUrl}
					controls
					playsInline
					preload="metadata"
					aria-label="Bài nói của học viên"
					onError={() => setPlaybackError(true)}
					className="max-h-80 w-full rounded-md border border-line bg-fg/5"
				/>
			) : (
				// biome-ignore lint/a11y/useMediaCaption: bài nói học viên tự ghi âm, không có phụ đề.
				<audio
					src={fetchedUrl}
					controls
					preload="metadata"
					aria-label="Bài nói của học viên"
					onError={() => setPlaybackError(true)}
					className="w-full"
				/>
			)}
			{playbackError && (
				<p role="alert" className="text-muted-fg text-sm">
					Trình duyệt không phát được định dạng này.{" "}
					<a
						href={fetchedUrl}
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
