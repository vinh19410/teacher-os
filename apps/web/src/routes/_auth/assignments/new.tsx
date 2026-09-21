import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useMemo, useState } from "react";
import {
	compositionDefaults,
	type QuestionItem,
	skillOf,
} from "@/components/assignments/assignment-presets";
import { CreateSuccessCard } from "@/components/assignments/create-success-card";
import {
	type ComposerValue,
	PromptComposer,
} from "@/components/assignments/prompt-composer";
import { StudentPreviewPaper } from "@/components/assignments/student-preview-paper";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import {
	savePreviewDraft,
	takePreviewDraft,
} from "@/lib/assignment-preview-draft";
import { useData } from "@/lib/data-store";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

export const Route = createFileRoute("/_auth/assignments/new")({
	component: NewAssignmentRoute,
});

interface SavedPrompt {
	title: string;
	status: "draft" | "ready";
	skill: string;
	part: string;
	type: string;
	band: string;
	source: string;
	audioName: string;
	questions: QuestionItem[];
}
function freshComposer(): ComposerValue {
	const defaults = compositionDefaults(
		"writing",
		"task2",
		"discuss",
		false,
		false,
	);
	return {
		skill: "writing",
		part: "task2",
		type: "discuss",
		title: defaults.title,
		band: "7.0",
		source: defaults.source,
		prompt: defaults.prompt,
		passage: defaults.passage,
		intro: defaults.intro,
		transcript: defaults.transcript,
		cueTopic: defaults.cueTopic,
		cuePoints: defaults.cuePoints,
		audioName: "",
		note: "",
		items: defaults.items,
	};
}
function countAnswers(value: ComposerValue) {
	return value.items.filter((item) => item.answer.trim()).length;
}
function hasCoreContent(value: ComposerValue) {
	if (!value.title.trim()) return false;
	if (value.skill === "writing") return !!value.prompt.trim();
	if (value.skill === "reading")
		return (
			!!value.passage.trim() && value.items.some((item) => item.stem.trim())
		);
	if (value.skill === "listening")
		return value.items.some((item) => item.stem.trim());
	return value.part === "part2"
		? !!value.cueTopic.trim()
		: !!value.prompt.trim();
}
export function actionCopyFor(value: ComposerValue, status: "draft" | "ready") {
	const auto = value.skill === "reading" || value.skill === "listening";
	if (!value.title.trim())
		return {
			title: "Đặt tên đề rồi lưu vào ngân hàng.",
			sub: "Chưa giao lớp.",
		};
	if (
		value.skill === "listening" &&
		status === "ready" &&
		!value.audioName.trim()
	)
		return {
			title: "Thiếu file nghe",
			sub: "Đính file hoặc dùng file mẫu trước khi lưu sẵn sàng giao.",
		};
	if (auto && status === "ready" && countAnswers(value) !== value.items.length)
		return {
			title: "Thiếu đáp án chấm tự động",
			sub: "Khóa đáp án đúng cho mọi câu trước khi lưu sẵn sàng giao.",
		};
	if (!hasCoreContent(value))
		return {
			title: "Thiếu nội dung đề",
			sub: "Soạn xong rồi lưu vào ngân hàng. Chưa giao lớp.",
		};
	if (status === "draft")
		return {
			title: "Lưu bản nháp",
			sub:
				auto && countAnswers(value) !== value.items.length
					? "Bản nháp chưa đủ đáp án — chưa chấm tự động được."
					: "Bản nháp chưa hiện khi giao từ trang Lớp học.",
		};
	return {
		title: "Sẵn sàng lưu vào ngân hàng",
		sub: auto
			? `${countAnswers(value)}/${value.items.length} đáp án đã khóa. Chưa giao lớp.`
			: "Chưa giao lớp. Giao sau ở trang Lớp học.",
	};
}

