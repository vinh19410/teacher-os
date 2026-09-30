import { isHttpError } from "@/lib/query-client";

/**
 * Error view chung cho 2 route review (summary + detail). Route files giữ
 *nhận component qua import để router plugin tự code-split không warning.
 */
export function AttemptReviewError({ error }: { error: unknown }) {
	const notFound = isHttpError(error) && error.status === 404;
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
			<h1 className="font-display font-semibold">
				{notFound ? "Không tìm thấy bài làm" : "Không tải được kết quả"}
			</h1>
			<p className="max-w-sm text-muted-fg text-sm">
				{notFound
					? "Bài làm này không tồn tại hoặc không thuộc về bạn."
					: "Đã có lỗi khi tải kết quả. Vui lòng thử lại."}
			</p>
			<a
				href="/"
				className="text-accent-blue text-sm underline-offset-4 hover:underline"
			>
				Về trang chủ
			</a>
		</div>
	);
}
