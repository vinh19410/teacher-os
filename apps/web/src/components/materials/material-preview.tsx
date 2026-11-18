import {
	InlineDocumentPreview,
	isPreviewableDocumentMime,
} from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { Download } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import type { MaterialRowItem } from "@/components/materials/material-item";
import { Button, buttonVariants } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	fetchMaterialFileBlobUrl,
	materialErrorMessage,
	materialFileUrl,
} from "@/lib/repos/materials";

// pdfjs-dist nặng — chỉ tải khi mở bản xem trước.
const BlobDocumentView = lazy(() =>
	import("@teacher-os/ui/components/document-preview/blob-document-view").then(
		(m) => ({
			default: m.BlobDocumentView,
		}),
	),
);

/**
 * MIME dùng để xem trước, hoặc `null` khi tài liệu không xem trước được:
 * liên kết, audio/video (đã có nút «Phát»), Office DOCX/PPTX/XLSX — các loại
 * này giữ nguyên hiển thị tên file + tải xuống.
 */
export function materialPreviewMime(item: MaterialRowItem): string | null {
	return isPreviewableDocumentMime(item.kind, item.mimeType);
}

/**
 * Thumbnail xem trước inline ở đầu hàng tài liệu; tự lazy-load khi cuộn tới
 * và bấm vào để mở Modal tái sử dụng cùng `blob:` URL.
 */
export function MaterialInlinePreview({ item }: { item: MaterialRowItem }) {
	const mimeType = materialPreviewMime(item);
	if (!mimeType) return null;

	return (
		<InlineDocumentPreview
			requestKey={item.id}
			title={item.title}
			mimeType={mimeType}
			sizeBytes={item.sizeBytes}
			loadBlobUrl={async (signal) => {
				try {
					return await fetchMaterialFileBlobUrl(item.id, signal);
				} catch (err) {
					if (isHttpError(err) && err.status === 401) {
						reauth();
					}
					throw err;
				}
			}}
			formatError={materialErrorMessage}
			renderExpandedModal={({ blobUrl, onClose }) => (
				<MaterialPreviewModal
					item={item}
					mimeType={mimeType}
					blobUrl={blobUrl}
					onClose={onClose}
				/>
			)}
		/>
	);
}

type LoadState =
	| { status: "loading" }
	| { status: "ready"; url: string }
	| { status: "error"; message: string };

/**
 * Modal xem trước mở rộng: tái sử dụng `blobUrl` đã tải từ inline preview khi
 * có (không fetch/revoke lại), hoặc tự tải + revoke nếu mở độc lập.
 */
export function MaterialPreviewModal({
	item,
	mimeType,
	blobUrl: borrowedBlobUrl,
	onClose,
}: {
	item: MaterialRowItem;
	mimeType: string;
	blobUrl?: string;
	onClose: () => void;
}) {
	const [fetchedState, setFetchedState] = useState<LoadState>({
		status: "loading",
	});

	useEffect(() => {
		if (borrowedBlobUrl) return;
		const controller = new AbortController();
		let url: string | null = null;
		setFetchedState({ status: "loading" });
		fetchMaterialFileBlobUrl(item.id, controller.signal)
			.then((u) => {
				url = u;
				if (controller.signal.aborted) {
					URL.revokeObjectURL(u);
					return;
				}
				setFetchedState({ status: "ready", url: u });
			})
			.catch((err: unknown) => {
				if (controller.signal.aborted) return;
				if (isHttpError(err) && err.status === 401) {
					reauth();
				}
				setFetchedState({
					status: "error",
					message: materialErrorMessage(err),
				});
			});
		return () => {
			controller.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [item.id, borrowedBlobUrl]);

	const state: LoadState = borrowedBlobUrl
		? { status: "ready", url: borrowedBlobUrl }
		: fetchedState;

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
			scrollableBody
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
			<div data-testid="material-preview-modal" className="min-w-0">
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
