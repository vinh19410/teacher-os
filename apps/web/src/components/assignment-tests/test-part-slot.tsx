import { typeOf } from "@/components/assignments/assignment-presets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AssignmentPrompt } from "@/lib/mock-data";

/**
 * Một slot part của full-test builder (phase-03 Task 3.5). Slot LUÔN render
 * từ ASSIGNMENT_TEST_PRESETS (shell truyền vào) — không hard-code p1/p2/p3
 * ở đây để Listening 4 section / Writing 2 task / Speaking 3 part chỉ là
 * config. qStart đến từ computeTestRanges (shell tính) — slot không tự đánh
 * số.
 */
export function TestPartSlot({
	skill,
	part,
	label,
	prompt,
	qStart,
	count,
	busy,
	onPick,
	onCompose,
	onEdit,
	onRemove,
}: {
	skill: string;
	part: string;
	label: string;
	/** Prompt ngân hàng đang gán vào slot (null = trống). */
	prompt: AssignmentPrompt | null;
	/** Số câu bắt đầu từ computeTestRanges. */
	qStart: number;
	/** Số câu hỏi của prompt (questions length). */
	count: number;
	busy: boolean;
	onPick: () => void;
	onCompose: () => void;
	onEdit: () => void;
	onRemove: () => void;
}) {
	if (!prompt) {
		return (
			<Card
				variant="white"
				className="flex flex-wrap items-center justify-between gap-3 border-dashed py-4"
			>
				<div className="flex items-start gap-3">
					<span
						aria-hidden="true"
						className="font-semibold text-muted-foreground text-xl tabular-nums leading-[1.1]"
					>
						{qStart}
					</span>
					<div className="flex flex-col">
						<span className="text-muted-foreground text-xs">{label}</span>
						<span className="text-muted-foreground text-xs">
							Chưa gán part — chọn từ ngân hàng hoặc soạn mới.
						</span>
					</div>
				</div>
				<div className="flex gap-2">
					<Button
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={onPick}
					>
						Chọn từ ngân hàng
					</Button>
					<Button size="sm" disabled={busy} onClick={onCompose}>
						Soạn mới
					</Button>
				</div>
			</Card>
		);
	}
	const typeLabel = typeOf(skill, part, prompt.type ?? prompt.genre).label;
	const last = qStart + count - 1;
	return (
		<Card variant="white" className="flex flex-col gap-2 py-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-3">
					{/* Số câu bắt đầu của slot — số thứ tự extrabold theo design */}
					<span
						aria-hidden="true"
						className="font-semibold text-xl tabular-nums leading-[1.1]"
					>
						{qStart}
					</span>
					<div className="flex min-w-0 flex-col">
						<span className="text-muted-foreground text-xs">{label}</span>
						<strong className="text-sm">{prompt.title}</strong>
						<span className="text-muted-foreground text-xs">
							{typeLabel} · Câu {count > 0 ? `${qStart}–${last}` : qStart} ·{" "}
							{count} câu
						</span>
					</div>
				</div>
				<Badge variant={prompt.status === "ready" ? "success" : "warn"}>
					{prompt.status === "ready" ? "Sẵn sàng" : "Bản nháp"}
				</Badge>
			</div>
			<div className="flex justify-end gap-2">
				<Button variant="secondary" size="sm" disabled={busy} onClick={onEdit}>
					Chỉnh sửa
				</Button>
				{/* Chỉ gỡ khỏi test — prompt vẫn nằm trong ngân hàng (không phá
				hủy dữ liệu → hover cam, không đỏ destructive). */}
				<Button
					variant="ghost"
					size="sm"
					aria-label="Gỡ khỏi test"
					disabled={busy}
					onClick={onRemove}
				>
					✕
				</Button>
			</div>
		</Card>
	);
}
