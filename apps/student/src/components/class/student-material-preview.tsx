import type {
	StudentClassMaterialView,
	StudentLessonMaterialView,
} from "@teacher-os/api/material-contracts";
import { Button, buttonVariants } from "@teacher-os/ui/components/button";
import {
	InlineDocumentPreview,
	isPreviewableDocumentMime,
} from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { Download, X } from "lucide-react";
import {
	lazy,
	Suspense,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { isHttpError } from "@/lib/query-client";
import {
	classMaterialFileUrl,
	fetchClassMaterialBlobUrl,
	fetchLessonMaterialBlobUrl,
	getActiveStudentOrgId,
	lessonMaterialFileUrl,
} from "@/lib/repos/student";
import { subscribeActiveStudentOrg } from "@/lib/student-org-storage";

const BlobDocumentView = lazy(() =>
	import("@teacher-os/ui/components/document-preview/blob-document-view").then(
		(m) => ({
			default: m.BlobDocumentView,
		}),
	),
);

const FOCUSABLE =
	'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function formatStudentMaterialError(err: unknown): string {
	if (!isHttpError(err)) {
		return "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
	}
	if (err.status === 404) {
		return "Tài liệu không còn tồn tại hoặc bạn không còn quyền truy cập.";
	}
	if (err.status === 403) {
		return "Bạn không có quyền xem tài liệu này.";
	}
	if (err.status === 415) {
		return "Định dạng tài liệu không hỗ trợ xem trước.";
	}
	if (err.status === 503) {
		return "Kho tài liệu đang tạm ngưng. Vui lòng thử lại sau.";
	}
	if (err.status === 401) {
		return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
	}
	return "Không tải được bản xem trước.";
}

function StudentPreviewDialog({
	title,
	mimeType,
	blobUrl,
	downloadUrl,
	onClose,
}: {
	title: string;
	mimeType: string;
	blobUrl: string;
	downloadUrl: string;
	onClose: () => void;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
	});

	useEffect(() => {
		previouslyFocused.current = document.activeElement as HTMLElement | null;
		closeButtonRef.current?.focus();

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				onCloseRef.current();
				return;
			}
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusables = Array.from(
				dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter((el) => el.offsetParent !== null);
			if (focusables.length === 0) return;
			const first = focusables[0];
			const last = focusables[focusables.length - 1];
			if (!dialogRef.current.contains(document.activeElement)) {
				event.preventDefault();
				(event.shiftKey ? last : first).focus();
				return;
			}
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previouslyFocused.current?.focus();
		};
	}, []);

	const loading = (
		<p role="status" className="text-muted-foreground text-sm">
			Đang tải bản xem trước…
		</p>
	);

	return createPortal(
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click đóng dialog tương đương Escape ở document listener
		// biome-ignore lint/a11y/useKeyWithClickEvents: Escape đóng dialog đã gắn ở document listener
		<div
			className="fixed inset-0 z-100 flex items-center justify-center bg-black/50 p-3 sm:p-6"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg sm:max-h-[calc(100dvh-3rem)]"
			>
				<div className="flex shrink-0 items-start justify-between gap-4 border-border border-b px-5 py-4 sm:px-6">
					<h3 className="min-w-0 flex-1 break-words pr-8 font-semibold text-lg leading-snug">
						{title}
					</h3>
					<button
						type="button"
						onClick={onClose}
						aria-label="Đóng"
						className="absolute top-4 right-4 rounded-xs opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
					>
						<X aria-hidden="true" />
					</button>
				</div>
				<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 sm:p-6">
					<Suspense fallback={loading}>
						<BlobDocumentView
							blobUrl={blobUrl}
							mimeType={mimeType}
							label={`Nội dung ${title}`}
						/>
					</Suspense>
				</div>
				<div className="flex shrink-0 justify-end gap-2 border-border border-t bg-card px-5 py-3.5 sm:px-6">
					<a
						href={downloadUrl}
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						<Download aria-hidden="true" />
						Tải<span className="sr-only"> {title}</span>
					</a>
					<Button
						ref={closeButtonRef}
						type="button"
						variant="outline"
						size="sm"
						onClick={onClose}
					>
						Đóng
					</Button>
				</div>
			</div>
		</div>,
		document.body,
	);
}

export interface StudentDocumentPreviewProps {
	material: StudentClassMaterialView;
	requestKeyPrefix: string;
	downloadUrl: string;
	loadBlobUrl: (signal?: AbortSignal) => Promise<string>;
}

/**
 * Thumbnail xem trước PDF/ảnh dùng chung ở portal học viên; bấm vào mở modal
 * portal ra `document.body` (thoát stacking context `opacity-60`).
 */
export function StudentDocumentPreview({
	material,
	requestKeyPrefix,
	downloadUrl,
	loadBlobUrl,
}: StudentDocumentPreviewProps) {
	const activeOrgId = useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	// Khi 403 STUDENT_ORG_MISMATCH tự xoá org stale -> null, loader blob đã thử
	// lại tại chỗ; chỉ đổi requestKey khi người dùng chuyển sang org khác.
	const [orgEpoch, setOrgEpoch] = useState(0);
	const lastNonNullOrg = useRef<string | null>(activeOrgId);
	useEffect(() => {
		if (activeOrgId && activeOrgId !== lastNonNullOrg.current) {
			lastNonNullOrg.current = activeOrgId;
			setOrgEpoch((n) => n + 1);
		}
	}, [activeOrgId]);

	const mimeType = isPreviewableDocumentMime(material.kind, material.mimeType);
	if (!mimeType) return null;

	return (
		<InlineDocumentPreview
			requestKey={`${requestKeyPrefix}:${material.id}:${orgEpoch}`}
			title={material.title}
			mimeType={mimeType}
			sizeBytes={material.sizeBytes}
			loadBlobUrl={(signal) => loadBlobUrl(signal)}
			formatError={formatStudentMaterialError}
			renderExpandedModal={({ blobUrl, onClose }) => (
				<StudentPreviewDialog
					title={material.title}
					mimeType={mimeType}
					blobUrl={blobUrl}
					downloadUrl={downloadUrl}
					onClose={onClose}
				/>
			)}
		/>
	);
}

/**
 * Thumbnail xem trước PDF/ảnh ở đầu hàng tài liệu buổi học tại portal học viên.
 */
export function StudentInlineMaterialPreview({
	material,
	classId,
	date,
}: {
	material: StudentLessonMaterialView;
	classId: string;
	date: string;
}) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	return (
		<StudentDocumentPreview
			material={material}
			requestKeyPrefix={`${classId}:${date}`}
			downloadUrl={lessonMaterialFileUrl(classId, date, material.id, true)}
			loadBlobUrl={(signal) =>
				fetchLessonMaterialBlobUrl(classId, date, material.id, signal)
			}
		/>
	);
}

/**
 * Thumbnail xem trước PDF/ảnh ở đầu hàng tài liệu chung của lớp tại portal học viên.
 */
export function StudentClassMaterialPreview({
	material,
	classId,
}: {
	material: StudentClassMaterialView;
	classId: string;
}) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	return (
		<StudentDocumentPreview
			material={material}
			requestKeyPrefix={`class:${classId}`}
			downloadUrl={classMaterialFileUrl(classId, material.id, true)}
			loadBlobUrl={(signal) =>
				fetchClassMaterialBlobUrl(classId, material.id, signal)
			}
		/>
	);
}
