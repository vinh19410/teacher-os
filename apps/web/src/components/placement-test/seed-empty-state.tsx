import { Download } from "lucide-react";
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
					Bạn có thể nhập bộ đề gốc 30 câu (15 câu Ngữ pháp & Từ vựng + 5 đoạn
					nghe MP3) để chỉnh sửa và phát hành ngay, hoặc tự tạo bộ đề mới từ
					đầu.
				</p>
			</div>

			{errorMessage && (
				<div
					role="alert"
					className="w-full rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
				>
					{errorMessage}
				</div>
			)}

			<div className="flex flex-wrap items-center gap-2">
				<Button
					variant="primary"
					disabled={importing}
					onClick={onImportSeed}
					data-testid="import-seed-btn"
				>
					<Download className="size-4" />
					{importing
						? (progressLabel ?? "Đang nhập đề gốc...")
						: "Nhập đề gốc (30 câu, 5 audio)"}
				</Button>
				<Button variant="outline" disabled={importing} onClick={onStartBlank}>
					Tạo đề trống
				</Button>
			</div>
		</Card>
	);
}
