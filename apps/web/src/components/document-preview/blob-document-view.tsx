import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// Worker pdfjs qua Vite `?url` — bundle giữ file worker riêng, không inline.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;
const clampZoom = (z: number) =>
	Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));

export const PDF_MIME = "application/pdf";

/**
 * Hiển thị một file đã tải về dạng blob URL: PDF render qua pdfjs-dist lên
 * canvas (lật trang + zoom 50–200% bước 10), còn lại coi là ảnh và dùng
 * <img> với cùng bộ điều khiển zoom. Caller sở hữu blob URL (tạo + revoke).
 * `label` là tên truy cập của canvas PDF / alt của ảnh.
 */
export function BlobDocumentView({
	blobUrl,
	mimeType,
	label,
}: {
	blobUrl: string;
	mimeType: string;
	label: string;
}) {
	return mimeType === PDF_MIME ? (
		<PdfCanvas blobUrl={blobUrl} label={label} />
	) : (
		<ImageView blobUrl={blobUrl} label={label} />
	);
}

/** Thanh điều khiển zoom dùng chung cho PDF và ảnh. */
function ViewerToolbar({
	page,
	totalPages,
	onPrev,
	onNext,
	zoom,
	onZoom,
	disablePageNav,
}: {
	page?: number;
	totalPages?: number;
	onPrev?: () => void;
	onNext?: () => void;
	zoom: number;
	onZoom: (next: number) => void;
	disablePageNav?: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{!disablePageNav && (
				<>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onPrev}
						disabled={(page ?? 1) <= 1}
						aria-label="Trang trước"
					>
						‹ Trước
					</Button>
					<span
						data-testid="pdf-page-indicator"
						className="text-muted-foreground text-sm tabular-nums"
					>
						Trang {page} / {totalPages}
					</span>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={onNext}
						disabled={(page ?? 1) >= (totalPages ?? 1)}
						aria-label="Trang sau"
					>
						Sau ›
					</Button>
				</>
			)}
			{disablePageNav && (
				<span
					data-testid="pdf-page-indicator"
					className="text-muted-foreground text-sm tabular-nums"
				>
					Trang 1 / 1
				</span>
			)}
			<div className="ml-auto flex items-center gap-1">
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="zoom-out"
					aria-label="Thu nhỏ"
					onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
					disabled={zoom <= ZOOM_MIN}
				>
					−
				</Button>
				<span
					data-testid="zoom-level"
					className="w-12 text-center text-sm tabular-nums"
				>
					{zoom}%
				</span>
				<Button
					type="button"
					variant="outline"
					size="sm"
					data-testid="zoom-in"
					aria-label="Phóng to"
					onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
					disabled={zoom >= ZOOM_MAX}
				>
					+
				</Button>
			</div>
		</div>
	);
}

/** PDF: render trang hiện tại lên canvas, re-render khi đổi trang/zoom. */
function PdfCanvas({ blobUrl, label }: { blobUrl: string; label: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [page, setPage] = useState(1);
	const [totalPages, setTotalPages] = useState(1);
	const [zoom, setZoom] = useState(100);
	// pdfjs doc object sống trong state bình thường — chỉ cần trigger
	// re-render khi doc sẵn sàng/đổi trang/zoom; canvas render là effect.
	const [doc, setDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
	const [failed, setFailed] = useState(false);
	useEffect(() => {
		let cancelled = false;
		setFailed(false);
		const task = pdfjsLib.getDocument({
			url: blobUrl,
			// Blob URL không hỗ trợ range request theo nghĩa network; tắt
			// auto-fetch để pdfjs đọc theo nhu cầu trang thay vì prefetch cả
			// tài nguyên (blob local nên đọc vẫn full-in-memory).
			disableAutoFetch: true,
		});
		task.promise
			.then((loaded) => {
				if (cancelled) return;
				setDoc(loaded);
			})
			.catch(() => {
				// Lỗi parse PDF (blob hỏng/sai kiểu) — báo trong viewer thay vì
				// để canvas trắng; phần còn lại của màn hình vẫn dùng được.
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
			void task.destroy();
			setDoc(null);
		};
	}, [blobUrl]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!doc || !canvas) return;
		let cancelled = false;
		// Giữ RenderTask đang chạy để cleanup cancel — pdfjs cấm 2 render()
		// trên cùng canvas; đổi zoom/trang nhanh liên tiếp không được để task
		// cũ sống (kongming review #470 Minor #6, tránh canvas trắng flaky).
		let renderTask: { cancel: () => void; promise: Promise<void> } | null =
			null;
		doc
			.getPage(page)
			.then((pdfPage) => {
				if (cancelled) return;
				const viewport = pdfPage.getViewport({ scale: zoom / 100 });
				const context = canvas.getContext("2d");
				if (!context) return;
				// Render ở độ phân giải thiết bị để nét khi zoom (devicePixelRatio).
				const dpr =
					typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
				canvas.width = Math.floor(viewport.width * dpr);
				canvas.height = Math.floor(viewport.height * dpr);
				canvas.style.width = `${Math.floor(viewport.width)}px`;
				canvas.style.height = `${Math.floor(viewport.height)}px`;
				const task = pdfPage.render({
					canvas,
					canvasContext: context,
					viewport,
					transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
				});
				renderTask = task;
				// Nuốt rejection của task bị huỷ (RenderingCancelledException).
				task.promise.catch(() => {});
			})
			.catch(() => {
				// Trang lỗi/đã huỷ — bỏ qua, viewer hiển thị trạng thái cũ.
			});
		return () => {
			cancelled = true;
			renderTask?.cancel();
		};
	}, [doc, page, zoom]);

	// Số trang tổng cập nhật khi doc sẵn sàng (mới trigger nút prev/next).
	useEffect(() => {
		if (doc) setTotalPages(doc.numPages);
	}, [doc]);

	if (failed) {
		return (
			<p role="alert" className="text-muted-foreground text-sm">
				Không đọc được nội dung PDF này. Hãy tải xuống để mở bằng ứng dụng khác.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			<ViewerToolbar
				page={page}
				totalPages={totalPages}
				onPrev={() => setPage((p) => Math.max(1, p - 1))}
				onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
				zoom={zoom}
				onZoom={setZoom}
			/>
			<div className="overflow-auto rounded-lg border border-input bg-muted/40 p-3">
				<canvas ref={canvasRef} className="mx-auto block" aria-label={label} />
			</div>
		</div>
	);
}

/** Ảnh PNG/JPEG: <img> scale theo zoom, indicator cố định "1 / 1". */
function ImageView({ blobUrl, label }: { blobUrl: string; label: string }) {
	const [zoom, setZoom] = useState(100);
	return (
		<>
			<ViewerToolbar zoom={zoom} onZoom={setZoom} disablePageNav />
			<div className="p-3">
				<img
					src={blobUrl}
					alt={label}
					className="mx-auto block max-w-none"
					style={{ width: `${zoom}%` }}
				/>
			</div>
		</>
	);
}
