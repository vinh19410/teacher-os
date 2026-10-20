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
			<h1 className="font-semibold text-xl">Không tìm thấy bài tập</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Bài tập này không tồn tại hoặc dữ liệu demo đã được reset.
			</p>
			<Link
				to="/assignments"
				className="mt-4 inline-block text-muted-foreground text-xs transition-colors hover:text-primary"
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
			<Card className="mb-5 flex flex-wrap items-center gap-4">
				<Avatar text={student?.avatar ?? "?"} size="lg" />
				<div className="min-w-[200px] flex-1">
					<h1 className="font-semibold text-2xl tracking-tight">
						{assignment.title}
					</h1>
					<div className="mt-1 text-muted-foreground text-xs">
						{student?.name} · {assignment.type} · Hạn nộp: {assignment.due}
					</div>
				</div>
				{avg ? (
					<div className="text-center">
						<div className="font-semibold text-4xl text-primary tracking-tight">
							{avg}
						</div>
						<div className="text-muted-foreground text-xs">Band trung bình</div>
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
							<Card key={label} className="px-4 py-3">
								<div className="text-muted-foreground text-xs">{label}</div>
								<div className="mt-1 font-mono font-semibold text-2xl">
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
					<Card>
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
					<Card>
						<div className="flex flex-col gap-2">
							{data.commentBank.map((c) => (
								<button
									type="button"
									key={c.id}
									onClick={() => appendComment(c.text)}
									className="neu-sm rounded-md px-3 py-2 text-left text-muted-foreground text-xs leading-[1.4] transition-colors duration-150 hover:text-primary"
								>
									<span className="mb-0.5 block font-medium text-primary text-xs">
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
