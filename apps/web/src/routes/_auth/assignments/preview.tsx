import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { wordCount } from "@/components/assignments/assignment-presets";
import { StudentPreviewPaper } from "@/components/assignments/student-preview-paper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { readPreviewDraft } from "@/lib/assignment-preview-draft";

export const Route = createFileRoute("/_auth/assignments/preview")({
	component: PreviewAssignmentRoute,
});

export function PreviewAssignmentRoute() {
	const navigate = useNavigate();
	// Read without clearing: reloading the preview keeps working; the create
	// page consumes (takes) the snapshot on its own mount.
	const [draft] = useState(() => readPreviewDraft());
	const [answer, setAnswer] = useState("");

	if (!draft) {
		return (
			<div>
				<PageHead
					title="Xem trước bài tập"
					lead="Trang này mô phỏng đề bài đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."
				/>
				<Card variant="white" className="mx-auto max-w-xl p-8 text-center">
					<h2 className="font-display font-semibold text-lg">
						Chưa có bản nháp nào để xem trước.
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Soạn đề ở trang tạo bài tập rồi bấm Xem trước.
					</p>
					<div className="mt-6 flex justify-center">
						<Button
							variant="secondary"
							onClick={() => navigate({ to: "/assignments/new" })}
						>
							Mở trang tạo bài tập
						</Button>
					</div>
				</Card>
			</div>
		);
	}

	return (
		<div className="max-w-3xl">
			<nav
				aria-label="Breadcrumb"
				className="mb-3 flex items-center gap-2 font-mono text-meta text-xs"
			>
				<Link
					to="/assignments"
					className="underline-offset-[3px] hover:text-fg hover:underline"
				>
					Bài tập
				</Link>
				<span aria-hidden="true">›</span>
				<button
					type="button"
					onClick={() => navigate({ to: "/assignments/new" })}
					className="underline-offset-[3px] hover:text-fg hover:underline"
				>
					Tạo mới
				</button>
				<span aria-hidden="true">›</span>
				<span>Xem trước</span>
			</nav>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<PageHead
					title="Xem trước bài tập"
					lead="Trang này mô phỏng đề bài đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."
				/>
				<Button
					variant="secondary"
					onClick={() => navigate({ to: "/assignments/new" })}
				>
					Quay lại soạn đề
				</Button>
			</div>

			<div className="mt-5 flex flex-col gap-5">
				<StudentPreviewPaper
					task={draft.task}
					genre={draft.genre}
					skill={draft.skill}
					part={draft.part}
					type={draft.type}
					title={draft.title}
					band={draft.band}
					source={draft.source}
					prompt={draft.prompt}
					note={draft.note}
					status={draft.status}
					passage={draft.passage}
					intro={draft.intro}
					audioName={draft.audioName}
					imageUrl={draft.imageUrl}
					optionBank={draft.optionBank}
					items={draft.items}
				/>

				<Card variant="white" className="flex flex-col gap-3">
					<h2 className="font-display font-semibold text-[17px]">
						Bài làm của học viên (mô phỏng)
					</h2>
					<Textarea
						value={answer}
						onChange={(e) => setAnswer(e.target.value)}
						className="min-h-42"
						placeholder="Học viên sẽ viết bài ở đây…"
					/>
					<div className="flex items-center justify-between">
						<span className="font-mono text-meta text-xs">
							Bản xem trước — bài làm không được lưu.
						</span>
						<span className="font-mono text-meta text-xs">
							{wordCount(answer)} từ
						</span>
					</div>
				</Card>
			</div>
		</div>
	);
}
