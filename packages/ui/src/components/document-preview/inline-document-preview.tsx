import { cn } from "@teacher-os/ui/lib/utils";
import { AlertCircle, Eye, Loader2, Maximize2 } from "lucide-react";
import {
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";

// pdfjs-dist nặng — chỉ tải khi thumbnail vào viewport hoặc được bấm tải.
const BlobDocumentThumbnail = lazy(() =>
	import("./blob-document-view").then((m) => ({
		default: m.BlobDocumentThumbnail,
	})),
);

/** Ngưỡng tự động tải bản xem trước inline (10 MiB); file lớn hơn chờ 1 click tại chỗ. */
export const INLINE_AUTO_PREVIEW_MAX_BYTES = 10 * 1024 * 1024;

/** MIME tài liệu xem trước được trong app (PDF qua pdfjs, ảnh qua <img>). */
export const PREVIEWABLE_DOCUMENT_MIMES: ReadonlySet<string> = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
]);

/** Trả MIME xem trước được khi `kind === "file"`, ngược lại `null`. */
export function isPreviewableDocumentMime(
	kind: string,
	mimeType: string | null | undefined,
): string | null {
	if (kind !== "file" || !mimeType) return null;
	const normalized = mimeType.trim().toLowerCase();
	return PREVIEWABLE_DOCUMENT_MIMES.has(normalized) ? normalized : null;
}

/** Xác thực header Content-Type trả về từ server trước khi tạo `blob:` URL. */
export function isPreviewableContentType(
	contentType: string | null | undefined,
): boolean {
	if (!contentType) return false;
	const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
	return PREVIEWABLE_DOCUMENT_MIMES.has(base);
}

const MAX_CONCURRENT_PREVIEW_LOADS = 3;
let activeLoads = 0;
const loadWaiters: Array<() => void> = [];

function acquirePreviewSlot(signal: AbortSignal): Promise<() => void> {
	if (signal.aborted) {
		return Promise.reject(new DOMException("Aborted", "AbortError"));
	}
	if (activeLoads < MAX_CONCURRENT_PREVIEW_LOADS) {
		activeLoads += 1;
		return Promise.resolve(releasePreviewSlot);
	}
	return new Promise<() => void>((resolve, reject) => {
		const onAbort = () => {
			const idx = loadWaiters.indexOf(grant);
			if (idx !== -1) loadWaiters.splice(idx, 1);
			reject(new DOMException("Aborted", "AbortError"));
		};
		const grant = () => {
			signal.removeEventListener("abort", onAbort);
			activeLoads += 1;
			resolve(releasePreviewSlot);
		};
		signal.addEventListener("abort", onAbort, { once: true });
		loadWaiters.push(grant);
	});
}

function releasePreviewSlot() {
	activeLoads = Math.max(0, activeLoads - 1);
	const next = loadWaiters.shift();
	if (next) next();
}

function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === "AbortError";
}

function formatSizeMb(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

type LoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; url: string }
	| { status: "error"; message: string };

export interface InlineDocumentPreviewProps {
	/** Khóa ổn định định danh tài liệu + phạm vi auth (vd `item.id` hoặc `${orgId}:${classId}:${date}:${id}`). */
	requestKey: string;
	title: string;
	mimeType: string;
	sizeBytes?: number | null;
	loadBlobUrl: (signal: AbortSignal) => Promise<string>;
	formatError: (err: unknown) => string;
	renderExpandedModal?: (opts: {
		blobUrl: string;
		onClose: () => void;
	}) => ReactNode;
	className?: string;
}

/**
 * Thumbnail xem trước PDF/ảnh (96×72px) đặt ở đầu hàng tài liệu:
 * lazy-load khi cuộn tới (`IntersectionObserver`), giới hạn song song,
 * chặn auto-fetch file > 10 MiB, giữ `blob:` URL ổn định theo `requestKey`
 * để bấm vào mở modal xem đầy đủ mà không fetch lại hoặc Use-After-Revoke.
 */
