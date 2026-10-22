import type { LibraryTestListItem } from "@teacher-os/api/library-contracts";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import { useEffect, useRef } from "react";

/**
 * Hộp thoại xác nhận xóa bộ đề (phase 6): backdrop + Escape đóng, nút Hủy
 * nhận focus khi mở, nút Xóa destructive — khóa khi đang gọi API.
 */

export function DeleteTestDialog({
	test,
	busy,
	onCancel,
	onConfirm,
}: {
	/** Đề đang chờ xác nhận (null = đóng). */
	test: LibraryTestListItem | null;
	busy: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	const cancelRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (test) cancelRef.current?.focus();
	}, [test]);

	// Escape/backdrop đóng — keydown ở document để không gắn tương tác lên
	// phần tử tĩnh (a11y).
	useEffect(() => {
		if (!test) return;
		const onKeyDown = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") onCancel();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [test, onCancel]);

	if (!test) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			{/* Backdrop là nút riêng nằm dưới hộp thoại — bấm ngoài đóng,
			    bấm trong hộp thoại không xuyên qua (không cần stopPropagation). */}
			<button
				type="button"
				aria-label="Đóng hộp thoại"
				tabIndex={-1}
				className="absolute inset-0 cursor-default bg-black/50"
				onClick={onCancel}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="delete-test-title"
				aria-describedby="delete-test-desc"
				className="relative flex w-full max-w-md flex-col gap-4 rounded-xl border bg-card p-5 shadow-lg"
			>
				<div>
					<h2 id="delete-test-title" className="font-semibold text-base">
						Xóa bộ đề?
					</h2>
					<p
						id="delete-test-desc"
						className="mt-1 text-muted-foreground text-sm"
					>
						Bộ đề «{test.title}» và toàn bộ part, audio bên trong sẽ bị xóa vĩnh
						viễn. Không thể hoàn tác.
					</p>
				</div>
				<div className="flex justify-end gap-2">
					<Button
						ref={cancelRef}
						variant="outline"
						disabled={busy}
						onClick={onCancel}
					>
						Hủy
					</Button>
					<Button variant="destructive" disabled={busy} onClick={onConfirm}>
						{busy ? "Đang xóa…" : "Xóa bộ đề"}
					</Button>
				</div>
			</div>
		</div>
	);
}
