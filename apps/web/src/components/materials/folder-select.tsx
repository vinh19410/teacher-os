import type { MaterialFolderView } from "@teacher-os/api/material-contracts";
import { Select } from "@/components/ui/field";
import { flattenFolderTree } from "@/lib/material-folders";

/** Giá trị option cho "không thư mục" (gốc ngân hàng). */
export const NO_FOLDER_VALUE = "";

/**
 * Select chọn thư mục với cây thụt lề. `exclude` loại các thư mục không
 * hợp lệ làm đích (chính nó + con cháu khi di chuyển thư mục).
 */
export function FolderSelect({
	id,
	folders,
	value,
	onChange,
	rootLabel,
	exclude,
	disabled,
}: {
	id?: string;
	folders: readonly MaterialFolderView[];
	value: string | null;
	onChange: (folderId: string | null) => void;
	rootLabel: string;
	exclude?: ReadonlySet<string>;
	disabled?: boolean;
}) {
	const rows = flattenFolderTree(folders).filter(
		(row) => !exclude?.has(row.folder.id),
	);
	return (
		<Select
			id={id}
			value={value ?? NO_FOLDER_VALUE}
			disabled={disabled}
			onChange={(e) =>
				onChange(e.target.value === NO_FOLDER_VALUE ? null : e.target.value)
			}
		>
			<option value={NO_FOLDER_VALUE}>{rootLabel}</option>
			{rows.map(({ folder, depth }) => (
				<option key={folder.id} value={folder.id}>
					{`${"  ".repeat(depth)}${depth > 0 ? "└ " : ""}${folder.name}`}
				</option>
			))}
		</Select>
	);
}
