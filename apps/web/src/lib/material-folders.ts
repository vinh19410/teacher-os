import type { MaterialFolderView } from "@teacher-os/api/material-contracts";

/** Một dòng của cây thư mục đã trải phẳng theo thứ tự hiển thị. */
export interface FolderTreeRow {
	folder: MaterialFolderView;
	/** Cấp trong cây — thư mục gốc là 0. */
	depth: number;
}

const byName = (a: MaterialFolderView, b: MaterialFolderView) =>
	a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id);

/**
 * Server trả danh sách thư mục phẳng; client dựng cây theo `parentId` rồi
 * trải phẳng theo duyệt tiền thứ tự (cha trước con, anh em theo tên). Thư
 * mục có cha không tồn tại hoặc kẹt trong chu trình `parentId` (#646) đều
 * được đưa về cấp gốc từ nút đầu chu trình để không bao giờ biến mất khỏi UI.
 */
export function flattenFolderTree(
	folders: readonly MaterialFolderView[],
): FolderTreeRow[] {
	const byId = new Map(folders.map((f) => [f.id, f]));
	const children = new Map<string | null, MaterialFolderView[]>();
	for (const folder of folders) {
		const parent =
			folder.parentId !== null && byId.has(folder.parentId)
				? folder.parentId
				: null;
		const list = children.get(parent) ?? [];
		list.push(folder);
		children.set(parent, list);
	}
	const rows: FolderTreeRow[] = [];
	const seen = new Set<string>();
	const walk = (parent: string | null, depth: number) => {
		for (const folder of [...(children.get(parent) ?? [])].sort(byName)) {
			if (seen.has(folder.id)) continue;
			seen.add(folder.id);
			rows.push({ folder, depth });
			walk(folder.id, depth + 1);
		}
	};
	walk(null, 0);
	for (const start of [...folders].sort(byName)) {
		if (seen.has(start.id)) continue;
		const trace: MaterialFolderView[] = [];
		const indexById = new Map<string, number>();
		let current: MaterialFolderView | undefined = start;
		while (current !== undefined && !indexById.has(current.id)) {
			indexById.set(current.id, trace.length);
			trace.push(current);
			current =
				current.parentId !== null ? byId.get(current.parentId) : undefined;
		}
		const cycleStart = current ? (indexById.get(current.id) ?? 0) : 0;
		const cycleRoot = [...trace.slice(cycleStart)].sort(byName)[0] ?? start;
		seen.add(cycleRoot.id);
		rows.push({ folder: cycleRoot, depth: 0 });
		walk(cycleRoot.id, 1);
	}
	return rows;
}

/** Id của thư mục và mọi thư mục con cháu — không thể di chuyển vào chúng. */
export function folderSubtreeIds(
	folders: readonly MaterialFolderView[],
	rootId: string,
): Set<string> {
	const ids = new Set<string>([rootId]);
	let grew = true;
	while (grew) {
		grew = false;
		for (const folder of folders) {
			if (
				folder.parentId !== null &&
				ids.has(folder.parentId) &&
				!ids.has(folder.id)
			) {
				ids.add(folder.id);
				grew = true;
			}
		}
	}
	return ids;
}

/** Đường dẫn hiển thị "Cha / Con" của thư mục; id lạ → null. */
export function folderPath(
	folders: readonly MaterialFolderView[],
	id: string | null,
): string | null {
	if (id === null) return null;
	const byId = new Map(folders.map((f) => [f.id, f]));
	const names: string[] = [];
	const seen = new Set<string>();
	let current: string | null = id;
	while (current !== null && !seen.has(current)) {
		seen.add(current);
		const folder = byId.get(current);
		if (!folder) break;
		names.unshift(folder.name);
		current = folder.parentId;
	}
	return names.length > 0 ? names.join(" / ") : null;
}
