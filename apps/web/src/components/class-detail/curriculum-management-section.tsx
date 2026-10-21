import { useState } from "react";

import { ImportSyllabusModal } from "@/components/modals/import-syllabus-modal";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
	CLASS_TYPE_LABELS,
	type ClassGroup,
	type Syllabus,
} from "@/lib/mock-data";
import type { DirectKernelAction } from "@/lib/use-direct-kernel-action";

export interface CurriculumManagementSectionProps {
	cls: ClassGroup;
	syllabus: Syllabus | null;
	run: DirectKernelAction["run"];
	isPending: DirectKernelAction["isPending"];
	busy: boolean;
}

/**
 * Issue #221: the curriculum card is assignment-only — it attaches or
 * removes the class's template copy. Progress lives in the page header
 * StatCards and the schedule table; content editing moved to the
 * "Quản lý buổi" modal (phase 2).
 */
export function CurriculumManagementSection({
	cls,
	syllabus: sy,
	run,
	isPending,
	busy,
}: CurriculumManagementSectionProps) {
	const [importOpen, setImportOpen] = useState(false);
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

	return (
		<div>
			{sy && sy.classId === cls.id ? (
				<div className="flex flex-wrap items-center gap-4">
					<div className="flex-1">
						<div className="font-semibold text-sm">{sy.name}</div>
						<div className="text-muted-foreground text-xs">
							{sy.level} ·{" "}
							{sy.skills.length > 0
								? sy.skills.join(", ")
								: CLASS_TYPE_LABELS[sy.type]}{" "}
							· {sy.totalLessons} buổi
						</div>
					</div>
					<Button
						variant="secondary"
						size="sm"
						disabled={busy}
						onClick={() => setConfirmRemoveOpen(true)}
					>
						Gỡ giáo trình
					</Button>
				</div>
			) : cls.syllabusId === "" ? (
				<div className="rounded-lg border border-dashed p-6 text-center">
					<p className="text-muted-foreground text-sm">
						Lớp chưa có giáo trình. Nhập một bản sao từ template — chỉnh sửa
						trên lớp không ảnh hưởng template hay lớp khác.
					</p>
					<Button
						size="sm"
						className="mt-4"
						onClick={() => setImportOpen(true)}
					>
						Nhập từ template
					</Button>
				</div>
			) : (
				// Legacy anomaly: pointer set but not this class's copy
				// (pre-migration data). Removing nulls the pointer only.
				<div className="rounded-lg border border-dashed p-6 text-center">
					<p className="text-muted-foreground text-sm">
						Lớp có con trỏ giáo trình lệch (dữ liệu cũ) và không thể chỉnh sửa.
						Gỡ con trỏ để bắt đầu lại với một template.
					</p>
					<Button
						variant="secondary"
						size="sm"
						className="mt-4"
						onClick={() => setConfirmRemoveOpen(true)}
					>
						Gỡ giáo trình
					</Button>
				</div>
			)}

			<ImportSyllabusModal
				key={`import-${cls.id}`}
				open={importOpen}
				onClose={() => setImportOpen(false)}
				classId={cls.id}
			/>
			<Modal
				open={confirmRemoveOpen}
				onClose={busy ? () => undefined : () => setConfirmRemoveOpen(false)}
				title="Gỡ giáo trình khỏi lớp?"
			>
				<p className="text-muted-foreground text-sm">
					Nếu lớp đang giữ một bản sao giáo trình, toàn bộ cây (kèm tiến độ buổi
					học) sẽ bị xóa; nếu chỉ là con trỏ lệch (dữ liệu cũ), chỉ con trỏ được
					dọn. Template gốc và các lớp khác không bao giờ bị ảnh hưởng. Hành
					động này không thể hoàn tác.
				</p>
				<div className="mt-4 flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setConfirmRemoveOpen(false)}
						disabled={busy || isPending("remove-curriculum")}
					>
						Để lại
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={busy || isPending("remove-curriculum")}
						onClick={() => {
							setConfirmRemoveOpen(false);
							void run(
								"remove-curriculum",
								{ type: "remove-curriculum", classId: cls.id },
								"Đã gỡ giáo trình.",
							);
						}}
					>
						{isPending("remove-curriculum") ? "Đang gỡ…" : "Gỡ giáo trình"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
