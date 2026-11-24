import { Button } from "@teacher-os/ui/components/button";
import { isPreviewableDocumentMime } from "@teacher-os/ui/components/document-preview/inline-document-preview";
import { useSyncExternalStore } from "react";
import { StudentMaterialRow } from "@/components/class/lesson-materials";
import { StudentClassMaterialPreview } from "@/components/class/student-material-preview";
import { HttpError } from "@/lib/query-client";
import {
	classMaterialFileUrl,
	getActiveStudentOrgId,
	useClassMaterials,
} from "@/lib/repos/student";
import { subscribeActiveStudentOrg } from "@/lib/student-org-storage";

const CARD_CLASS =
	"rounded-xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6";

/**
 * Tab "Tài liệu chung" cấp lớp học cho học viên (chỉ đọc):
 * hiển thị danh sách tài liệu dùng chung cho cả khóa (xem trước PDF/ảnh,
 * phát audio/video, mở liên kết ngoài, tải file) kể cả khi lớp chưa có buổi
 * học hoặc đang tạm dừng.
 */
export function ClassMaterialsTab({ classId }: { classId: string }) {
	useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const query = useClassMaterials(classId, true);
	const notFound =
		query.error instanceof HttpError && query.error.status === 404;

	if (query.isLoading) {
		return (
			<div className={CARD_CLASS}>
				<p role="status" className="text-muted-foreground text-sm">
					Đang tải tài liệu chung…
				</p>
			</div>
		);
	}

	if (query.isError && !notFound) {
		return (
			<div className={CARD_CLASS}>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<p role="alert" className="text-destructive text-sm">
						Không tải được tài liệu chung. Vui lòng thử lại sau ít phút.
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={query.isFetching}
						onClick={() => void query.refetch()}
					>
						Thử lại
					</Button>
				</div>
			</div>
		);
	}

	const items = notFound ? [] : (query.data ?? []);
	if (items.length === 0) {
		return (
			<div className={CARD_CLASS}>
				<p
					data-testid="class-materials-empty"
					className="text-muted-foreground text-sm"
				>
					Lớp chưa có tài liệu chung nào. Giáo viên sẽ chia sẻ tài liệu dùng cho
					cả khóa tại đây.
				</p>
			</div>
		);
	}

	return (
		<div className={CARD_CLASS}>
			<ul className="divide-y" aria-label="Tài liệu chung của lớp">
				{items.map((m) => {
					const hasThumbnail =
						isPreviewableDocumentMime(m.kind, m.mimeType) !== null;
					return (
						<StudentMaterialRow
							key={m.id}
							material={m}
							fileUrl={classMaterialFileUrl(classId, m.id)}
							downloadUrl={classMaterialFileUrl(classId, m.id, true)}
							preview={
								hasThumbnail ? (
									<StudentClassMaterialPreview material={m} classId={classId} />
								) : undefined
							}
							testId="class-material"
						/>
					);
				})}
			</ul>
		</div>
	);
}