export function InlineDocumentPreview({
	requestKey,
	title,
	mimeType,
	sizeBytes,
	loadBlobUrl,
	formatError,
	renderExpandedModal,
	className,
}: InlineDocumentPreviewProps) {
	const largeFileRequiresClick =
		typeof sizeBytes === "number" && sizeBytes > INLINE_AUTO_PREVIEW_MAX_BYTES;
	const containerRef = useRef<HTMLDivElement>(null);
	const [intersected, setIntersected] = useState(
		() => typeof IntersectionObserver === "undefined",
	);
	const [manualKey, setManualKey] = useState<string | null>(null);
	const [expanded, setExpanded] = useState(false);
	const [state, setState] = useState<LoadState>({ status: "idle" });

	// Lưu callback trong ref để re-render khi mở modal không hủy/tải lại blob URL.
	const loadRef = useRef(loadBlobUrl);
	const formatErrorRef = useRef(formatError);
	useEffect(() => {
		loadRef.current = loadBlobUrl;
		formatErrorRef.current = formatError;
	});

	// Đóng modal khi đổi requestKey để không giữ blob URL cũ.
	useEffect(() => {
		void requestKey;
		setExpanded(false);
	}, [requestKey]);

	useEffect(() => {
		if (largeFileRequiresClick || intersected) return;
		if (typeof IntersectionObserver === "undefined") {
			setIntersected(true);
			return;
		}
		const el = containerRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setIntersected(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "200px 0px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [largeFileRequiresClick, intersected]);

	const triggered = largeFileRequiresClick
		? manualKey === requestKey
		: intersected;

	useEffect(() => {
		// Đổi requestKey phải hủy/fetch lại bản xem trước cho tài liệu/org mới.
		void requestKey;
		if (!triggered) {
			setState({ status: "idle" });
			return;
		}
		const controller = new AbortController();
		let url: string | null = null;
		let released = false;
		setState({ status: "loading" });

		acquirePreviewSlot(controller.signal)
			.then(async (release) => {
				try {
					if (controller.signal.aborted) return;
					const nextUrl = await loadRef.current(controller.signal);
					if (controller.signal.aborted) {
						URL.revokeObjectURL(nextUrl);
						return;
					}
					url = nextUrl;
					setState({ status: "ready", url: nextUrl });
				} finally {
					if (!released) {
						released = true;
						release();
					}
				}
			})
			.catch((err: unknown) => {
				if (controller.signal.aborted || isAbortError(err)) return;
				setState({
					status: "error",
					message: formatErrorRef.current(err),
				});
			});

		return () => {
			controller.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [triggered, requestKey]);

	const loadingIcon = (
		<>
			<Loader2
				className="size-4 animate-spin text-muted-foreground"
				aria-hidden="true"
			/>
			<span className="sr-only">Đang tải bản xem trước…</span>
		</>
	);

	const innerFallback = (
		<span role="status" className="flex size-full items-center justify-center">
			{loadingIcon}
		</span>
	);

	return (
		<div
			ref={containerRef}
			data-testid="material-preview"
			className={cn("relative h-[72px] w-24 shrink-0", className)}
		>
			{largeFileRequiresClick && !triggered ? (
				<button
					type="button"
					onClick={() => setManualKey(requestKey)}
					aria-label={`Tải bản xem trước ${title}`}
					title={`Tài liệu lớn (${formatSizeMb(sizeBytes ?? 0)}) — bấm để tải thumbnail`}
					className="flex size-full flex-col items-center justify-center gap-0.5 rounded-md border border-dashed bg-muted/20 px-1 text-center text-[11px] text-muted-foreground leading-tight transition hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<Eye className="size-3.5 shrink-0" aria-hidden="true" />
					<span>Xem trước</span>
					<span className="text-[10px] tabular-nums">
						{formatSizeMb(sizeBytes ?? 0)}
					</span>
				</button>
			) : !triggered ? (
				<div
					role="status"
					className="flex size-full items-center justify-center rounded-md border bg-muted/40"
				>
					<span className="sr-only">Đang chờ hiển thị bản xem trước…</span>
				</div>
			) : state.status === "loading" || state.status === "idle" ? (
				<div
					role="status"
					className="flex size-full items-center justify-center rounded-md border bg-muted/30"
				>
					{loadingIcon}
				</div>
			) : state.status === "error" ? (
				<div
					role="alert"
					title={`Không xem trước được tài liệu này. ${state.message} Bạn vẫn có thể tải xuống để mở.`}
					className="flex size-full flex-col items-center justify-center gap-0.5 rounded-md border border-destructive/30 bg-destructive/5 px-1 text-center text-[11px] text-destructive leading-tight"
				>
					<AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
					<span>Lỗi</span>
					<span className="sr-only">
						{`Không xem trước được tài liệu này. ${state.message} Bạn vẫn có thể tải xuống để mở.`}
					</span>
				</div>
			) : renderExpandedModal ? (
				<button
					type="button"
					onClick={() => setExpanded(true)}
					aria-label={`Xem trước ${title}`}
					title={`Xem trước ${title}`}
					className="group relative block size-full overflow-hidden rounded-md border bg-muted/30 text-left transition hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<Suspense fallback={innerFallback}>
						<BlobDocumentThumbnail
							blobUrl={state.url}
							mimeType={mimeType}
							label={`Nội dung ${title}`}
						/>
					</Suspense>
					<span
						aria-hidden="true"
						className="pointer-events-none absolute right-1 bottom-1 grid size-5 place-items-center rounded bg-background/85 text-foreground shadow-xs backdrop-blur-xs transition-opacity sm:opacity-0 sm:group-focus-visible:opacity-100 sm:group-hover:opacity-100"
					>
						<Maximize2 className="size-3" />
					</span>
				</button>
			) : (
				<div className="size-full overflow-hidden rounded-md border bg-muted/30">
					<Suspense fallback={innerFallback}>
						<BlobDocumentThumbnail
							blobUrl={state.url}
							mimeType={mimeType}
							label={`Nội dung ${title}`}
						/>
					</Suspense>
				</div>
			)}

			{expanded &&
				state.status === "ready" &&
				renderExpandedModal?.({
					blobUrl: state.url,
					onClose: () => setExpanded(false),
				})}
		</div>
	);
}
