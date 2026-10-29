import { Link } from "@tanstack/react-router";
import type { LibraryTestListItem } from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { fmtDateTime, SKILL_LABELS, STATUS_LABELS } from "./library-filters";

/**
 * Bảng danh sách bộ đề (phase 6) — thuần trình bày: tiêu đề (link sang
 * trang edit), skill, bộ sưu tập/nhóm, trạng thái, số part/câu, audio
 * (listening), thời gian cập nhật và thao tác Sửa/Xóa. Xóa mở xác nhận ở
 * route (dialog quản lý bởi state route).
 */

export function TestTable({
	items,
	deletingId,
	onDelete,
}: {
	items: LibraryTestListItem[];
	/** Đang xóa — khóa nút Xóa của đúng dòng đó. */
	deletingId: string | null;
	onDelete: (item: LibraryTestListItem) => void;
}) {
	return (
		<div className="overflow-x-auto rounded-lg border">
			<table className="w-full border-collapse text-sm">
				<thead>
					<tr className="border-b bg-muted/40 text-left text-muted-foreground text-xs">
						<th scope="col" className="px-3 py-2 font-medium">
							Tiêu đề
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Kỹ năng
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Bộ sưu tập / Nhóm
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Trạng thái
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Part / Câu
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							Cập nhật
						</th>
						<th scope="col" className="px-3 py-2 font-medium">
							<span className="sr-only">Thao tác</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{items.map((item) => (
						<tr
							key={item.id}
							className="border-b last:border-b-0 hover:bg-muted/20"
						>
							<td className="px-3 py-2">
								<Link
									to="/library/tests/$testId"
									params={{ testId: item.id }}
									className="font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
								>
									{item.title}
								</Link>
							</td>
							<td className="px-3 py-2">
								{SKILL_LABELS[item.skill as keyof typeof SKILL_LABELS] ??
									item.skill}
							</td>
							<td className="px-3 py-2 text-muted-foreground">
								{[item.collection, item.testGroup]
									.filter(Boolean)
									.join(" · ") || "—"}
							</td>
							<td className="px-3 py-2">
								<span
									className={
										item.status === "ready"
											? "rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 text-xs"
											: "rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs"
									}
								>
									{STATUS_LABELS[item.status as keyof typeof STATUS_LABELS] ??
										item.status}
								</span>
							</td>
							<td className="px-3 py-2 tabular-nums">
								{item.partCount} part · {item.questionCount} câu
							</td>
							<td className="px-3 py-2 text-muted-foreground tabular-nums">
								{fmtDateTime(item.updatedAt)}
							</td>
							<td className="px-3 py-2">
								<div className="flex justify-end gap-2">
									<Link
										to="/library/tests/$testId"
										params={{ testId: item.id }}
										className={buttonVariants({
											variant: "outline",
											size: "sm",
										})}
									>
										Sửa
									</Link>
									<button
										type="button"
										disabled={deletingId === item.id}
										onClick={() => onDelete(item)}
										className={buttonVariants({
											variant: "ghost",
											size: "sm",
											className: "text-destructive hover:text-destructive",
										})}
									>
										{deletingId === item.id ? "Đang xóa…" : "Xóa"}
									</button>
								</div>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
