import { typeOf } from "@/components/assignments/assignment-presets";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import type { AssignmentPrompt } from "@/lib/mock-data";

/**
 * Dialog chọn prompt ngân hàng cho một slot (phase-03 Task 3.5). List đã
 * được shell lọc `skill === test.skill && part === slot.part` và sort mới
 * nhất trước — mọi status đều hiện (badge), giáo viên tự quyết dùng draft.
 */
export function PromptPickerDialog({
	open,
	onClose,
	skill,
	part,
	slotLabel,
	prompts,
	onPick,
}: {
	open: boolean;
	onClose: () => void;
	skill: string;
	part: string;
	slotLabel: string;
	/** Đã filter theo skill+part của slot, sort mới nhất trước. */
	prompts: AssignmentPrompt[];
	onPick: (promptId: string) => void;
}) {
	return (
		<Modal open={open} onClose={onClose} title={`Chọn part — ${slotLabel}`}>
			<div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
				{prompts.length === 0 ? (
					<p className="text-muted-fg text-sm">
						Ngân hàng chưa có đề nào cho {slotLabel} — đóng và bấm "Soạn mới" để
						thêm part đầu tiên.
					</p>
				) : (
					prompts.map((prompt) => {
						const typeLabel = typeOf(
							skill,
							part,
							prompt.type ?? prompt.genre,
						).label;
						return (
							<button
								key={prompt.id}
								type="button"
								className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-bg px-3 py-2 text-left transition-colors hover:border-fg"
								onClick={() => onPick(prompt.id)}
							>
								<span className="flex flex-col">
									<strong className="text-sm">{prompt.title}</strong>
									<span className="text-muted-fg text-xs">
										{typeLabel} · {(prompt.questions ?? []).length} câu
										{prompt.source ? ` · ${prompt.source}` : ""}
									</span>
								</span>
								<Badge variant={prompt.status === "ready" ? "success" : "warn"}>
									{prompt.status === "ready" ? "Sẵn sàng" : "Bản nháp"}
								</Badge>
							</button>
						);
					})
				)}
			</div>
		</Modal>
	);
}
