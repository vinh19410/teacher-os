import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useDirectKernelAction } from "@/lib/use-direct-kernel-action";

export function DeleteSyllabusButton({
	syllabusId,
	name,
	inUse,
}: {
	syllabusId: string;
	name: string;
	inUse: number;
}) {
	const { run, isPending, busy } = useDirectKernelAction();
	const [confirmOpen, setConfirmOpen] = useState(false);

	return (
		// Card là 1 link navigate (onClick + onKeyDown Enter/Space ở
		// syllabus/index.tsx) và Modal render inline không portal
		// (ui/modal.tsx) — chặn click bubble và CHỈ chặn keydown
		// Enter/Space tại wrapper này để mở modal / bấm nút trong modal
		// không navigate sang detail; Escape và Tab vẫn tới document cho
		// modal close + focus trap (same rule as session-attendance-modal).
		// biome-ignore lint/a11y/noStaticElementInteractions: wrapper chỉ stopPropagation, điều hướng do Card đóng vai trò.
		<div
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				if (e.key === " " || e.key === "Enter") e.stopPropagation();
			}}
		>
			<Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
				Xóa
			</Button>
			<Modal
				open={confirmOpen}
				onClose={busy ? () => undefined : () => setConfirmOpen(false)}
				title="Xóa template giáo trình?"
			>
				<p className="text-muted-foreground text-sm">
					{inUse > 0
						? `${inUse} lớp đang dùng template "${name}" sẽ KHÔNG bị ảnh hưởng — mỗi lớp đã nhập giữ nguyên bản sao giáo trình của riêng mình (cả tiến độ buổi học).`
						: `Chưa có lớp nào đang dùng template "${name}".`}
				</p>
				<p className="text-muted-foreground text-sm">
					Lớp mới sẽ không thể chọn template này nữa. Hành động không thể hoàn
					tác.
				</p>
				<div className="mt-4 flex justify-end gap-2 border-border border-t border-solid pt-4">
					<Button
						variant="secondary"
						size="sm"
						onClick={() => setConfirmOpen(false)}
						disabled={busy || isPending("delete-syllabus")}
					>
						Để lại
					</Button>
					<Button
						variant="danger"
						size="sm"
						disabled={busy || isPending("delete-syllabus")}
						onClick={() => {
							setConfirmOpen(false);
							void run(
								"delete-syllabus",
								{ type: "delete-syllabus", syllabusId },
								"Đã xóa template.",
							);
						}}
					>
						{isPending("delete-syllabus") ? "Đang xóa…" : "Xóa template"}
					</Button>
				</div>
			</Modal>
		</div>
	);
}
