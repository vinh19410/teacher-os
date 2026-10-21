import type { ClassmatesResponse } from "@teacher-os/api/contracts";
import { OverviewEmptyState } from "@/components/overview/empty-state";
import { useClassmates } from "@/lib/repos/student";

function ClassmateCard({ mate }: { mate: ClassmatesResponse[number] }) {
	return (
		<div
			data-testid="classmate-card"
			className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm"
		>
			<span
				aria-hidden="true"
				className="flex size-11 flex-none items-center justify-center rounded-md border border-input bg-transparent font-medium text-foreground"
			>
				{mate.initials}
			</span>
			<div className="min-w-0">
				<p className="truncate font-medium text-[15px] text-foreground">
					{mate.name}
					{mate.isMe && (
						<span className="ml-1.5 font-normal text-muted-foreground">
							(bạn)
						</span>
					)}
				</p>
			</div>
		</div>
	);
}

/**
 * Tab "Bạn cùng lớp" (#378): lưới card avatar chữ tắt + tên học viên đang
 * ghi danh active vào lớp. Dữ liệu chỉ gồm name/initials — server không trả
 * email/band/học phí/điểm.
 */
export function ClassmatesTab({ classId }: { classId: string }) {
	const classmatesQuery = useClassmates(classId, true);

	if (classmatesQuery.isLoading) {
		return (
			<div className="rounded-xl border bg-card p-6 shadow-sm">
				<p className="text-muted-foreground text-sm">Đang tải danh sách lớp…</p>
			</div>
		);
	}

	if (classmatesQuery.isError || !classmatesQuery.data) {
		return (
			<OverviewEmptyState
				icon="book"
				title="Không tải được danh sách lớp"
				description="Vui lòng thử lại sau ít phút."
			/>
		);
	}

	const classmates = classmatesQuery.data;
	if (classmates.length === 0) {
		return (
			<OverviewEmptyState
				icon="book"
				title="Lớp chưa có học viên nào"
				description="Khi có bạn mới ghi danh, danh sách sẽ hiện tại đây."
			/>
		);
	}

	return (
		<div
			data-testid="classmates-grid"
			className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
		>
			{classmates.map((mate) => (
				<ClassmateCard key={mate.id} mate={mate} />
			))}
		</div>
	);
}
