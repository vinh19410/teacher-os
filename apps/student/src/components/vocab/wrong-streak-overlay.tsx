import { Button } from "@teacher-os/ui/components/button";

export function WrongStreakOverlay({
	open,
	onDismiss,
}: {
	open: boolean;
	onDismiss: () => void;
}) {
	if (!open) return null;

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="vocab-streak-overlay-title"
			data-testid="vocab-wrong-streak-overlay"
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
		>
			<div className="w-full max-w-md space-y-4 rounded-md rounded-xl border bg-card p-6 text-center shadow-sm">
				<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
					Chậm lại một nhịp
				</p>
				<h2
					id="vocab-streak-overlay-title"
					className="font-extrabold text-foreground text-xl tracking-[-0.02em]"
				>
					Đừng nản lòng nhé!
				</h2>
				<p className="text-muted-foreground text-sm">
					Bạn vừa gặp 5 câu khó liên tiếp. Hãy hít thở sâu, đọc kỹ lại nghĩa của
					từ trước khi tiếp tục.
				</p>
				<div className="flex justify-center pt-2">
					<Button
						type="button"
						data-testid="vocab-dismiss-overlay"
						onClick={onDismiss}
					>
						Tiếp tục cố gắng
					</Button>
				</div>
			</div>
		</div>
	);
}
