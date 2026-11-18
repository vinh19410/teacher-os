import { Button } from "@teacher-os/ui/components/button";
import { cn } from "@teacher-os/ui/lib/utils";
import { Maximize2 } from "lucide-react";
import {
	lazy,
	type ReactNode,
	Suspense,
	useEffect,
	useRef,
	useState,
} from "react";

// pdfjs-dist nặng — chỉ tải khi khung preview vào viewport hoặc được bấm tải.
const BlobDocumentView = lazy(() =>
	import("./blob-document-view").then((m) => ({
		default: m.BlobDocumentView,
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
	heading?: string;
}

/**
 * Khung xem trước PDF/ảnh nhúng trực tiếp trong card tài liệu:
 * lazy-load khi cuộn tới (`IntersectionObserver`), giới hạn song song,
 * chặn auto-fetch file > 10 MiB, giữ `blob:` URL ổn định theo `requestKey`
 * để tái sử dụng trong modal «Mở rộng» mà không fetch lại hoặc Use-After-Revoke.
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
	heading = "Xem trước",
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

	const loadingNode = (
		<div className="flex min-h-48 items-center justify-center p-4">
			<p role="status" className="text-muted-foreground text-sm">
				Đang tải bản xem trước…
			</p>
		</div>
	);

	return (
		<div
			ref={containerRef}
			data-testid="material-preview"
			className={cn("min-w-0 rounded-md border bg-muted/20 p-2.5", className)}
		>
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="font-medium text-muted-foreground text-xs">
					{heading}
				</span>
				{state.status === "ready" && renderExpandedModal && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						aria-label={`Mở rộng ${title}`}
						onClick={() => setExpanded(true)}
					>
						<Maximize2 aria-hidden="true" />
						<span>Mở rộng</span>
					</Button>
				)}
			</div>

			{largeFileRequiresClick && !triggered ? (
				<div className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center">
					<p className="text-muted-foreground text-xs">
						{`Tài liệu lớn (${formatSizeMb(sizeBytes ?? 0)}) — bấm để xem trước trực tiếp.`}
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setManualKey(requestKey)}
					>
						Tải bản xem trước
					</Button>
				</div>
			) : !triggered ? (
				<div className="flex min-h-48 items-center justify-center p-4">
					<p role="status" className="text-muted-foreground text-xs">
						Đang chờ hiển thị bản xem trước…
					</p>
				</div>
			) : state.status === "loading" || state.status === "idle" ? (
				loadingNode
			) : state.status === "error" ? (
				<p role="alert" className="p-2 text-sm">
					{`Không xem trước được tài liệu này. ${state.message} Bạn vẫn có thể tải xuống để mở.`}
				</p>
			) : (
				<Suspense fallback={loadingNode}>
					<BlobDocumentView
						blobUrl={state.url}
						mimeType={mimeType}
						label={`Nội dung ${title}`}
						viewportClassName="max-h-80"
					/>
				</Suspense>
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
