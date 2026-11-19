import {
	type KernelVocabGroupRow,
	VOCAB_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useData } from "@/lib/data-store";

export interface VocabGroupManagerModalProps {
	open: boolean;
	onClose: () => void;
}

export function VocabGroupManagerModal({
	open,
	onClose,
}: VocabGroupManagerModalProps) {
	const { data, dispatch } = useData();

	const [newName, setNewName] = useState("");
	const [createSaving, setCreateSaving] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [renameSaving, setRenameSaving] = useState(false);
	const [renameError, setRenameError] = useState<string | null>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);

	const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
	const [deleteSaving, setDeleteSaving] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		setNewName("");
		setCreateSaving(false);
		setCreateError(null);
		setRenamingGroupId(null);
		setRenameValue("");
		setRenameSaving(false);
		setRenameError(null);
		setDeletingGroupId(null);
		setDeleteSaving(false);
		setDeleteError(null);
	}, [open]);

	useEffect(() => {
		if (!renamingGroupId) return;
		renameInputRef.current?.focus();
	}, [renamingGroupId]);

	const deckCountByGroupId = useMemo(() => {
		const map = new Map<string, number>();
		for (const deck of data.vocabDecks) {
			if (deck.groupId) {
				map.set(deck.groupId, (map.get(deck.groupId) ?? 0) + 1);
			}
		}
		return map;
	}, [data.vocabDecks]);

	const sortedGroups = useMemo(
		() =>
			[...data.vocabGroups].sort((a, b) => a.name.localeCompare(b.name, "vi")),
		[data.vocabGroups],
	);

	const handleCreate = async () => {
		const trimmed = newName.trim();
		if (trimmed.length === 0 || createSaving) return;
		setCreateSaving(true);
		setCreateError(null);
		try {
			const result = await dispatch({
				type: "create-vocab-group",
				payload: { name: trimmed },
			});
			if (result.kind === "refreshed") {
				setNewName("");
				toast.success(`Đã tạo nhóm "${trimmed}".`);
				return;
			}
			if (result.kind === "committed") {
				const msg =
					"Đã lưu nhóm nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setCreateError(msg);
				return;
			}
			if (result.kind === "definite-failure") {
				if (
					result.code === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS ||
					result.reason === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS
				) {
					setCreateError("Tên nhóm đã tồn tại.");
					return;
				}
				setCreateError(
					result.reason
						? `Không thể tạo nhóm (${result.reason}).`
						: "Không thể tạo nhóm. Vui lòng thử lại.",
				);
				return;
			}
			setCreateError(
				"Không rõ kết quả mạng — hãy kiểm tra danh sách nhóm trước khi thử lại.",
			);
		} finally {
			setCreateSaving(false);
		}
	};

	const startRename = (group: KernelVocabGroupRow) => {
		setDeletingGroupId(null);
		setDeleteError(null);
		setRenamingGroupId(group.id);
		setRenameValue(group.name);
		setRenameError(null);
	};

	const cancelRename = () => {
		setRenamingGroupId(null);
		setRenameValue("");
		setRenameError(null);
	};

	const handleRename = async (group: KernelVocabGroupRow) => {
		const trimmed = renameValue.trim();
		if (trimmed.length === 0 || renameSaving) return;
		if (trimmed === group.name) {
			cancelRename();
			return;
		}
		setRenameSaving(true);
		setRenameError(null);
		try {
			const result = await dispatch({
				type: "rename-vocab-group",
				payload: { groupId: group.id, name: trimmed },
			});
			if (result.kind === "refreshed") {
				cancelRename();
				toast.success(`Đã đổi tên nhóm thành "${trimmed}".`);
				return;
			}
			if (result.kind === "committed") {
				const msg =
					"Đã lưu tên nhóm nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setRenameError(msg);
				return;
			}
			if (result.kind === "definite-failure") {
				if (
					result.code === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS ||
					result.reason === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS
				) {
					setRenameError("Tên nhóm đã tồn tại.");
					return;
				}
				setRenameError(
					result.reason
						? `Không thể đổi tên nhóm (${result.reason}).`
						: "Không thể đổi tên nhóm. Vui lòng thử lại.",
				);
				return;
			}
			setRenameError(
				"Không rõ kết quả mạng — hãy kiểm tra lại danh sách nhóm trước khi thử lại.",
			);
		} finally {
			setRenameSaving(false);
		}
	};

	const startDelete = (groupId: string) => {
		setRenamingGroupId(null);
		setRenameError(null);
		setDeletingGroupId(groupId);
		setDeleteError(null);
	};

	const cancelDelete = () => {
		setDeletingGroupId(null);
		setDeleteError(null);
	};

	const handleDelete = async (group: KernelVocabGroupRow) => {
		if (deleteSaving) return;
		setDeleteSaving(true);
		setDeleteError(null);
		try {
			const result = await dispatch({
				type: "delete-vocab-group",
				groupId: group.id,
			});
			if (result.kind === "refreshed") {
				setDeletingGroupId(null);
				toast.success(`Đã xoá nhóm "${group.name}".`);
				return;
			}
			if (result.kind === "committed") {
				const msg =
					"Đã xoá nhóm nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setDeleteError(msg);
				return;
			}
			if (result.kind === "definite-failure") {
				setDeleteError(
					result.reason
						? `Không thể xoá nhóm (${result.reason}).`
						: "Không thể xoá nhóm. Vui lòng thử lại.",
				);
				return;
			}
			setDeleteError(
				"Không rõ kết quả mạng — hãy kiểm tra lại danh sách nhóm trước khi thử lại.",
			);
		} finally {
			setDeleteSaving(false);
		}
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="Quản lý nhóm bộ từ"
			description="Phân loại bộ từ vựng theo giáo trình, khóa học hoặc trình độ."
			scrollableBody
			footer={
				<div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-muted-foreground text-xs">
						Xoá nhóm chỉ bỏ gắn nhóm, không xoá bộ từ hay tiến độ học của học
						viên.
					</p>
					<Button
						type="button"
						variant="secondary"
						onClick={onClose}
						className="shrink-0 self-end sm:self-auto"
					>
						Đóng
					</Button>
				</div>
			}
		>
			<div className="space-y-1.5">
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Input
						maxLength={100}
						value={newName}
						onChange={(e) => {
							setNewName(e.target.value);
							if (createError) setCreateError(null);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								void handleCreate();
							}
						}}
						placeholder="Nhập tên nhóm mới..."
						aria-label="Tên nhóm mới"
						aria-invalid={createError ? true : undefined}
						disabled={createSaving}
						data-testid="vocab-group-create-input"
						className="min-w-0 sm:flex-1"
					/>
					<Button
						type="button"
						size="sm"
						disabled={createSaving || newName.trim().length === 0}
						data-testid="vocab-group-create-submit"
						onClick={() => void handleCreate()}
						className="shrink-0"
					>
						{createSaving ? "Đang thêm..." : "+ Thêm nhóm"}
					</Button>
				</div>
				{createError ? (
					<p
						role="alert"
						data-testid="vocab-group-create-error"
						className="text-destructive text-xs"
					>
						{createError}
					</p>
				) : null}
			</div>

			<div data-testid="vocab-group-list">
				{sortedGroups.length === 0 ? (
					<p className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-muted-foreground text-sm">
						Chưa có nhóm nào. Tạo nhóm để phân loại bộ từ theo giáo trình hoặc
						trình độ.
					</p>
				) : (
					<div className="divide-y divide-border rounded-md border border-border">
						{sortedGroups.map((group) => {
							const count = deckCountByGroupId.get(group.id) ?? 0;
							const isRenaming = renamingGroupId === group.id;
							const isDeleting = deletingGroupId === group.id;

							return (
								<div
									key={group.id}
									data-testid={`vocab-group-row-${group.id}`}
									className="space-y-2.5 px-3.5 py-3"
								>
									{isRenaming ? (
										<div className="space-y-1.5">
											<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
												<Input
													ref={renameInputRef}
													maxLength={100}
													value={renameValue}
													onChange={(e) => {
														setRenameValue(e.target.value);
														if (renameError) setRenameError(null);
													}}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															void handleRename(group);
														} else if (e.key === "Escape") {
															e.preventDefault();
															e.stopPropagation();
															cancelRename();
														}
													}}
													aria-label={`Đổi tên nhóm ${group.name}`}
													aria-invalid={renameError ? true : undefined}
													disabled={renameSaving}
													data-testid={`vocab-group-rename-input-${group.id}`}
													className="min-w-0 sm:flex-1"
												/>
												<div className="flex shrink-0 items-center gap-1.5">
													<Button
														type="button"
														size="sm"
														disabled={
															renameSaving || renameValue.trim().length === 0
														}
														data-testid={`vocab-group-rename-submit-${group.id}`}
														onClick={() => void handleRename(group)}
													>
														{renameSaving ? "Đang lưu..." : "Lưu"}
													</Button>
													<Button
														type="button"
														size="sm"
														variant="secondary"
														disabled={renameSaving}
														onClick={cancelRename}
													>
														Hủy
													</Button>
												</div>
											</div>
											{renameError ? (
												<p
													role="alert"
													data-testid={`vocab-group-rename-error-${group.id}`}
													className="text-destructive text-xs"
												>
													{renameError}
												</p>
											) : null}
										</div>
									) : (
										<div className="flex flex-wrap items-center justify-between gap-2">
											<div className="min-w-0">
												<p className="truncate font-medium text-foreground text-sm">
													{group.name}
												</p>
												<p className="font-mono text-muted-foreground text-xs tabular-nums">
													{count} bộ từ
												</p>
											</div>
											<div className="flex flex-none items-center gap-1.5">
												<Button
													type="button"
													size="sm"
													variant="secondary"
													data-testid={`vocab-group-rename-btn-${group.id}`}
													onClick={() => startRename(group)}
												>
													Đổi tên
												</Button>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													data-testid={`vocab-group-delete-btn-${group.id}`}
													onClick={() => startDelete(group.id)}
												>
													Xoá
												</Button>
											</div>
										</div>
									)}

									{isDeleting ? (
										<div
											data-testid={`vocab-group-delete-panel-${group.id}`}
											className="space-y-2.5 rounded-md border border-destructive/30 bg-destructive/5 p-3"
										>
											<p className="text-foreground text-sm">
												{`Xoá nhóm "${group.name}"? ${
													count > 0
														? `${count} bộ từ trong nhóm sẽ được giữ nguyên và chuyển về Chưa phân nhóm.`
														: "Nhóm này chưa có bộ từ nào."
												}`}
											</p>
											{deleteError ? (
												<p role="alert" className="text-destructive text-xs">
													{deleteError}
												</p>
											) : null}
											<div className="flex items-center justify-end gap-2">
												<Button
													type="button"
													size="sm"
													variant="secondary"
													disabled={deleteSaving}
													onClick={cancelDelete}
												>
													Hủy
												</Button>
												<Button
													type="button"
													size="sm"
													variant="danger"
													disabled={deleteSaving}
													data-testid={`vocab-group-delete-confirm-${group.id}`}
													onClick={() => void handleDelete(group)}
												>
													{deleteSaving ? "Đang xoá..." : "Xoá nhóm"}
												</Button>
											</div>
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</Modal>
	);
}
