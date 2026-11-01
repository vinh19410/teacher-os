import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
	isAutoSkill,
	partOf,
	type QuestionItem,
	skillOf,
	typeOf,
} from "./assignment-presets";

export function CreateSuccessCard({
	title,
	status,
	skill = "writing",
	part = "task2",
	type = "discuss",
	band,
	source,
	audioName = "",
	questions = [],
	onCreateAnother,
}: {
	title: string;
	status: "draft" | "ready";
	skill?: string;
	part?: string;
	type?: string;
	band: string;
	source: string;
	audioName?: string;
	questions?: QuestionItem[];
	onCreateAnother: () => void;
}) {
	const skillPreset = skillOf(skill);
	const partPreset = partOf(skill, part);
	const typePreset = typeOf(skill, part, type);
	const auto = isAutoSkill(skill);
	const locked = questions.filter((item) => item.answer.trim()).length;
	return (
		// rounded-md bg-muted có border:0 nên card viền trái dùng nền sunk trực tiếp
		// (bg-muted) thay vì qua utility rounded-md bg-muted.
		<div
			className="flex max-w-2xl flex-col gap-4 rounded-md border-primary border-l-4 bg-muted p-8"
			aria-live="polite"
		>
			<div
				aria-hidden="true"
				className="grid h-11 w-11 place-items-center rounded-full rounded-md bg-muted text-foreground"
			>
				✓
			</div>
			<h2 className="font-semibold text-[22px] tracking-tight">
				{status === "draft" ? "Đã lưu bản nháp" : "Đã thêm vào ngân hàng"}
			</h2>
			<p className="text-muted-foreground">
				“{title}” chưa được giao lớp. Giao bài tập ở trang Lớp học khi cần.
			</p>
			<ul className="flex flex-col gap-2">
				{[
					["Kỹ năng", skillPreset.name],
					["Phần thi", `${partPreset.label} · ${typePreset.label}`],
					["Band mục tiêu", band],
					[
						"Chi tiết",
						skill === "listening"
							? audioName || "Chưa đính file"
							: auto
								? `${questions.length} câu`
								: typePreset.label,
					],
					...(auto
						? [
								[
									"Chấm điểm",
									`Tự động · ${locked}/${questions.length} đáp án đã khóa`,
								],
							]
						: []),
					["Nguồn", source.trim() || "Không ghi nguồn"],
					["Trạng thái", status === "draft" ? "Bản nháp" : "Sẵn sàng giao"],
					["Giao lớp", "Chưa giao"],
				].map(([key, value]) => (
					<li
						key={key}
						className="flex items-center justify-between gap-4 border-border border-t py-2 first:border-t-0 first:pt-0"
					>
						<span className="text-muted-foreground text-xs">{key}</span>
						<strong className="text-right text-sm">{value}</strong>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap gap-3 pt-2">
				<Button variant="secondary" onClick={onCreateAnother}>
					Tạo đề khác
				</Button>
				<Link
					to="/assignments"
					className="inline-flex items-center rounded-full px-2 font-medium text-muted-foreground text-sm transition-colors hover:text-primary"
				>
					Xem danh sách bài tập
				</Link>
				<Link
					to="/classes"
					className="inline-flex items-center rounded-full px-2 font-medium text-muted-foreground text-sm transition-colors hover:text-primary"
				>
					Mở trang Lớp học
				</Link>
			</div>
		</div>
	);
}
