/**
 * Stub server cho ngân hàng tài liệu trong behavioral tests (#655): phục vụ
 * danh sách/thư mục/upload trên đúng đường API thật qua `startKernelServer`
 * — mọi request vẫn ghi vào `server.writes` để test assert payload.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import type { MaterialView } from "@teacher-os/api/material-contracts";
import type { KernelServer } from "@/test/kernel-harness";
import { snapshotFixture, startKernelServer } from "@/test/kernel-harness";

/** Một tài liệu ngân hàng dạng file, đủ cột MaterialView. */
export const bankMaterialRow: MaterialView = {
	id: "mat-1",
	folderId: null,
	title: "Reading pack",
	description: "Bài đọc kèm bài học",
	kind: "file",
	url: null,
	mimeType: "application/pdf",
	sizeBytes: 1024,
	originalName: "reading.pdf",
	usageCount: 0,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
};

/**
 * Kernel server kèm endpoints đọc/upload của ngân hàng: GET folders (rỗng),
 * GET list (mặc định 1 dòng `bankMaterialRow`), POST /files → tài liệu mới
 * `mat-uploaded`. Mọi write khác rơi về mặc định `200 {}`.
 */
export function startMaterialsBankServer(
	items = [bankMaterialRow],
	snapshot: KernelSnapshot = snapshotFixture(),
): KernelServer {
	return startKernelServer(snapshot, (req) => {
		if (req.method === "GET" && req.path === "/api/materials/folders") {
			return { status: 200, body: { folders: [] } };
		}
		if (req.method === "GET" && req.path.startsWith("/api/materials")) {
			return { status: 200, body: { items } };
		}
		// Upload file dùng PUT (uploadInit): method + tên file trong header.
		if (req.method === "PUT" && req.path.startsWith("/api/materials/files")) {
			return {
				status: 200,
				body: {
					material: {
						...bankMaterialRow,
						id: "mat-uploaded",
						originalName: "upload.pdf",
					},
				},
			};
		}
		return undefined;
	});
}
