import { isHttpError } from "@/lib/query-client";

/**
 * Error view chung cho 2 route review (summary + detail). Route files giữ
 *nhận component qua import để router plugin tự code-split không warning.
 */
export function AttemptReviewError({ error }: { error: unknown }) {
	const notFound = isHttpError(error) && error.status === 404;
	const code = isHttpError(error) ? error.code : undefined;
	return (
		<div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-bg p-6 text-center">
			<p className="font-mono text-[11px] text-meta uppercase tracking-[0.2em]">
				{notFound ? "404" : "Lỗi"}
			</p>
			<h1 className="font-display font-extrabold text-3xl tracking-[-0.045em]">
				{notFound ? "Không tìm thấy bài làm" : "Không tải được kết quả"}
			</h1>
			<p className="max-w-sm text-meta text-sm">
				{notFound
					? "Bài làm này không tồn tại hoặc không thuộc về bạn."
					: "Đã có lỗi khi tải kết quả. Vui lòng thử lại."}
			</p>
			{code && <p className="font-mono text-meta text-xs">{code}</p>}
			<a
				href="/"
				className="text-hot text-sm underline-offset-4 hover:underline"
			>
				Về trang chủ
			</a>
		</div>
	);
}
