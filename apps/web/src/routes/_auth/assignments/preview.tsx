import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { wordCount } from "@/components/assignments/assignment-presets";
import { PreviewQuizSimulation } from "@/components/assignments/preview-quiz-simulation";
import { StudentPreviewPaper } from "@/components/assignments/student-preview-paper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { PageHead } from "@/components/ui/page-head";
import { Tabs } from "@/components/ui/tabs";
import {
	type PreviewDraft,
	readPreviewDraft,
} from "@/lib/assignment-preview-draft";
import { buildQuizSim } from "@/lib/assignment-quiz-sim";
import { useData } from "@/lib/data-store";
import type { AssignmentPrompt } from "@/lib/mock-data";
import { useQuizSimulation } from "@/lib/use-quiz-simulation";

export const Route = createFileRoute("/_auth/assignments/preview")({
	validateSearch: (search: Record<string, unknown>): { id?: string } => ({
		id: typeof search.id === "string" ? search.id : undefined,
	}),
	component: PreviewAssignmentRoute,
});

/** Bank mode (?id=) — map a saved prompt onto the preview draft shape.
 * Field-for-field; `questions` doubles as `QuestionItem`
 * (assignment-presets aliases the contract type). */
function previewDraftFromPrompt(p: AssignmentPrompt): PreviewDraft {
	return {
		task: p.task,
		genre: p.genre,
		title: p.title,
		band: p.band,
		source: p.source,
		prompt: p.prompt,
		note: p.note ?? "",
		status: p.status,
		skill: p.skill,
		part: p.part,
		type: p.type,
		passage: p.passage,
		intro: p.intro,
		transcript: p.transcript,
		cueTopic: p.cueTopic,
		cuePoints: p.cuePoints,
		audioName: p.audioName,
		imageUrl: p.imageUrl,
		optionBank: p.optionBank,
		items: p.questions,
	};
}

export function PreviewAssignmentRoute() {
	const navigate = useNavigate();
	const { id } = Route.useSearch();
	const { data } = useData();
	// Bank mode (?id=) resolves a saved prompt from the snapshot; an explicit
	// id must win over a stale composer draft still in sessionStorage.
	const bankPrompt = id
		? (data.assignmentPrompts.find((p) => p.id === id) ?? null)
		: null;
	// Read without clearing: reloading the preview keeps working; the create
	// page consumes (takes) the snapshot on its own mount.
	const [storageDraft] = useState(() => readPreviewDraft());
	const draft = bankPrompt ? previewDraftFromPrompt(bankPrompt) : storageDraft;
	const [answer, setAnswer] = useState("");
	// Simulation chỉ tồn tại với đề auto-graded (reading/listening) có items —
	// resolver/gating khớp khối isAuto của StudentPreviewPaper. simKey là
	// fingerprint NỘI DUNG (mặc định của buildQuizSim) cho cả bank lẫn draft:
	// draft map tạo object mới mỗi render nên không dùng object identity, và
	// đề bank bị sửa ở nơi khác rồi kernel refresh về cùng ?id vẫn phải reset
	// simulation cũ. useQuizSimulation reset bài làm khi key đổi
	// (search-only navigation ?id=A → ?id=B không remount route).
	const sim = draft ? buildQuizSim(draft) : null;
	const [tab, setTab] = useState<"paper" | "sim">("paper");
	const quiz = useQuizSimulation(sim);

	if (id && !bankPrompt) {
		return (
			<div>
				<PageHead
					title="Xem trước bài tập"
					lead="Trang này mô phỏng đề bài đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."
				/>
				<Card variant="white" className="mx-auto max-w-xl p-8 text-center">
					<h2 className="font-display font-semibold text-lg">
						Không tìm thấy đề này.
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Đề có thể đã bị xóa khỏi ngân hàng. Quay lại danh sách để chọn đề
						khác.
					</p>
					<div className="mt-6 flex justify-center">
						<Button
							variant="secondary"
							onClick={() => navigate({ to: "/assignments" })}
						>
							Quay lại danh sách
						</Button>
					</div>
				</Card>
			</div>
		);
	}

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
				{!bankPrompt && (
					<>
						<span aria-hidden="true">›</span>
						<button
							type="button"
							onClick={() => navigate({ to: "/assignments/new" })}
							className="underline-offset-[3px] hover:text-fg hover:underline"
						>
							Tạo mới
						</button>
					</>
				)}
				<span aria-hidden="true">›</span>
				<span>Xem trước</span>
			</nav>
			<div className="flex flex-wrap items-center justify-between gap-3">
				<PageHead
					title="Xem trước bài tập"
					lead={
						sim
							? "Xem trước đề bài đúng như học viên sẽ đọc, hoặc làm thử rồi soi bài như học viên. Bài làm ở đây không được lưu."
							: "Trang này mô phỏng đề bài đúng như học viên sẽ đọc khi làm. Bài làm ở đây không được lưu."
					}
				/>
				{bankPrompt ? (
					<Button
						variant="secondary"
						onClick={() => navigate({ to: "/assignments" })}
					>
						Quay lại danh sách
					</Button>
				) : (
					<Button
						variant="secondary"
						onClick={() => navigate({ to: "/assignments/new" })}
					>
						Quay lại soạn đề
					</Button>
				)}
			</div>

			<div className="mt-5 flex flex-col gap-5">
				{sim && (
					<Tabs
						tabs={[
							{ id: "paper", label: "Đề bài" },
							{ id: "sim", label: "Làm thử & Soi bài" },
						]}
						active={tab}
						onChange={(id) => setTab(id === "sim" ? "sim" : "paper")}
					/>
				)}

				{sim && tab === "sim" ? (
					<PreviewQuizSimulation
						sim={sim}
						answers={quiz.answers}
						grade={quiz.grade}
						onAnswer={quiz.onAnswer}
						onSubmit={quiz.submit}
						onReset={quiz.reset}
					/>
				) : (
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
				)}

				{!sim && (
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
				)}
			</div>
		</div>
	);
}
