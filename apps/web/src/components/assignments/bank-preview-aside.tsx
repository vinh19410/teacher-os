import { Link } from "@tanstack/react-router";
import { Tag } from "@/components/ui/tag";
import type { AssignmentPrompt } from "@/lib/mock-data";
import { genreOf, taskOf, wordCount } from "./assignment-presets";

interface BankPreviewAsideProps {
	prompt: AssignmentPrompt;
}

export function BankPreviewAside({ prompt }: BankPreviewAsideProps) {
	const t = taskOf(prompt.task);
	const g = genreOf(prompt.task, prompt.genre);
	const trimmedTitle = prompt.title.trim() || g.title;
	const trimmedPrompt = prompt.prompt.trim();

	return (
		<aside
			aria-label="Xem trước đề"
			className="rounded-lg border border-line bg-surface-warm p-5 lg:sticky lg:top-[76px]"
		>
			<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
				Xem trước phía học viên
			</p>
			<p className="mt-1 font-display font-semibold text-[17px] text-fg">
				{trimmedTitle}
			</p>
			<p className="mt-1.5 font-mono text-meta text-xs">
				Academic · {t.words} từ · {t.minutes} phút · Band {prompt.band}
			</p>
			<p className="mt-3 whitespace-pre-wrap text-fg text-sm leading-[1.55]">
				{trimmedPrompt}
			</p>
			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{g.label}</Tag>
				<Tag>{`Band ${prompt.band}`}</Tag>
				{prompt.source.trim() && <Tag>{prompt.source.trim()}</Tag>}
				<Tag>{t.label}</Tag>
			</div>
			{trimmedPrompt && (
				<p className="mt-2 font-mono text-[11px] text-meta">
					{wordCount(prompt.prompt)} từ
				</p>
			)}
			<div className="mt-4 rounded-md border border-line bg-surface px-3 py-2.5 text-muted-fg text-xs leading-relaxed">
				Đề này chưa giao lớp. Giao cho học viên ở trang{" "}
				<Link
					to="/classes"
					className="font-medium text-fg underline underline-offset-2 hover:text-accent"
				>
					Lớp học
				</Link>
				.
			</div>
		</aside>
	);
}
