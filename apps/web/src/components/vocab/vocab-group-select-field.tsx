import {
	type KernelVocabGroupRow,
	VOCAB_ERROR_CODES,
} from "@teacher-os/api/contracts";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { useData } from "@/lib/data-store";

export interface VocabGroupSelectFieldProps {
	groups: ReadonlyArray<KernelVocabGroupRow>;
	value: string;
	onChange: (groupId: string) => void;
	disabled?: boolean;
	id?: string;
	testIdPrefix?: string;
}

export function VocabGroupSelectField({
	groups,
	value,
	onChange,
	disabled = false,
	id,
	testIdPrefix = "vocab-group-select",
}: VocabGroupSelectFieldProps) {
	const { dispatch } = useData();
	const fallbackId = useId();
	const selectId = id ?? fallbackId;

	const [creatingOpen, setCreatingOpen] = useState(false);
	const [draftName, setDraftName] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const sortedGroups = useMemo(
		() => [...groups].sort((a, b) => a.name.localeCompare(b.name, "vi")),
		[groups],
	);

	useEffect(() => {
		if (!creatingOpen) return;
		inputRef.current?.focus();
	}, [creatingOpen]);

	const openCreator = () => {
		setCreatingOpen(true);
		setDraftName("");
		setError(null);
	};

	const closeCreator = () => {
		setCreatingOpen(false);
		setDraftName("");
		setError(null);
	};

	const handleQuickCreate = async () => {
		const trimmed = draftName.trim();
		if (trimmed.length === 0 || saving || disabled) return;
		setSaving(true);
		setError(null);
		try {
			const result = await dispatch({
				type: "create-vocab-group",
				payload: { name: trimmed },
			});
			if (result.kind === "refreshed") {
				if (result.id) {
					onChange(result.id);
				}
				closeCreator();
				toast.success(`Đã tạo nhóm "${trimmed}".`);
				return;
			}
			if (result.kind === "committed") {
				const msg =
					"Đã lưu nhóm nhưng chưa đồng bộ danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setError(msg);
				return;
			}
			if (result.kind === "definite-failure") {
				if (
					result.code === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS ||
					result.reason === VOCAB_ERROR_CODES.GROUP_NAME_EXISTS
				) {
					setError("Tên nhóm đã tồn tại.");
					return;
				}
				setError(
					result.reason
						? `Không thể tạo nhóm (${result.reason}).`
						: "Không thể tạo nhóm. Vui lòng thử lại.",
				);
				return;
			}
			setError(
				"Không rõ kết quả mạng — hãy kiểm tra danh sách nhóm trước khi thử lại.",
			);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-1.5">
			<label
				htmlFor={selectId}
				className="font-medium text-foreground text-sm leading-none"
			>
				Nhóm
			</label>
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<Select
					id={selectId}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled || saving}
					aria-label="Nhóm bộ từ"
					data-testid={testIdPrefix}
					className="min-w-0 sm:flex-1"
				>
					<option value="">Chưa phân nhóm</option>
					{sortedGroups.map((group) => (
						<option key={group.id} value={group.id}>
							{group.name}
						</option>
					))}
				</Select>
				{!creatingOpen ? (
					<Button
						type="button"
						size="sm"
						variant="secondary"
						disabled={disabled || saving}
						data-testid={`${testIdPrefix}-quick-create-toggle`}
						onClick={openCreator}
						className="shrink-0"
					>
						+ Tạo nhóm
					</Button>
				) : null}
			</div>
			{creatingOpen ? (
				<div className="space-y-2 rounded-md border border-border bg-muted/40 p-2.5">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Input
							ref={inputRef}
							maxLength={100}
							value={draftName}
							onChange={(e) => {
								setDraftName(e.target.value);
								if (error) setError(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									void handleQuickCreate();
								} else if (e.key === "Escape") {
									e.preventDefault();
									e.stopPropagation();
									closeCreator();
								}
							}}
							placeholder="Tên nhóm mới (VD: IELTS Foundation)"
							aria-label="Tên nhóm mới"
							aria-invalid={error ? true : undefined}
							disabled={disabled || saving}
							data-testid={`${testIdPrefix}-quick-create-input`}
							className="min-w-0 sm:flex-1"
						/>
						<div className="flex shrink-0 items-center gap-1.5">
							<Button
								type="button"
								size="sm"
								disabled={disabled || saving || draftName.trim().length === 0}
								data-testid={`${testIdPrefix}-quick-create-submit`}
								onClick={() => void handleQuickCreate()}
							>
								{saving ? "Đang lưu..." : "Lưu"}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="secondary"
								disabled={saving}
								data-testid={`${testIdPrefix}-quick-create-cancel`}
								onClick={closeCreator}
							>
								Hủy
							</Button>
						</div>
					</div>
					{error ? (
						<p
							role="alert"
							data-testid={`${testIdPrefix}-quick-create-error`}
							className="text-destructive text-xs"
						>
							{error}
						</p>
					) : null}
				</div>
			) : null}
		</div>
	);
}
