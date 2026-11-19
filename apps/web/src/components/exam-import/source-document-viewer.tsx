import { useEffect, useState } from "react";
import {
	BlobDocumentView,
	PDF_MIME,
} from "@/components/document-preview/blob-document-view";
import { fetchExamImportFileUrl } from "@/lib/repos/exam-imports";

/**
 * Viewer tài liệu gốc (phase-03, cột trái workspace): PDF render qua
 * pdfjs-dist lên canvas (lật trang + zoom 50–200% bước 10); ảnh
 * PNG/JPEG dùng <img> với cùng bộ điều khiển zoom. Nguồn file là
 * GET /api/exam-imports/:id/file qua blob URL (credentials include).
 */
export function SourceDocumentViewer({
	jobId,
	mimeType,
}: {
	jobId: string;
	mimeType: string;
}) {
	const isPdf = mimeType === PDF_MIME;
	const [blobUrl, setBlobUrl] = useState<string | null>(null);
	const [loadError, setLoadError] = useState(false);

	useEffect(() => {
		// Blob URL phải revoke khi unmount hoặc đổi job để không rò rỉ bộ nhớ.
		const controller = new AbortController();
		let url: string | null = null;
		setLoadError(false);
		fetchExamImportFileUrl(jobId, undefined, controller.signal)
			.then((u) => {
				url = u;
				setBlobUrl(u);
			})
			.catch(() => {
				if (!controller.signal.aborted) setLoadError(true);
			});
		return () => {
			controller.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [jobId]);

	if (loadError) {
		return (
			<p className="p-6 text-muted-foreground text-sm">
				Không tải được tệp gốc. Hãy thử tải lại trang.
			</p>
		);
	}
	if (!blobUrl) {
		return (
			<p className="p-6 text-muted-foreground text-sm">Đang tải tài liệu…</p>
		);
	}
	return (
		<BlobDocumentView
			blobUrl={blobUrl}
			mimeType={mimeType}
			label={isPdf ? "Nội dung PDF đề thi" : "Tài liệu đề thi gốc"}
		/>
	);
}
