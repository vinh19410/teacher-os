import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { genreOf, taskOf } from "./assignment-presets";

/**
 * Post-save state (design v3): replaces the form in place — "Tạo đề khác"
 * resets, the ghost link hands off to the assigning flow in Lớp học.
 */
export function CreateSuccessCard({
	title,
	status,
	task,
	genre,
	band,
	source,
	onCreateAnother,
}: {
	title: string;
	status: "draft" | "ready";
	task: string;
	genre: string;
	band: string;
	source: string;
	onCreateAnother: () => void;
}) {
	const t = taskOf(task);
	const g = genreOf(task, genre);

	return (
		<Card
			variant="white"
			className="flex flex-col gap-4 p-8"
			aria-live="polite"
		>
			<div
				aria-hidden="true"
				className="grid h-11 w-11 place-items-center rounded-full bg-[color-mix(in_oklab,var(--success),transparent_88%)] text-success"
			>
				<svg
					aria-hidden="true"
					width="22"
					height="22"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M5 12l5 5L20 7" />
				</svg>
			</div>
			<h2 className="font-display font-semibold text-[22px]">
				{status === "draft" ? "Đã lưu bản nháp" : "Đã thêm vào ngân hàng"}
			</h2>
			<p className="text-muted-fg">
				“{title}” chưa được giao lớp. Giao bài tập ở trang Lớp học khi cần.
			</p>
			<ul className="flex flex-col gap-2">
				{[
					["Dạng bài", `${t.label} · ${g.label}`],
					["Band mục tiêu", band],
					["Nguồn", source.trim() || "Không ghi nguồn"],
					["Trạng thái", status === "draft" ? "Bản nháp" : "Sẵn sàng giao"],
					["Giao lớp", "Chưa giao"],
				].map(([k, v]) => (
					<li key={k} className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">{k}</span>
						<strong className="text-sm">{v}</strong>
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
