import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CLASS_TYPE_LABELS, type Syllabus } from "@/lib/mock-data";

const dotClass: Record<string, string> = {
	done: "bg-success",
	current: "bg-accent-blue shadow-[0_0_0_3px_var(--accent-soft)]",
	upcoming: "bg-line",
};

function statusBadge(status: string) {
	if (status === "done")
		return (
			<Badge variant="success" dot>
				Đã dạy
			</Badge>
		);
	if (status === "current") return <Badge variant="accent">Đang học</Badge>;
	return <Badge variant="muted">Sắp tới</Badge>;
}

export function SyllabusProgress({ syllabus }: { syllabus: Syllabus }) {
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

	function toggle(id: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const all = syllabus.modules.flatMap((m) => m.lessons);
	const done = all.filter((l) => l.status === "done").length;
	const pct = all.length > 0 ? Math.round((done / all.length) * 100) : 0;

	return (
		<div>
			<Card variant="white" className="mb-4 flex flex-wrap items-center gap-4">
				<div className="flex-1">
					<div className="font-semibold text-sm">{syllabus.name}</div>
					<div className="font-mono text-meta text-xs">
						{syllabus.level} ·{" "}
						{syllabus.skills.length > 0
							? syllabus.skills.join(", ")
							: CLASS_TYPE_LABELS[syllabus.type]}{" "}
						· {syllabus.totalLessons} buổi
					</div>
				</div>
				<div className="text-right">
					<div className="font-mono font-semibold text-accent-blue text-xl">
						{pct}%
					</div>
					<div className="font-mono text-meta text-xs">
						{done}/{all.length} buổi
					</div>
				</div>
			</Card>
			<Progress value={pct} className="mb-5" />
			{syllabus.modules.map((m) => {
				const mDone = m.lessons.filter((l) => l.status === "done").length;
				return (
					<div
						key={m.id}
						className="mb-4 overflow-hidden rounded-lg border border-line-soft border-solid bg-bg last:mb-0"
					>
						<button
							type="button"
							onClick={() => toggle(m.id)}
							className="flex w-full items-center justify-between gap-4 border-line-soft border-b border-solid bg-surface-warm px-5 py-4 text-left transition-colors duration-[150ms] hover:bg-surface"
						>
							<h3 className="font-semibold text-sm">{m.title}</h3>
							<span className="font-mono text-[11px] text-muted-fg">
								{mDone}/{m.lessons.length} buổi
							</span>
						</button>
						{!collapsed.has(m.id) && (
							<div className="block">
								{m.lessons.map((l) => (
									<div
										key={l.id}
										className="grid grid-cols-[20px_1fr_auto] items-start gap-3 border-line-soft border-b border-solid px-5 py-3 last:border-b-0 hover:bg-surface-warm max-app:grid-cols-[20px_1fr]"
									>
										<span
											className={`lesson-dot mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full ${dotClass[l.status]}`}
										/>
										<div>
											<div className="font-medium text-sm">{l.title}</div>
											<div className="mt-0.5 text-[11px] text-muted-fg">
												{l.materials}
											</div>
											<div className="mt-[3px] text-fg-2 text-xs leading-[1.4]">
												Mục tiêu: {l.objectives}
											</div>
										</div>
										<div className="max-app:col-start-2 max-app:pt-1">
											{statusBadge(l.status)}
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
