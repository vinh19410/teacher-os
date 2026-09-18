import { Tag } from "@/components/ui/tag";
import { genreOf, taskOf, wordCount } from "./assignment-presets";

/**
 * "Xem trước phía học viên" paper — exactly what a student will read.
 * Everything renders as text nodes (no innerHTML, per the plan's XSS note).
 */
export function StudentPreviewPaper({
	task,
	genre,
	title,
	band,
	source,
	prompt,
	note,
	status,
}: {
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
	status: string;
}) {
	const t = taskOf(task);
	const g = genreOf(task, genre);
	const trimmedTitle = title.trim() || g.title;
	const trimmedPrompt = prompt.trim();

	return (
		<div className="rounded-lg border border-line bg-surface-warm p-5">
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Xem trước phía học viên
			</p>
			<p className="mt-1 font-display font-semibold text-[17px]">
				{trimmedTitle}
			</p>
			<p className="mt-1.5 font-mono text-meta text-xs">
				Academic · {t.words} từ · {t.minutes} phút · Band {band}
			</p>
			<p className="mt-3 whitespace-pre-line text-sm leading-[1.55]">
				{trimmedPrompt || "Đề sẽ hiện ở đây khi bạn soạn."}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{t.label}</Tag>
				<Tag>{g.label}</Tag>
				<Tag>{`Band ${band}`}</Tag>
				{source.trim() && <Tag>{source.trim()}</Tag>}
				{note.trim() && <Tag>Có hướng dẫn thêm</Tag>}
				<Tag>{status === "draft" ? "Bản nháp" : "Sẵn sàng giao"}</Tag>
			</div>
			{trimmedPrompt && (
				<p className="mt-2 font-mono text-[11px] text-meta">
					{wordCount(prompt)} từ
				</p>
			)}
		</div>
	);
}
