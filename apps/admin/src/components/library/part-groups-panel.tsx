import type { LibrarySkill } from "@teacher-os/api/library-contracts";
import { QUESTION_MAX_COUNT } from "@teacher-os/ui/components/assignments/editor/answer-key-grid";
import type { QuestionItem } from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { Button } from "@teacher-os/ui/components/web-kit/button";
import { GroupCard } from "./group-card";
import type { patchGroup } from "./group-model";
import type { PartFormValue } from "./part-form";
import type { PartViewState } from "./part-view-state";

/**
 * Tab «Câu hỏi» của thẻ part khi part có nhóm câu (#420 Task 4.7 + #424
 * Task 3.4): bộ đếm 40 câu của part, danh sách `GroupCard` (mỗi thẻ
 * `id="group-{slot}-{gi}"` cho focus theo cây) và nút «Thêm nhóm câu».
 * State/validaton sống ở `PartForm` — panel chỉ nhận handler.
 */

export function PartGroupsPanel({
	skill,
	slot,
	value,
	view,
	qStart,
	showErrors,
	testReady,
	errorFor,
	onToggleGroup,
	onSetGroupTab,
	onSetOpenRow,
	onPatchGroup,
	onGroupItemsChange,
	onMoveGroup,
	onRemoveGroup,
	onAddGroup,
	onImageUrlChange,
}: {
	skill: LibrarySkill;
	slot: string;
	value: PartFormValue;
	view: PartViewState;
	/** Số câu đầu của part (fold) — mỗi nhóm cộng `startIndex`. */
	qStart: number;
	showErrors: boolean;
	testReady: boolean;
	errorFor: (field: string) => string | undefined;
	onToggleGroup: (gi: number) => void;
	onSetGroupTab: (gi: number, tab: PartViewState["groupTabs"][number]) => void;
	onSetOpenRow: (gi: number, row: number | null) => void;
	onPatchGroup: (gi: number, patch: Parameters<typeof patchGroup>[2]) => void;
	onGroupItemsChange: (gi: number, items: QuestionItem[]) => void;
	onMoveGroup: (gi: number, dir: -1 | 1) => void;
	onRemoveGroup: (gi: number) => void;
	onAddGroup: () => void;
	onImageUrlChange: (imageUrl: string) => void;
}) {
	const atPartMax = value.questions.length >= QUESTION_MAX_COUNT;
	return (
		<>
			<p
				className={
					atPartMax
						? "text-destructive text-xs"
						: "text-muted-foreground text-xs"
				}
			>
				Tổng số câu của part: {value.questions.length}/{QUESTION_MAX_COUNT}
			</p>
			{value.groups.map((group, gi) => (
				<GroupCard
					key={group.id}
					skill={skill}
					slot={slot}
					index={gi}
					group={group}
					items={
						value.questions.slice(
							group.startIndex,
							group.startIndex + group.count,
						) as QuestionItem[]
					}
					qStart={qStart}
					open={view.openGroup === gi}
					onToggle={() => onToggleGroup(gi)}
					activeTab={view.groupTabs[gi] ?? "questions"}
					onTabChange={(tab) => onSetGroupTab(gi, tab)}
					openRow={view.openRowByGroup[gi] ?? null}
					onOpenRowChange={(row) => onSetOpenRow(gi, row)}
					rowIdPrefix={`group-${slot}-${gi}`}
					onPatch={(groupPatch) => onPatchGroup(gi, groupPatch)}
					onItemsChange={(items) => onGroupItemsChange(gi, items)}
					onMove={(dir) => onMoveGroup(gi, dir)}
					onRemove={() => onRemoveGroup(gi)}
					canMoveUp={gi > 0}
					canMoveDown={gi < value.groups.length - 1}
					imageUrl={value.imageUrl}
					onImageUrlChange={onImageUrlChange}
					showErrors={showErrors}
					status={testReady ? "ready" : "draft"}
					errorFor={errorFor}
					lockAddQuestion={atPartMax}
				/>
			))}
			<div>
				<Button type="button" variant="outline" onClick={onAddGroup}>
					Thêm nhóm câu
				</Button>
			</div>
		</>
	);
}
