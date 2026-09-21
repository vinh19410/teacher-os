import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
	compositionDefaults,
	genreOf,
} from "@/components/assignments/assignment-presets";
import { CreateSuccessCard } from "@/components/assignments/create-success-card";
import { PromptComposer } from "@/components/assignments/prompt-composer";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import {
	type PreviewDraft,
	savePreviewDraft,
	takePreviewDraft,
} from "@/lib/assignment-preview-draft";
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

export function NewAssignmentRoute() {
	const navigate = useNavigate();
	const submit = useKernelFormSubmit();

	// Restored once per mount (app has no StrictMode double-invoke). The
	// dirty flags start true so compositionDefaults never overwrites the
	// restored title/prompt when the teacher switches task/genre (#213).
	const [restored] = useState<PreviewDraft | null>(() => takePreviewDraft());
	const [value, setValue] = useState<ComposerState>(() =>
		restored
			? {
					task: restored.task,
					genre: restored.genre,
					title: restored.title,
					band: restored.band,
					source: restored.source,
					prompt: restored.prompt,
					note: restored.note,
				}
			: freshComposer(),
	);
	const [status, setStatus] = useState<"draft" | "ready">(
		restored?.status ?? "ready",
	);
	const [dirtyTitle, setDirtyTitle] = useState(!!restored);
	const [dirtyPrompt, setDirtyPrompt] = useState(!!restored);
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
				<form onSubmit={handleSubmit} noValidate className="max-w-3xl">
					<PromptComposer
						value={value}
						errors={fieldErrors}
						showErrors={showErrors}
						onFieldChange={handleFieldChange}
					/>

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
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-fg text-xs">
									Trạng thái
								</span>
								<ChipFilter
									options={["Bản nháp", "Sẵn sàng giao"]}
									value={status === "draft" ? "Bản nháp" : "Sẵn sàng giao"}
									onChange={(label) =>
										setStatus(label === "Bản nháp" ? "draft" : "ready")
									}
								/>
							</div>
							<div className="flex gap-2">
								<Button
									type="button"
									variant="secondary"
									onClick={() => {
										savePreviewDraft({ ...value, status });
										navigate({ to: "/assignments/preview" });
									}}
								>
									Xem trước
								</Button>
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
