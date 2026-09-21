import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
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
	task?: string;
	genre?: string;
}) {
	const skillPreset = skillOf(skill);
	const partPreset = partOf(skill, part);
	const typePreset = typeOf(skill, part, type);
	const auto = skill === "reading" || skill === "listening";
	const locked = questions.filter((item) => item.answer.trim()).length;
	return (
		<Card
			variant="white"
			className="flex max-w-2xl flex-col gap-4 p-8"
			aria-live="polite"
		>
			<div
				aria-hidden="true"
				className="grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_oklab,var(--success),transparent_88%)] text-success"
			>
				✓
			</div>
			<h2 className="font-display font-semibold text-[22px]">
				{status === "draft" ? "Đã lưu bản nháp" : "Đã thêm vào ngân hàng"}
			</h2>
			<p className="text-muted-fg">
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
					<li key={key} className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">{key}</span>
						<strong className="text-right text-sm">{value}</strong>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap gap-3 pt-2">
				<Button variant="secondary" onClick={onCreateAnother}>
					Tạo đề khác
				</Button>
				<Link
					to="/assignments/bank"
					className="inline-flex items-center rounded-full px-2 font-medium text-fg-2 text-sm hover:text-fg"
				>
					Xem ngân hàng đề
				</Link>
				<Link
					to="/classes"
					className="inline-flex items-center rounded-full px-2 font-medium text-fg-2 text-sm hover:text-fg"
				>
					Mở trang Lớp học
				</Link>
			</div>
		</Card>
	);
}
