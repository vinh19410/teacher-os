import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	compositionDefaults,
	genreOf,
} from "@/components/assignments/assignment-presets";
import { BankContextCard } from "@/components/assignments/bank-context-card";
import { CreateSuccessCard } from "@/components/assignments/create-success-card";
import { PromptComposer } from "@/components/assignments/prompt-composer";
import { StudentPreviewPaper } from "@/components/assignments/student-preview-paper";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

export const Route = createFileRoute("/_auth/assignments/new")({
	component: NewAssignmentRoute,
});

interface ComposerState {
	task: string;
	genre: string;
	title: string;
	band: string;
	source: string;
	prompt: string;
	note: string;
}

interface SavedPrompt {
	title: string;
	status: "draft" | "ready";
	task: string;
	genre: string;
	band: string;
	source: string;
}

function freshComposer(): ComposerState {
	const genre = genreOf("task2", "discuss");
	return {
		task: "task2",
		genre: genre.id,
		title: genre.title,
		band: "7.0",
		source: "",
		prompt: genre.prompt,
		note: "",
	};
}

function NewAssignmentRoute() {
	const _navigate = useNavigate();
	const { data } = useData();
	const submit = useKernelFormSubmit();

	const [value, setValue] = useState<ComposerState>(freshComposer);
	const [status, setStatus] = useState<"draft" | "ready">("ready");
	const [dirtyTitle, setDirtyTitle] = useState(false);
	const [dirtyPrompt, setDirtyPrompt] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [saved, setSaved] = useState<SavedPrompt | null>(null);

	const titleOk = !!value.title.trim();
	const promptOk = !!value.prompt.trim();
	const readyToSave = titleOk && promptOk;

	const fieldErrors: { title?: string; prompt?: string } = {};
	if (!titleOk) fieldErrors.title = "Nhập tiêu đề bài tập.";
	if (!promptOk) fieldErrors.prompt = "Dán hoặc soạn đề trước khi lưu.";

	function handleFieldChange(patch: Partial<ComposerState>) {
		if (patch.title !== undefined) setDirtyTitle(true);
		if (patch.prompt !== undefined) setDirtyPrompt(true);
		setValue((current) => {
			const merged = { ...current, ...patch };
			// Task/genre switches re-apply the preset defaults for any field
			// the teacher has not edited (design's applyGenreDefaults).
			if (patch.task !== undefined || patch.genre !== undefined) {
				const defaults = compositionDefaults(
					merged.task,
					merged.genre,
					dirtyTitle || patch.title !== undefined,
					dirtyPrompt || patch.prompt !== undefined,
				);
				if (defaults.title) merged.title = defaults.title;
				if (defaults.prompt) merged.prompt = defaults.prompt;
			}
			return merged;
		});
	}

	function resetAll() {
		setValue(freshComposer());
		setStatus("ready");
		setDirtyTitle(false);
		setDirtyPrompt(false);
		setShowErrors(false);
		setSaved(null);
		submit.reset();
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		setShowErrors(true);
		if (!readyToSave) return;
		const result = await submit.run({
			type: "create-assignment-prompt",
			payload: {
				task: value.task as "task1" | "task2",
				genre: value.genre,
				title: value.title.trim(),
				band: value.band as "6.0" | "6.5" | "7.0" | "7.5",
				source: value.source.trim(),
				prompt: value.prompt.trim(),
				note: value.note.trim(),
				status,
			},
		});
		if (result?.kind === "refreshed") {
			setSaved({
				title: value.title.trim(),
				status,
				task: value.task,
				genre: value.genre,
				band: value.band,
				source: value.source,
			});
		}
	}

	async function handleReconcile() {
		const applied = await submit.reconcile();
		if (applied) {
			setSaved({
				title: value.title.trim(),
				status,
				task: value.task,
				genre: value.genre,
				band: value.band,
				source: value.source,
			});
		}
	}

	const actionCopy = !readyToSave
		? {
				title: "Thiếu tiêu đề hoặc đề bài",
				sub: "Soạn xong rồi lưu vào ngân hàng. Chưa giao lớp.",
			}
		: status === "draft"
			? {
					title: "Lưu bản nháp",
					sub: "Bản nháp chưa hiện khi giao từ trang Lớp học.",
				}
			: {
					title: "Sẵn sàng lưu vào ngân hàng",
					sub: "Chưa giao lớp. Giao sau ở trang Lớp học.",
				};

	return (
		<div>
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
				<span>Tạo mới</span>
			</nav>
			<PageHead
				title="Thêm đề vào ngân hàng"
				lead="Soạn đề Writing Task 1 hoặc Task 2. Đề lưu trong ngân hàng; giao cho lớp ở trang Lớp học."
			/>

			{saved ? (
				<CreateSuccessCard
					title={saved.title}
					status={saved.status}
					task={saved.task}
					genre={saved.genre}
					band={saved.band}
					source={saved.source}
					onCreateAnother={resetAll}
				/>
			) : (
				<form onSubmit={handleSubmit} noValidate>
					<div className="grid items-start gap-5 lg:grid-cols-[1.45fr_0.9fr]">
						<PromptComposer
							value={value}
							errors={fieldErrors}
							showErrors={showErrors}
							onFieldChange={handleFieldChange}
						/>
						<div className="flex flex-col gap-5">
							<BankContextCard
								status={status}
								onStatusChange={setStatus}
								prompts={data.assignmentPrompts}
							/>
							<StudentPreviewPaper
								task={value.task}
								genre={value.genre}
								title={value.title}
								band={value.band}
								source={value.source}
								prompt={value.prompt}
								note={value.note}
								status={status}
							/>
						</div>
					</div>

					<div className="sticky bottom-0 mt-5 border-line border-t bg-bg/90 py-3 backdrop-blur">
						{submit.notice && (
							<KernelSubmitNotice
								notice={submit.notice}
								onReconcile={handleReconcile}
								disabled={submit.saving}
							/>
						)}
						{submit.error && (
							<p role="alert" className="mb-2 text-danger text-xs">
								{submit.error}
							</p>
						)}
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex flex-col">
								<strong className="text-sm">{actionCopy.title}</strong>
								<span className="text-muted-fg text-xs">{actionCopy.sub}</span>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="secondary"
									onClick={resetAll}
									disabled={submit.saving}
								>
									Hủy
								</Button>
								<Button type="submit" disabled={!readyToSave || submit.saving}>
									{submit.saving
										? "Đang lưu…"
										: status === "draft"
											? "Lưu bản nháp"
											: "Lưu vào ngân hàng"}
								</Button>
							</div>
						</div>
					</div>
				</form>
			)}
		</div>
	);
}
