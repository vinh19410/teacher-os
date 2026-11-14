import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export interface SeedEmptyStateProps {
	importing: boolean;
	progressLabel: string | null;
	errorMessage: string | null;
	onImportSeed: () => void;
	onStartBlank: () => void;
}

export function SeedEmptyState({
	importing,
	progressLabel,
	errorMessage,
	onImportSeed,
	onStartBlank,
}: SeedEmptyStateProps) {
	return (
		<Card className="flex flex-col items-start gap-4">
			<div className="space-y-1">
				<h2 className="font-semibold text-foreground text-lg">
					Chưa có bản nháp bộ đề kiểm tra đầu vào
				</h2>
				<p className="max-w-[65ch] text-muted-foreground text-sm">
					Bạn có thể nhập bộ đề gốc 5 kỹ năng (Listening 13 câu • 6 audio
					Kokoro, Grammar & Vocabulary 12 câu, Reading 15 câu, Writing và
					Speaking 8 câu) để chỉnh sửa và phát hành ngay, hoặc tự tạo bộ đề mới
					từ đầu.
				</p>
			</div>

			{errorMessage && (
				<p
					role="alert"
					className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
				>
					{errorMessage}
				</p>
			)}

			<div className="flex flex-wrap items-center gap-3">
				<Button
					variant="primary"
					disabled={importing}
					onClick={onImportSeed}
					data-testid="import-seed-btn"
				>
					{importing
						? (progressLabel ?? "Đang nhập đề gốc...")
						: "Nhập đề gốc 5 kỹ năng (40 câu, 6 audio)"}
				</Button>
				<Button
					variant="outline"
					disabled={importing}
					onClick={onStartBlank}
					data-testid="start-blank-btn"
				>
					Tạo mới từ đầu
				</Button>
			</div>
		</Card>
	);
}
