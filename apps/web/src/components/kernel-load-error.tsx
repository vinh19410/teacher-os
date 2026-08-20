import { Button } from "@teacher-os/ui/components/button";
import { AlertTriangle } from "lucide-react";

import type { LoadFailure } from "@/lib/kernel-load-state";

const FATAL_HINT =
	"Đăng nhập lại sẽ không khắc phục được lỗi này. Vui lòng liên hệ hỗ trợ và thử lại sau.";

/**
 * Blocking first-load failure screen. Rendered instead of the workspace so a
 * failed snapshot load can never look like a legitimately empty org.
 * `reauth` failures never reach this screen — the provider redirects to
 * login instead of offering a retry loop.
 */
export default function KernelLoadError({
	failure,
	onRetry,
}: {
	failure: LoadFailure;
	onRetry: () => void;
}) {
	return (
		<div
			role="alert"
			className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-4 p-8 text-center"
		>
			<AlertTriangle className="h-10 w-10 text-danger" aria-hidden="true" />
			<h1 className="font-bold text-xl">Không tải được dữ liệu lớp/học viên</h1>
			<p className="text-muted-foreground text-sm">{failure.message}</p>
			{failure.kind === "retryable" ? (
				<Button type="button" autoFocus onClick={onRetry}>
					Thử lại
				</Button>
			) : (
				<p className="text-muted-foreground text-xs">{FATAL_HINT}</p>
			)}
		</div>
	);
}
