import { Download, Eye } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { MaterialRowItem } from "@/components/materials/material-item";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	fetchMaterialFileBlobUrl,
	materialErrorMessage,
	materialFileUrl,
} from "@/lib/repos/materials";

// pdfjs-dist nặng — chỉ tải khi giáo viên thực sự mở bản xem trước.
const BlobDocumentView = lazy(() =>
	import("@/components/document-preview/blob-document-view").then((m) => ({
		default: m.BlobDocumentView,
	})),
);

/** MIME tài liệu xem trước được trong app (PDF qua pdfjs, ảnh qua <img>). */
const PREVIEWABLE_MIMES: ReadonlySet<string> = new Set([
	"application/pdf",
	"image/png",
	"image/jpeg",
	"image/webp",
]);

/**
 * MIME dùng để xem trước, hoặc `null` khi tài liệu không xem trước được:
 * liên kết, audio/video (đã có nút «Phát»), Office DOCX/PPTX/XLSX — các loại
 * này giữ nguyên hiển thị tên file + tải xuống.
 */
export function materialPreviewMime(item: MaterialRowItem): string | null {
	if (item.kind !== "file" || !item.mimeType) return null;
	return PREVIEWABLE_MIMES.has(item.mimeType) ? item.mimeType : null;
}

/** Nút «Xem trước» + modal; không render gì khi định dạng không hỗ trợ. */
export function MaterialPreviewButton({ item }: { item: MaterialRowItem }) {
	const [open, setOpen] = useState(false);
	const mimeType = materialPreviewMime(item);
	if (!mimeType) return null;
	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				aria-label={`Xem trước ${item.title}`}
				onClick={() => setOpen(true)}
			>
				<Eye aria-hidden="true" />
				<span className="max-sm:sr-only">Xem trước</span>
			</Button>
			{open && (
				<MaterialPreviewModal
					item={item}
					mimeType={mimeType}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

type LoadState =
	| { status: "loading" }
	| { status: "ready"; url: string }
	| { status: "error"; message: string };

/**
 * Modal xem trước: tải file về blob URL (cookie phiên đi kèm), revoke khi
 * đóng/đổi tài liệu. Lỗi tải hiện thông báo kèm đường tải xuống.
 */
export function MaterialPreviewModal({
	item,
	mimeType,
	onClose,
}: {
	item: MaterialRowItem;
	mimeType: string;
	onClose: () => void;
}) {
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		const controller = new AbortController();
		let url: string | null = null;
		setState({ status: "loading" });
		fetchMaterialFileBlobUrl(item.id, controller.signal)
			.then((u) => {
				url = u;
				if (controller.signal.aborted) {
					URL.revokeObjectURL(u);
					return;
				}
				setState({ status: "ready", url: u });
			})
			.catch((err: unknown) => {
				if (!controller.signal.aborted) {
					setState({ status: "error", message: materialErrorMessage(err) });
				}
			});
		return () => {
			controller.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [item.id]);

	const loading = (
		<p role="status" className="text-muted-foreground text-sm">
			Đang tải bản xem trước…
		</p>
	);

	return (
		<Modal
			open
			onClose={onClose}
			title={item.title}
			size="xl"
			footer={
				<>
					<a
						href={materialFileUrl(item.id, true)}
						className={buttonVariants({ variant: "outline", size: "sm" })}
						aria-label={`Tải xuống ${item.title}`}
					>
						<Download aria-hidden="true" />
						Tải xuống
					</a>
					<Button variant="outline" size="sm" onClick={onClose}>
						Đóng
					</Button>
				</>
			}
		>
			<div data-testid="material-preview">
				{state.status === "loading" ? (
					loading
				) : state.status === "error" ? (
					<p role="alert" className="text-sm">
						{`Không xem trước được tài liệu này. ${state.message} Bạn vẫn có thể tải xuống để mở.`}
					</p>
				) : (
					<Suspense fallback={loading}>
						<BlobDocumentView
							blobUrl={state.url}
							mimeType={mimeType}
							label={`Nội dung ${item.title}`}
						/>
					</Suspense>
				)}
			</div>
		</Modal>
	);
}
