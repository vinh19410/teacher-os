import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { GradeModal } from "@/components/modals/grade-modal";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { SectionLabel } from "@/components/ui/section-label";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/assignments/$assignmentId")({
	component: AssignmentDetailRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<h1 className="font-display font-semibold text-xl">
				Không tìm thấy bài tập
			</h1>
			<p className="mt-2 text-muted-fg text-sm">
				Bài tập này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/assignments"
				className="mt-4 inline-block font-medium text-hot text-sm hover:text-accent-active"
			>
				← Về danh sách bài tập
			</Link>
		</Card>
	),
});

function AssignmentDetailRoute() {
	const { assignmentId } = Route.useParams();
	const { assignmentById, studentById, data } = useData();
	const assignment = assignmentById(assignmentId);
	const [gradeOpen, setGradeOpen] = useState(false);
	const [comment, setComment] = useState<string | null>(null);

	if (!assignment) {
		throw notFound();
	}
	const student = studentById(assignment.sid);
	const avg = assignment.scores
		? (
				(assignment.scores.task +
					assignment.scores.coherence +
					assignment.scores.lexical +
					assignment.scores.grammar) /
				4
			).toFixed(1)
		: null;

	const defaultComment = assignment.scores
		? "Tốt lexical resource, cần cải thiện coherence giữa các đoạn. Lỗi article a/an cần ôn lại."
		: "Phản hồi học sinh chưa nộp bài — nhắc qua Zalo.";
	const commentValue = comment ?? defaultComment;

	function appendComment(text: string) {
		setComment(commentValue ? `${commentValue}\n${text}` : text);
	}

	return (
		<div>
			<Card variant="white" className="mb-5 flex flex-wrap items-center gap-4">
				<Avatar text={student?.avatar ?? "?"} size="lg" />
				<div className="min-w-[200px] flex-1">
					<h1 className="font-display font-semibold text-2xl">
						{assignment.title}
					</h1>
					<div className="mt-1 font-mono text-meta text-xs">
						{student?.name} · {assignment.type} · Hạn nộp: {assignment.due}
					</div>
				</div>
				{avg ? (
					<div className="text-center">
						<div className="font-display font-semibold text-4xl text-hot">
							{avg}
						</div>
						<div className="font-mono text-meta text-xs">Band trung bình</div>
					</div>
				) : (
					<Button size="sm" onClick={() => setGradeOpen(true)}>
						Chấm bài
					</Button>
				)}
			</Card>

			{assignment.scores && (
				<>
					<SectionLabel>Rubric IELTS — 4 tiêu chí</SectionLabel>
					<div className="mb-5 grid grid-cols-2 gap-3 max-app:grid-cols-1">
						{[
							["Task Response", assignment.scores.task],
							["Coherence & Cohesion", assignment.scores.coherence],
							["Lexical Resource", assignment.scores.lexical],
							["Grammatical Range", assignment.scores.grammar],
						].map(([label, score]) => (
							<Card key={label} variant="white" className="px-4 py-3">
								<div className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.04em]">
									{label}
								</div>
								<div className="mt-1 font-display font-semibold text-2xl">
									{score}
								</div>
							</Card>
						))}
					</div>
				</>
			)}

			<div className="grid grid-cols-[2fr_1fr] items-start gap-5 max-app:grid-cols-1">
				<div>
					<SectionLabel>Nhận xét</SectionLabel>
					<Card variant="white">
						<Textarea
							value={commentValue}
							onChange={(e) => setComment(e.target.value)}
							className="min-h-40"
							placeholder="Nhập nhận xét chi tiết…"
						/>
						<div className="mt-3 flex gap-2">
							<Button size="sm">Gửi cho học viên</Button>
							<Button variant="secondary" size="sm">
								Lưu nháp
							</Button>
						</div>
					</Card>
				</div>
				<div>
					<SectionLabel>Ngân hàng nhận xét</SectionLabel>
					<Card variant="white">
						<div className="flex flex-col gap-2">
							{data.commentBank.map((c) => (
								<button
									type="button"
									key={c.id}
									onClick={() => appendComment(c.text)}
									className="rounded-sm border border-line-soft border-solid px-3 py-2 text-left text-fg-2 text-xs leading-[1.4] transition-colors duration-[150ms] hover:border-hot hover:bg-accent-soft"
								>
									<span className="mb-0.5 block font-mono text-[10px] text-hot uppercase tracking-[0.04em]">
										{c.tag}
									</span>
									{c.text}
								</button>
							))}
						</div>
					</Card>
				</div>
			</div>

			<GradeModal
				open={gradeOpen}
				onClose={() => setGradeOpen(false)}
				assignmentId={assignment.id}
			/>
		</div>
	);
}