export function NewAssignmentRoute() {
	const navigate = useNavigate();
	const submit = useKernelFormSubmit();
	const { data } = useData();
	const [restored] = useState(() => takePreviewDraft());
	const [value, setValue] = useState<ComposerValue>(() =>
		restored
			? {
					...freshComposer(),
					...restored,
					skill: restored.skill ?? "writing",
					part: restored.part ?? restored.task,
					type: restored.type ?? restored.genre,
					passage: restored.passage ?? "",
					intro: restored.intro ?? "",
					transcript: restored.transcript ?? "",
					cueTopic: restored.cueTopic ?? "",
					cuePoints: restored.cuePoints ?? "",
					audioName: restored.audioName ?? "",
					items: restored.items ?? [],
				}
			: freshComposer(),
	);
	const [status, setStatus] = useState<"draft" | "ready">(
		restored?.status ?? "ready",
	);
	const [dirtyTitle, setDirtyTitle] = useState(!!restored);
	const [dirtyMain, setDirtyMain] = useState(!!restored);
	const [showErrors, setShowErrors] = useState(false);
	const [saved, setSaved] = useState<SavedPrompt | null>(null);
	const fieldErrors: Record<string, string | undefined> = {};
	if (!value.title.trim()) fieldErrors.title = "Nhập tiêu đề bài tập.";
	if (value.skill === "writing" && !value.prompt.trim())
		fieldErrors.prompt = "Dán hoặc soạn đề trước khi lưu.";
	if (value.skill === "reading" && !value.passage.trim())
		fieldErrors.passage = "Nhập đoạn đọc.";
	if (
		value.skill === "listening" &&
		status === "ready" &&
		!value.audioName.trim()
	)
		fieldErrors.audioName = "Đính file nghe hoặc dùng file mẫu.";
	if (
		value.skill === "speaking" &&
		value.part === "part2" &&
		!value.cueTopic.trim()
	)
		fieldErrors.cueTopic = "Nhập chủ đề cue card.";
	const canSave =
		hasCoreContent(value) &&
		!(
			value.skill === "listening" &&
			status === "ready" &&
			!value.audioName.trim()
		) &&
		!(
			(value.skill === "reading" || value.skill === "listening") &&
			status === "ready" &&
			countAnswers(value) !== value.items.length
		);
	const actionCopy = actionCopyFor(value, status);
	const prompts = useMemo(
		() =>
			data.assignmentPrompts
				.filter((prompt) => prompt.skill === value.skill)
				.slice(-5)
				.reverse(),
		[data.assignmentPrompts, value.skill],
	);
	function handleFieldChange(patch: Partial<ComposerValue>) {
		if (patch.title !== undefined) setDirtyTitle(true);
		if (
			[
				"prompt",
				"passage",
				"intro",
				"transcript",
				"cueTopic",
				"cuePoints",
				"items",
			].some((key) => key in patch)
		)
			setDirtyMain(true);
		setValue((current) => {
			const merged = { ...current, ...patch };
			if (patch.skill !== undefined) {
				const skill = skillOf(merged.skill);
				const part = skill.parts[0];
				const type = part.types[0];
				const defaults = compositionDefaults(
					skill.id,
					part.id,
					type.id,
					false,
					false,
				);
				return {
					...merged,
					skill: skill.id,
					part: part.id,
					type: type.id,
					title: defaults.title,
					source: defaults.source,
					prompt: defaults.prompt,
					passage: defaults.passage,
					intro: defaults.intro,
					transcript: defaults.transcript,
					cueTopic: defaults.cueTopic,
					cuePoints: defaults.cuePoints,
					items: defaults.items,
					audioName: "",
					note: "",
				};
			}
			if (patch.part !== undefined || patch.type !== undefined) {
				const defaults = compositionDefaults(
					merged.skill,
					merged.part,
					merged.type,
					dirtyTitle || patch.title !== undefined,
					dirtyMain || patch.prompt !== undefined || patch.items !== undefined,
				);
				return {
					...merged,
					title: defaults.title || merged.title,
					source: defaults.source,
					prompt: defaults.prompt || merged.prompt,
					passage: defaults.passage || merged.passage,
					intro: defaults.intro,
					transcript: defaults.transcript,
					cueTopic: defaults.cueTopic,
					cuePoints: defaults.cuePoints,
					items: defaults.items.length ? defaults.items : merged.items,
				};
			}
			return merged;
		});
	}
	function resetAll() {
		setValue(freshComposer());
		setStatus("ready");
		setDirtyTitle(false);
		setDirtyMain(false);
		setShowErrors(false);
		setSaved(null);
		submit.reset();
	}
	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		setShowErrors(true);
		if (!canSave) return;
		const result = await submit.run({
			type: "create-assignment-prompt",
			payload: {
				skill: value.skill as "writing" | "reading" | "listening" | "speaking",
				part: value.part,
				type: value.type,
				title: value.title.trim(),
				band: value.band as "6.0" | "6.5" | "7.0" | "7.5",
				source: value.source.trim(),
				prompt: value.prompt.trim(),
				passage: value.passage.trim(),
				intro: value.intro,
				transcript: value.transcript,
				cueTopic: value.cueTopic.trim(),
				cuePoints: value.cuePoints,
				audioName: value.audioName.trim(),
				questions: value.items,
				note: value.note.trim(),
				status,
			},
		});
		if (result?.kind === "refreshed")
			setSaved({
				title: value.title.trim(),
				status,
				skill: value.skill,
				part: value.part,
				type: value.type,
				band: value.band,
				source: value.source,
				audioName: value.audioName,
				questions: value.items,
			});
	}
	async function handleReconcile() {
		const applied = await submit.reconcile();
		if (!applied) return;
		const row = data.assignmentPrompts.find(
			(prompt) =>
				prompt.title === value.title.trim() && prompt.skill === value.skill,
		);
		if (!row) {
			submit.setError(
				"Đã tải lại dữ liệu nhưng chưa xác nhận được đề mới trong ngân hàng.",
			);
			return;
		}
		setSaved({
			title: row.title,
			status: row.status,
			skill: row.skill ?? "writing",
			part: row.part ?? row.task,
			type: row.type ?? row.genre,
			band: row.band,
			source: row.source,
			audioName: row.audioName ?? "",
			questions: row.questions ?? [],
		});
	}
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
				<Link
					to="/assignments/bank"
					className="underline-offset-[3px] hover:text-fg hover:underline"
				>
					Ngân hàng
				</Link>
				<span aria-hidden="true">›</span>
				<span>Tạo mới</span>
			</nav>
			<PageHead
				title="Thêm đề vào ngân hàng"
				lead="Soạn đề Writing, Reading, Listening hoặc Speaking theo phần thi IELTS. Reading và Listening khóa đáp án để chấm tự động. Đề lưu ngân hàng; giao lớp ở trang Lớp học."
			/>
			{saved ? (
				<CreateSuccessCard {...saved} onCreateAnother={resetAll} />
			) : (
				<div className="grid gap-5 lg:grid-cols-[1.45fr_0.9fr]">
					<form onSubmit={handleSubmit} noValidate>
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
									<span className="text-muted-fg text-xs">
										{actionCopy.sub}
									</span>
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
											savePreviewDraft({
												task: value.part,
												genre: value.type,
												skill: value.skill,
												part: value.part,
												type: value.type,
												title: value.title,
												band: value.band,
												source: value.source,
												prompt: value.prompt,
												passage: value.passage,
												intro: value.intro,
												cueTopic: value.cueTopic,
												cuePoints: value.cuePoints,
												audioName: value.audioName,
												items: value.items,
												note: value.note,
												status,
											});
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
									<Button type="submit" disabled={!canSave || submit.saving}>
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
					<div className="flex flex-col gap-5">
						<Card variant="white" className="flex flex-col gap-3">
							<h2 className="font-display font-semibold text-[17px]">
								Ngân hàng
							</h2>
							<p className="text-muted-fg text-xs">
								Đề này chỉ được thêm vào ngân hàng bài tập. Giao cho lớp và học
								viên ở trang Lớp học.
							</p>
							<strong>Đề {skillOf(value.skill).name} đã có</strong>
							{prompts.length ? (
								prompts.map((prompt) => (
									<div
										key={prompt.id}
										className="border-line border-t pt-2 text-sm"
									>
										<div>{prompt.title}</div>
										<span className="text-meta text-xs">
											{prompt.source || "Không ghi nguồn"} ·{" "}
											{prompt.status === "ready" ? "Sẵn sàng" : "Bản nháp"}
										</span>
									</div>
								))
							) : (
								<p className="text-muted-fg text-xs">
									Chưa có đề {skillOf(value.skill).name} trong ngân hàng.
								</p>
							)}
							{(value.skill === "reading" || value.skill === "listening") && (
								<p className="rounded-md bg-bg p-2 text-xs">
									{countAnswers(value)}/{value.items.length} đáp án đã khóa.
									Preview bên dưới không hiện đáp án.
								</p>
							)}
						</Card>
						<StudentPreviewPaper {...value} status={status} />
					</div>
				</div>
			)}
		</div>
	);
}
