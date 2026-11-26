import type {
	StudentClassMaterialView,
	StudentLessonMaterialView,
} from "@teacher-os/api/material-contracts";
import { Button, buttonVariants } from "@teacher-os/ui/components/button";
import {
	InlineDocumentPreview,
	isPreviewableDocumentMime,
} from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { Download, Eye, Loader2, X } from "lucide-react";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/query-client";
import {
	classMaterialFileUrl,
	fetchClassMaterialBlobUrl,
	fetchLessonMaterialBlobUrl,
	getActiveStudentOrgId,
	lessonMaterialFileUrl,
} from "@/lib/repos/student";
import {
	ACTIVE_STUDENT_USER_KEY,
	subscribeActiveStudentOrg,
} from "@/lib/student-org-storage";

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
	returnFocusTo,
}: {
	title: string;
	mimeType: string;
	blobUrl: string;
	downloadUrl: string;
	onClose: () => void;
	returnFocusTo?: HTMLElement | null;
}) {
	const dialogRef = useRef<HTMLDivElement>(null);
	const closeButtonRef = useRef<HTMLButtonElement>(null);
	const previouslyFocused = useRef<HTMLElement | null>(null);
	const returnFocusToRef = useRef<HTMLElement | null>(returnFocusTo ?? null);
	const onCloseRef = useRef(onClose);
	useEffect(() => {
		onCloseRef.current = onClose;
		returnFocusToRef.current = returnFocusTo ?? null;
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
			const target = [returnFocusToRef.current, previouslyFocused.current].find(
				(el): el is HTMLElement => Boolean(el?.isConnected),
			);
			target?.focus();
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

/**
 * Nút "Xem trước" on-demand cho PDF/ảnh trên tab Tài liệu chung:
 * chỉ tải blob khi học viên bấm, giữ nguyên cơ chế tự hồi phục 403
 * STUDENT_ORG_MISMATCH trong pha loading, đóng & thu hồi blob URL trên mọi
 * thay đổi org/logout khi dialog đang mở, và khôi phục focus khi đóng.
 */
export function StudentClassMaterialPreviewButton({
	material,
	classId,
}: {
	material: StudentClassMaterialView;
	classId: string;
}) {
	const activeOrgId = useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const mimeType = isPreviewableDocumentMime(material.kind, material.mimeType);

	const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
		"idle",
	);
	const [blobUrl, setBlobUrl] = useState<string | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const triggerRef = useRef<HTMLButtonElement | null>(null);
	const controllerRef = useRef<AbortController | null>(null);
	const blobUrlRef = useRef<string | null>(null);
	const inFlightRef = useRef(false);
	const mountedRef = useRef(true);
	const prevOrgRef = useRef<string | null>(activeOrgId);
	const prevKeyRef = useRef(`${classId}:${material.id}`);

	const revokeCurrentBlob = useCallback(() => {
		if (blobUrlRef.current) {
			URL.revokeObjectURL(blobUrlRef.current);
			blobUrlRef.current = null;
		}
	}, []);

	const abortAndRevoke = useCallback(() => {
		controllerRef.current?.abort();
		controllerRef.current = null;
		inFlightRef.current = false;
		revokeCurrentBlob();
	}, [revokeCurrentBlob]);

	const handleClose = useCallback(() => {
		abortAndRevoke();
		setBlobUrl(null);
		setStatus("idle");
		setErrorMessage(null);
	}, [abortAndRevoke]);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			abortAndRevoke();
		};
	}, [abortAndRevoke]);

	useEffect(() => {
		const nextKey = `${classId}:${material.id}`;
		if (prevKeyRef.current === nextKey) return;
		prevKeyRef.current = nextKey;
		handleClose();
	}, [classId, material.id, handleClose]);

	// Khi tab khác đăng xuất hoặc đổi tài khoản học viên (`ACTIVE_STUDENT_USER_KEY`
	// đổi/bị xóa hoặc storage clear): hủy fetch đang chạy, đóng modal và thu hồi
	// blob URL ngay lập tức — tách biệt hoàn toàn với 403 STUDENT_ORG_MISMATCH.
	useEffect(() => {
		if (
			typeof window === "undefined" ||
			typeof window.addEventListener !== "function"
		) {
			return;
		}
		const onStorage = (event: StorageEvent) => {
			if (event.key === null || event.key === ACTIVE_STUDENT_USER_KEY) {
				handleClose();
			}
		};
		window.addEventListener("storage", onStorage);
		return () => {
			window.removeEventListener("storage", onStorage);
		};
	}, [handleClose]);

	useEffect(() => {
		const prevOrg = prevOrgRef.current;
		if (prevOrg === activeOrgId) return;
		prevOrgRef.current = activeOrgId;

		// Dialog đang mở: đóng & thu hồi blob trên mọi thay đổi org (gồm org -> null).
		if (status === "ready") {
			handleClose();
			return;
		}

		// Đang tải: chỉ hủy khi người dùng chuyển giữa hai org khác rỗng; cho phép
		// cả `org-stale -> null` (403 self-heal) lẫn `null -> org-real` (hydrate
		// useStudentTeam) hoàn tất lượt tải hợp lệ.
		if (
			status === "loading" &&
			prevOrg !== null &&
			activeOrgId !== null &&
			prevOrg !== activeOrgId
		) {
			handleClose();
		}
	}, [activeOrgId, status, handleClose]);

	if (!mimeType) return null;

	const downloadUrl = classMaterialFileUrl(classId, material.id, true);

	const handleOpen = async () => {
		if (inFlightRef.current) return;
		inFlightRef.current = true;
		const controller = new AbortController();
		controllerRef.current = controller;
		setErrorMessage(null);
		setStatus("loading");

		try {
			const nextUrl = await fetchClassMaterialBlobUrl(
				classId,
				material.id,
				controller.signal,
			);
			if (controller.signal.aborted || !mountedRef.current) {
				URL.revokeObjectURL(nextUrl);
				return;
			}
			revokeCurrentBlob();
			blobUrlRef.current = nextUrl;
			setBlobUrl(nextUrl);
			setStatus("ready");
		} catch (err) {
			if (
				controller.signal.aborted ||
				!mountedRef.current ||
				(err instanceof DOMException && err.name === "AbortError")
			) {
				return;
			}
			setErrorMessage(formatStudentMaterialError(err));
			setStatus("error");
		} finally {
			if (controllerRef.current === controller) {
				controllerRef.current = null;
				inFlightRef.current = false;
			}
		}
	};

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				aria-label={`Xem trước ${material.title}`}
				aria-busy={status === "loading" || undefined}
				onClick={() => {
					void handleOpen();
				}}
				className={cn(
					buttonVariants({ variant: "outline", size: "sm" }),
					"cursor-pointer",
				)}
			>
				{status === "loading" ? (
					<>
						<Loader2
							aria-hidden="true"
							className="size-3.5 animate-spin motion-reduce:animate-none"
						/>
						Đang tải…
					</>
				) : (
					<>
						<Eye aria-hidden="true" className="size-3.5" />
						Xem trước
					</>
				)}
			</button>

			{status === "error" && errorMessage && (
				<p
					role="alert"
					className="order-last basis-full text-destructive text-xs"
				>
					{errorMessage}
				</p>
			)}

			{status === "ready" && blobUrl && (
				<StudentPreviewDialog
					title={material.title}
					mimeType={mimeType}
					blobUrl={blobUrl}
					downloadUrl={downloadUrl}
					onClose={handleClose}
					returnFocusTo={triggerRef.current}
				/>
			)}
		</>
	);
}
