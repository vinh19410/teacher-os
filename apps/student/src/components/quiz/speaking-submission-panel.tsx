import { useQueryClient } from "@tanstack/react-query";
import {
	QUIZ_MEDIA_MAX_BYTES,
	QUIZ_MEDIA_TYPES,
	type QuizAttemptMedia,
} from "@teacher-os/api/contracts";
import {
	formatMediaSize,
	isVideoMediaType,
	type QuizMediaRejectReason,
} from "@teacher-os/api/lib/quiz-media";
import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@teacher-os/ui/components/attachment";
import {
	handlePickedFiles,
	MediaDropzone,
} from "@teacher-os/ui/components/quiz/media-dropzone";
import { AlertTriangleIcon, MusicIcon, VideoIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { QuizDialog } from "@/components/quiz/quiz-lifecycle-dialogs";
import { QuizMediaPlayer } from "@/components/quiz/quiz-media-player";
import {
	progressState,
	rejectMessage,
	SPEAKING_FORMAT_LABELS,
	type SpeakingUploadState,
	speakingPartGuide,
	uploadFailure,
} from "@/components/quiz/speaking-upload-state";
import { formatVietnamSubmittedAt } from "@/lib/attempt-format";
import { isHttpError } from "@/lib/query-client";
import {
	deleteQuizMedia,
	quizDetailQueryOptions,
	setQuizDetailMedia,
	uploadQuizMedia,
} from "@/lib/repos/quiz";

/** `accept` của input file: MIME allowlist + đuôi (Windows hay báo MIME rỗng). */
const MEDIA_ACCEPT = [
	...Object.keys(QUIZ_MEDIA_TYPES),
	".mp3",
	".m4a",
	".aac",
	".wav",
	".webm",
	".weba",
	".ogg",
	".oga",
	".mp4",
	".mov",
].join(",");

function MediaKindIcon({ type }: { type: string }) {
	return isVideoMediaType(type) ? (
		<VideoIcon aria-hidden />
	) : (
		<MusicIcon aria-hidden />
	);
}

/** Card "Hướng dẫn làm bài" của đề Speaking — chuẩn theo part + cách nộp. */
export function SpeakingGuideCard({ part }: { part: string }) {
	const partGuide = speakingPartGuide(part);
	return (
		<section
			aria-label="Hướng dẫn làm bài"
			className="rounded-[var(--radius-lg)] border border-line bg-surface/50 p-4 text-sm"
		>
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Hướng dẫn làm bài
			</p>
			<ul className="mt-2 ml-5 list-disc space-y-1">
				{partGuide && <li>{partGuide}</li>}
				<li>
					Ghi âm hoặc quay video câu trả lời bằng điện thoại/máy tính, rồi tải
					lên <strong>1 file</strong>.
				</li>
				<li>
					Định dạng: {SPEAKING_FORMAT_LABELS} · tối đa 50 MB · video nên quay
					720p để file nhẹ. iPhone: Cài đặt → Camera → Định dạng → "Tương thích
					nhất" để máy tính nào cũng phát được.
				</li>
			</ul>
		</section>
	);
}

/**
 * Phần hiển thị của panel nộp bài — thuần props, không gọi mạng, để test
 * markup từng trạng thái. Container `SpeakingSubmissionPanel` bên dưới giữ
 * state machine và gọi API.
 */
export function SpeakingSubmissionView({
	attemptId,
	media,
	state,
	notice,
	localUrl,
	disabled,
	onFile,
	onReject,
	onCancel,
	onRetry,
	onPickOther,
	onReplace,
	onDelete,
}: {
	attemptId: string;
	media: QuizAttemptMedia | null;
	state: SpeakingUploadState;
	notice: string | null;
	localUrl: string | null;
	disabled: boolean;
	onFile: (file: File, type: string) => void;
	onReject: (reason: QuizMediaRejectReason, file?: File) => void;
	onCancel: () => void;
	onRetry: () => void;
	onPickOther: () => void;
	onReplace: () => void;
	onDelete: () => void;
}) {
	const uploading = state.kind === "uploading" || state.kind === "processing";
	let uploadBlock: React.ReactNode = null;
	if (uploading) {
		const percent =
			state.kind === "uploading" ? Math.round(state.progress * 100) : 100;
		uploadBlock = (
			<Attachment
				state={state.kind}
				className="w-full rounded-md border-line bg-bg"
			>
				<AttachmentMedia>
					<MediaKindIcon type={state.type} />
				</AttachmentMedia>
				<AttachmentContent>
					<AttachmentTitle>{state.file.name}</AttachmentTitle>
					<AttachmentDescription>
						{formatMediaSize(state.file.size)} ·{" "}
						{state.kind === "processing" ? "Đang xử lý…" : `${percent}% đã tải`}
					</AttachmentDescription>
					<div
						role="progressbar"
						aria-label="Tiến trình tải lên"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={percent}
						className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line"
					>
						<div
							className="h-full bg-accent-blue transition-[width]"
							style={{ width: `${percent}%` }}
						/>
					</div>
				</AttachmentContent>
				{state.kind === "uploading" && (
					<AttachmentActions>
						<AttachmentAction size="sm" variant="ghost" onClick={onCancel}>
							Hủy
						</AttachmentAction>
					</AttachmentActions>
				)}
			</Attachment>
		);
	} else if (state.kind === "error") {
		uploadBlock = (
			<Attachment state="error" className="w-full rounded-md bg-bg">
				<AttachmentMedia>
					<AlertTriangleIcon aria-hidden />
				</AttachmentMedia>
				<AttachmentContent>
					<AttachmentTitle>{state.file.name}</AttachmentTitle>
					<AttachmentDescription role="alert">
						{state.message}
					</AttachmentDescription>
				</AttachmentContent>
				<AttachmentActions className="gap-1">
					{state.retryable && (
						<AttachmentAction
							size="sm"
							variant="outline"
							onClick={onRetry}
							disabled={disabled}
						>
							Thử lại
						</AttachmentAction>
					)}
					<AttachmentAction
						size="sm"
						variant="ghost"
						onClick={onPickOther}
						disabled={disabled}
					>
						Chọn file khác
					</AttachmentAction>
				</AttachmentActions>
			</Attachment>
		);
	}

	// File đã lưu luôn hiện (kể cả khi lần thay file vừa lỗi) — footer và nút
	// Nộp dựa trên file này, học viên phải thấy được thứ mình sẽ nộp. Chỉ ẩn
	// trong lúc đang tải file thay thế.
	const mediaBlock =
		media !== null && !uploading ? (
			<div className="flex flex-col gap-3">
				<Attachment state="done" className="w-full rounded-md bg-bg">
					<AttachmentMedia>
						<MediaKindIcon type={media.type} />
					</AttachmentMedia>
					<AttachmentContent>
						<AttachmentTitle data-testid="speaking-media-name">
							{media.name}
						</AttachmentTitle>
						<AttachmentDescription>
							{formatMediaSize(media.size)}
							{media.uploadedAt &&
								` · Đã tải lên ${formatVietnamSubmittedAt(media.uploadedAt)}`}
						</AttachmentDescription>
					</AttachmentContent>
					<AttachmentActions className="gap-1">
						<AttachmentAction
							size="sm"
							variant="outline"
							onClick={onReplace}
							disabled={disabled}
							data-focus-target="replace"
						>
							Thay file
						</AttachmentAction>
						<AttachmentAction
							size="sm"
							variant="ghost"
							onClick={onDelete}
							disabled={disabled}
						>
							Xoá
						</AttachmentAction>
					</AttachmentActions>
				</Attachment>
				<QuizMediaPlayer
					key={media.uploadedAt}
					media={media}
					attemptId={attemptId}
					localUrl={localUrl}
				/>
			</div>
		) : null;

	const dropzone =
		media === null && state.kind === "idle" ? (
			<MediaDropzone
				accept={MEDIA_ACCEPT}
				maxBytes={QUIZ_MEDIA_MAX_BYTES}
				disabled={disabled}
				onFile={onFile}
				onReject={onReject}
				hint="Audio hoặc video · tối đa 50 MB"
			/>
		) : null;

	const body = (
		<div className="flex flex-col gap-3">
			{uploadBlock}
			{mediaBlock}
			{dropzone}
		</div>
	);

	return (
		<section aria-labelledby="speaking-submission-heading" className="mt-2">
			<h2
				id="speaking-submission-heading"
				className="mb-2 font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]"
			>
				Bài nói của bạn
			</h2>
			{notice && (
				<p role="alert" className="mb-2 text-danger text-sm">
					{notice}
				</p>
			)}
			{body}
		</section>
	);
}

/**
 * Panel nộp bài Speaking (#305): dropzone → tiến trình → file đã tải kèm
 * player, Thay file, Xoá. `media` đọc từ cache take payload — panel không
 * giữ bản sao: upload/xoá thành công ghi thẳng vào cache, lỗi có thể đã
 * commit phía server (mạng, conflict, hủy) thì refetch để render theo
 * server.
 */
export function SpeakingSubmissionPanel({
	assignmentId,
	attemptId,
	media,
	disabled,
	onUploadingChange,
	onAlreadySubmitted,
	onAuthError,
}: {
	assignmentId: string;
	attemptId: string;
	media: QuizAttemptMedia | null;
	disabled: boolean;
	onUploadingChange: (uploading: boolean) => void;
	onAlreadySubmitted: () => void;
	onAuthError: () => void;
}) {
	const queryClient = useQueryClient();
	const [state, setState] = useState<SpeakingUploadState>({ kind: "idle" });
	const [notice, setNotice] = useState<string | null>(null);
	const [announcement, setAnnouncement] = useState("");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);
	// Preview file vừa chọn bằng blob của chính File — gắn với uploadedAt của
	// lần upload đó, không bao giờ áp cho file khác (tab khác thay file).
	const [preview, setPreview] = useState<{
		url: string;
		uploadedAt: string;
	} | null>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	// Phần tử nhận focus sau lần render kế tiếp — phần tử đang focus (dropzone,
	// nút Xoá) bị unmount khi đổi trạng thái, không trả focus thì về <body>.
	const pendingFocus = useRef<string | null>(null);
	const busy = state.kind === "uploading" || state.kind === "processing";
	// Handler beforeunload đọc ref, không đọc state: redirect (409/401) chạy
	// trong cùng call stack với setState nên listener cũ vẫn còn gắn — phải
	// tắt đồng bộ trước khi điều hướng, không thì trình duyệt hỏi "Leave
	// site?" và học viên bấm Ở lại sẽ kẹt.
	const busyRef = useRef(false);
	busyRef.current = busy;
	const hasMediaRef = useRef(false);
	hasMediaRef.current = media !== null;
	const failedRef = useRef(false);
	failedRef.current = state.kind === "error";

	const refetch = () =>
		void queryClient.invalidateQueries({
			queryKey: quizDetailQueryOptions(assignmentId).queryKey,
		});
	const leaveFor = (navigate: () => void) => {
		busyRef.current = false;
		setState({ kind: "idle" });
		navigate();
	};

	useEffect(() => {
		onUploadingChange(busy);
	}, [busy, onUploadingChange]);

	useEffect(() => {
		return () => {
			controllerRef.current?.abort();
		};
	}, []);

	useEffect(() => {
		return () => {
			if (preview) URL.revokeObjectURL(preview.url);
		};
	}, [preview]);

	useEffect(() => {
		const handler = (event: BeforeUnloadEvent) => {
			if (!busyRef.current) return;
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", handler);
		return () => window.removeEventListener("beforeunload", handler);
	}, []);

	// Thả file ra ngoài dropzone (đã có file, đang lỗi…) mặc định làm trình
	// duyệt mở file và rời bài làm — chặn ở window, nhắc dùng vùng tải lên.
	useEffect(() => {
		const hasFiles = (event: DragEvent) =>
			Array.from(event.dataTransfer?.types ?? []).includes("Files");
		const onDragOver = (event: DragEvent) => {
			if (hasFiles(event)) event.preventDefault();
		};
		const onDrop = (event: DragEvent) => {
			if (!hasFiles(event) || event.defaultPrevented) return;
			event.preventDefault();
			setNotice(
				busyRef.current
					? "Đang tải file — đợi tải xong rồi thử lại."
					: hasMediaRef.current
						? 'Dùng nút "Thay file" để đổi file bài nói.'
						: failedRef.current
							? 'Dùng nút "Chọn file khác" để chọn lại file.'
							: "Thả file vào vùng tải lên.",
			);
		};
		window.addEventListener("dragover", onDragOver);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragover", onDragOver);
			window.removeEventListener("drop", onDrop);
		};
	}, []);

	useEffect(() => {
		if (pendingFocus.current === null) return;
		const target = panelRef.current?.querySelector<HTMLElement>(
			pendingFocus.current,
		);
		if (target) {
			target.focus();
			pendingFocus.current = null;
		}
	});

	const startUpload = (file: File, type: string) => {
		const controller = new AbortController();
		controllerRef.current = controller;
		setNotice(null);
		setState(progressState(file, type, 0));
		uploadQuizMedia(attemptId, file, type, {
			signal: controller.signal,
			onProgress: (fraction) => setState(progressState(file, type, fraction)),
		})
			.then(async (uploaded) => {
				await setQuizDetailMedia(queryClient, assignmentId, uploaded);
				setPreview({
					url: URL.createObjectURL(file),
					uploadedAt: uploaded.uploadedAt,
				});
				pendingFocus.current = '[data-focus-target="replace"]';
				setState({ kind: "idle" });
				setAnnouncement(`Đã tải lên ${uploaded.name}`);
			})
			.catch((error: unknown) => {
				const failure = uploadFailure(error);
				switch (failure.action) {
					case "cancelled":
						setState({ kind: "idle" });
						refetch();
						return;
					case "submitted":
						leaveFor(onAlreadySubmitted);
						return;
					case "reauth":
						leaveFor(onAuthError);
						return;
					case "notice":
						setState({ kind: "idle" });
						setNotice(failure.message);
						refetch();
						return;
					case "show":
						setState({
							kind: "error",
							file,
							type,
							message: failure.message,
							retryable: failure.retryable,
						});
						if (failure.refetch) refetch();
				}
			})
			.finally(() => {
				if (controllerRef.current === controller) controllerRef.current = null;
			});
	};

	const handleReject = (reason: QuizMediaRejectReason, file?: File) => {
		setNotice(rejectMessage(reason, file));
	};

	const handleDelete = async () => {
		setDeleting(true);
		try {
			await deleteQuizMedia(attemptId);
			await setQuizDetailMedia(queryClient, assignmentId, null);
			setNotice(null);
			setConfirmDelete(false);
			pendingFocus.current = '[data-slot="media-dropzone"]';
			setAnnouncement("Đã xoá file bài nói");
		} catch (error) {
			setConfirmDelete(false);
			if (isHttpError(error) && error.status === 401) {
				onAuthError();
			} else if (
				isHttpError(error) &&
				error.status === 409 &&
				error.code === "ATTEMPT_SUBMITTED"
			) {
				onAlreadySubmitted();
			} else {
				setNotice("Không xoá được file. Vui lòng thử lại.");
				refetch();
			}
		} finally {
			setDeleting(false);
		}
	};

	const localUrl =
		preview !== null &&
		media !== null &&
		preview.uploadedAt === media.uploadedAt
			? preview.url
			: null;

	return (
		<div ref={panelRef}>
			<SpeakingSubmissionView
				attemptId={attemptId}
				media={media}
				state={state}
				notice={notice}
				localUrl={localUrl}
				disabled={disabled || deleting}
				onFile={startUpload}
				onReject={handleReject}
				onCancel={() => controllerRef.current?.abort()}
				onRetry={() => {
					if (state.kind === "error") startUpload(state.file, state.type);
				}}
				onPickOther={() => {
					setState({ kind: "idle" });
					replaceInputRef.current?.click();
				}}
				onReplace={() => replaceInputRef.current?.click()}
				onDelete={() => setConfirmDelete(true)}
			/>
			{/* Input ẩn cho "Thay file"/"Chọn file khác" — cùng đường validate với
			 * dropzone (handlePickedFiles), lỗi hiện ở cùng alert của panel. */}
			<input
				ref={replaceInputRef}
				type="file"
				accept={MEDIA_ACCEPT}
				hidden
				tabIndex={-1}
				data-testid="speaking-replace-input"
				onChange={(event) => {
					const files = event.target.files;
					if (files && files.length > 0) {
						handlePickedFiles(
							files,
							QUIZ_MEDIA_MAX_BYTES,
							startUpload,
							handleReject,
						);
					}
					event.target.value = "";
				}}
			/>
			<span role="status" aria-live="polite" className="sr-only">
				{announcement}
			</span>
			<QuizDialog
				open={confirmDelete}
				title="Xoá file bài nói?"
				description="File đã tải lên sẽ bị xoá. Bạn cần tải file khác lên trước khi nộp bài."
				confirmLabel="Xoá"
				cancelLabel="Giữ lại"
				tone="danger"
				confirmDisabled={deleting}
				onConfirm={() => void handleDelete()}
				onCancel={() => setConfirmDelete(false)}
			/>
		</div>
	);
}
