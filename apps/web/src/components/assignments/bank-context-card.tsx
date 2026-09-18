import { Link } from "@tanstack/react-router";

import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import type { AssignmentPrompt } from "@/lib/mock-data";

const STATUS_TAG: Record<string, string> = {
	ready: "Sẵn sàng",
	draft: "Bản nháp",
};

/**
 * "Ngân hàng" card — status chips for the prompt being created plus the
 * honest existing-prompts list. Per #202 there is no prompt→class link data
 * yet, so no "Đã dùng N lớp" tag is ever rendered.
 */
export function BankContextCard({
	status,
	onStatusChange,
	prompts,
}: {
	status: "draft" | "ready";
	onStatusChange: (status: "draft" | "ready") => void;
	prompts: AssignmentPrompt[];
}) {
	const recent = [...prompts].slice(-5).reverse();

	return (
		<Card variant="white" className="flex flex-col gap-4">
			<div>
				<SectionLabel>Ngân hàng</SectionLabel>
				<h2 className="font-display font-semibold text-[22px]">
					Chưa giao lớp
				</h2>
			</div>
			<p className="text-muted-fg text-sm">
				Đề này chỉ được thêm vào ngân hàng bài tập. Giao cho lớp và học viên ở
				trang{" "}
				<Link
					to="/classes"
					className="text-fg underline underline-offset-[3px] hover:text-accent-blue"
				>
					Lớp học
				</Link>
				.
			</p>

			<div className="flex flex-col gap-1.5">
				<span className="font-medium text-muted-fg text-xs">Trạng thái</span>
				<ChipFilter
					options={["Bản nháp", "Sẵn sàng giao"]}
					value={status === "draft" ? "Bản nháp" : "Sẵn sàng giao"}
					onChange={(label) =>
						onStatusChange(label === "Bản nháp" ? "draft" : "ready")
					}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<SectionLabel>Đề đã có</SectionLabel>
				{recent.length === 0 ? (
					<p className="text-muted-fg text-sm">
						Chưa có đề nào trong ngân hàng.
					</p>
				) : (
					<ul className="flex flex-col gap-2">
						{recent.map((p) => (
							<li
								key={p.id}
								className="flex flex-col gap-1 rounded-sm border border-line-soft px-3 py-2"
							>
								<strong className="text-sm">{p.title}</strong>
								<div className="flex flex-wrap items-center gap-2">
									<Tag>{STATUS_TAG[p.status] ?? p.status}</Tag>
									<span className="font-mono text-meta text-xs">
										{p.source || "Chưa ghi nguồn"}
									</span>
								</div>
							</li>
						))}
						{prompts.length > recent.length && (
							<li className="font-mono text-meta text-xs">
								còn {prompts.length - recent.length} đề khác
							</li>
						)}
					</ul>
				)}
			</div>
		</Card>
	);
}
