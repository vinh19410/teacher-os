import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { isAssignmentImageUrl } from "@teacher-os/api/contracts";
import { type FormEvent, useState } from "react";
import {
	emptyComposer,
	emptyItem,
	isAutoSkill,
	type QuestionItem,
} from "@/components/assignments/assignment-presets";
import { CreateSuccessCard } from "@/components/assignments/create-success-card";
import {
	type ComposerValue,
	PromptComposer,
} from "@/components/assignments/prompt-composer";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
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
	return {
		skill: "writing",
		part: "task2",
		type: "discuss",
		band: "7.0",
		...emptyComposer("writing", "discuss"),
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
	const auto = isAutoSkill(value.skill);
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
			sub: "Đính file nghe trước khi lưu sẵn sàng giao.",
		};
	if (
		value.skill === "reading" &&
		value.imageUrl.trim() &&
		!isAssignmentImageUrl(value.imageUrl)
	)
		return {
			title: "Link ảnh chưa hợp lệ",
			sub: "Ảnh chỉ nhận link https (tối đa 500 ký tự). Sửa link trước khi lưu.",
		};
	if (
		value.skill === "reading" &&
		value.type === "diagram" &&
		status === "ready" &&
		!value.imageUrl.trim()
	)
		return {
			title: "Thiếu ảnh biểu đồ",
			sub: "Dán link ảnh https trước khi lưu sẵn sàng giao.",
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
					imageUrl: restored.imageUrl ?? "",
					items: restored.items ?? [],
				}
			: freshComposer(),
	);
	const [status, setStatus] = useState<"draft" | "ready">(
		restored?.status ?? "ready",
	);
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
		fieldErrors.audioName = "Đính file nghe (MP3 hoặc WAV).";
	const trimmedImageUrl = value.imageUrl.trim();
	if (value.skill === "reading") {
		if (trimmedImageUrl && !isAssignmentImageUrl(trimmedImageUrl))
			fieldErrors.imageUrl = "Chỉ nhận link ảnh https (tối đa 500 ký tự).";
		else if (value.type === "diagram" && status === "ready" && !trimmedImageUrl)
			fieldErrors.imageUrl = "Dán link ảnh biểu đồ (https) trước khi lưu.";
	}
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
			value.skill === "reading" &&
			value.type === "diagram" &&
			status === "ready" &&
			!value.imageUrl.trim()
		) &&
		!(
			value.skill === "reading" &&
			value.imageUrl.trim() &&
			!isAssignmentImageUrl(value.imageUrl)
		) &&
		!(
			isAutoSkill(value.skill) &&
			status === "ready" &&
			countAnswers(value) !== value.items.length
		);
	const actionCopy = actionCopyFor(value, status);
	function handleFieldChange(patch: Partial<ComposerValue>) {
		setValue((current) => {
			if (patch.skill !== undefined && patch.skill !== current.skill) {
				return {
					...current,
					...patch,
					...emptyComposer(patch.skill, patch.type ?? current.type),
				};
			}
			// ChipFilter re-fires onChange for the already-selected option —
			// only wipe composed content when the part/type actually changed,
			// otherwise one stray click destroys intro + URL + items (#269).
			const partChanged =
				patch.part !== undefined && patch.part !== current.part;
			const typeChanged =
				patch.type !== undefined && patch.type !== current.type;
			if (partChanged || typeChanged) {
				const merged = { ...current, ...patch };
				return {
					...merged,
					intro: "",
					transcript: "",
					cueTopic: "",
					cuePoints: "",
					// Diagram URLs belong to one prompt — never let them leak
					// into the next type (#269 red-team #5).
					imageUrl: "",
					items: isAutoSkill(merged.skill) ? [emptyItem(merged.type)] : [],
				};
			}
			return { ...current, ...patch };
		});
	}
	function resetAll() {
		setValue(freshComposer());
		setStatus("ready");
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
				imageUrl: value.imageUrl.trim(),
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
				<span>Tạo mới</span>
			</nav>
			<PageHead
				title="Thêm đề vào ngân hàng"
				lead="Soạn đề Writing, Reading, Listening hoặc Speaking theo phần thi IELTS. Reading và Listening khóa đáp án để chấm tự động. Đề lưu ngân hàng; giao lớp ở trang Lớp học."
			/>
			{saved ? (
				<CreateSuccessCard {...saved} onCreateAnother={resetAll} />
			) : (
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
											imageUrl: value.imageUrl,
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
			)}
		</div>
	);
}
