import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { isAssignmentImageUrl } from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { type FormEvent, useEffect, useState } from "react";
import {
	emptyComposer,
	isAutoSkill,
	isImageBased,
	type QuestionItem,
} from "@/components/assignments/assignment-presets";
import {
	applyComposerFieldChange,
	clozeStemIssue,
	hasAuthoringContent,
	hasPrimaryAuthoringContent,
	imagePinIssue,
	optionBankIssue,
	structuralChangeKind,
} from "@/components/assignments/composer-transitions";
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
	ASSIGNMENT_DRAFT_SCHEMA_VERSION,
	clearAssignmentDraft,
	composerDraftHasContent,
	readAssignmentDraft,
	type StoredAssignmentDraft,
	saveAssignmentDraft,
} from "@/lib/assignment-draft-store";
import {
	type PreviewDraft,
	savePreviewDraft,
	takePreviewDraft,
} from "@/lib/assignment-preview-draft";
import { useData } from "@/lib/data-store";
import {
	normalizeDraftItems,
	normalizeLegacyRichText,
} from "@/lib/rich-text-legacy";
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
		writing: null,
	};
}
function countAnswers(value: ComposerValue) {
	return value.items.filter((item) => item.answer.trim()).length;
}
function hasCoreContent(value: ComposerValue) {
	if (!value.title.trim()) return false;
	if (value.skill === "writing") return !isEmptyRichText(value.prompt);
	if (
		isAutoSkill(value.skill) &&
		value.writing != null &&
		isEmptyRichText(value.writing.prompt)
	)
		return false;
	if (value.skill === "reading")
		return (
			!isEmptyRichText(value.passage) &&
			value.items.some((item) => item.stem.trim())
		);
	if (
		value.skill === "listening" ||
		value.skill === "grammar" ||
		value.skill === "vocabulary"
	)
		return value.items.some((item) => item.stem.trim().length > 0);
	return value.part === "part2"
		? !!value.cueTopic.trim()
		: !isEmptyRichText(value.prompt);
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
	// Phase-04 FR2 mirror: image-based pairs (reading diagram + listening map,
	// skill-qualified) gate ready on the image AND per-question pins.
	const pinIssue = imagePinIssue(value, status);
	if (pinIssue)
		return {
			title: "Thiếu ảnh hoặc ghim nhãn",
			sub: pinIssue,
		};
	// Phase-02 FR2/FR3 mirror: the option-bank rules surface as one message —
	// the same text the bank panel and the save gate show.
	const bankIssue = optionBankIssue(value, status);
	if (bankIssue)
		return {
			title: "Ngân hàng lựa chọn chưa đạt",
			sub: bankIssue,
		};
	// Phase-03 FR7 mirror: marker count + caps block with the row message.
	const stemIssue = clozeStemIssue(value, status);
	if (stemIssue)
		return {
			title: "Câu hỏi chưa hợp lệ",
			sub: stemIssue,
		};
	if (auto && status === "ready" && countAnswers(value) !== value.items.length)
		return {
			title: "Thiếu đáp án chấm tự động",
			sub: "Khóa đáp án đúng cho mọi câu trước khi lưu sẵn sàng giao.",
		};
	if (auto && value.writing != null && isEmptyRichText(value.writing.prompt))
		return {
			title: "Thiếu đề phần Writing",
			sub: "Nhập nội dung đề cho phần Writing đi kèm hoặc bỏ phần Writing.",
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

/** Snapshot for the preview page (sessionStorage handoff). Includes
 * `transcript` — the preview round trip must never drop it (phase-01 FR6) —
 * and `optionBank` (phase-02 FR7, same rule). */
export function previewDraftFrom(
	value: ComposerValue,
	status: "draft" | "ready",
): PreviewDraft {
	return {
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
		transcript: value.transcript,
		cueTopic: value.cueTopic,
		cuePoints: value.cuePoints,
		audioName: value.audioName,
		imageUrl: value.imageUrl,
		optionBank: value.optionBank,
		items: value.items,
		note: value.note,
		status,
		writing: value.writing ?? null,
	};
}

const STRUCTURAL_LABELS = {
	skill: "kỹ năng",
	part: "phần thi",
	type: "dạng đề",
} as const;

export function NewAssignmentRoute() {
	const navigate = useNavigate();
	const submit = useKernelFormSubmit();
	const { data } = useData();
	// Restore precedence (FR6): the destructive preview-draft take wins over
	// the autosave banner — the teacher deliberately handed off to /preview.
	const [restored] = useState(() => takePreviewDraft());
	const [bannerDraft] = useState<StoredAssignmentDraft | null>(() =>
		restored ? null : readAssignmentDraft(),
	);
	// Legacy adapter (plan decision 9): stored values may be plain text with
	// \n — loading them raw into the editor would collapse the newlines and
	// destroy them on the next save. normalizeLegacyRichText escapes and
	// converts to <br> only when the string has no markup yet.
	const restoreRich = (text: string | undefined) =>
		normalizeLegacyRichText(text ?? "");
	const [value, setValue] = useState<ComposerValue>(() =>
		restored
			? {
					...freshComposer(),
					...restored,
					skill: restored.skill ?? "writing",
					part: restored.part ?? restored.task,
					type: restored.type ?? restored.genre,
					prompt: restoreRich(restored.prompt),
					passage: restoreRich(restored.passage),
					intro: restoreRich(restored.intro),
					transcript: restoreRich(restored.transcript),
					note: restoreRich(restored.note),
					cueTopic: restored.cueTopic ?? "",
					cuePoints: restored.cuePoints ?? "",
					audioName: restored.audioName ?? "",
					imageUrl: restored.imageUrl ?? "",
					optionBank: restored.optionBank ?? [],
					items: normalizeDraftItems(restored.items ?? []),
					writing: restored.writing
						? {
								...restored.writing,
								prompt: restoreRich(restored.writing.prompt),
							}
						: null,
				}
			: bannerDraft
				? {
						...freshComposer(),
						...bannerDraft.value,
						prompt: restoreRich(bannerDraft.value.prompt),
						passage: restoreRich(bannerDraft.value.passage),
						intro: restoreRich(bannerDraft.value.intro),
						transcript: restoreRich(bannerDraft.value.transcript),
						note: restoreRich(bannerDraft.value.note),
						writing: bannerDraft.value.writing
							? {
									...bannerDraft.value.writing,
									prompt: restoreRich(bannerDraft.value.writing.prompt),
								}
							: null,
						items: normalizeDraftItems(bannerDraft.value.items ?? []),
					}
				: freshComposer(),
	);
	const [status, setStatus] = useState<"draft" | "ready">(
		restored?.status ?? bannerDraft?.status ?? "ready",
	);
	const [bannerOpen, setBannerOpen] = useState(() => bannerDraft !== null);
	const [showErrors, setShowErrors] = useState(false);
	const [saved, setSaved] = useState<SavedPrompt | null>(null);
	// Debounced autosave (FR6): skip the success card (the draft was cleared
	// on purpose) and skip an untouched composer (an empty draft must never
	// resurrect the restore banner).
	useEffect(() => {
		if (saved) return;
		if (!composerDraftHasContent(value)) return;
		const timer = setTimeout(() => {
			saveAssignmentDraft({
				schemaVersion: ASSIGNMENT_DRAFT_SCHEMA_VERSION,
				savedAt: Date.now(),
				status,
				value,
			});
		}, 1000);
		return () => clearTimeout(timer);
	}, [value, status, saved]);
	const fieldErrors: Record<string, string | undefined> = {};
	if (!value.title.trim()) fieldErrors.title = "Nhập tiêu đề bài tập.";
	if (value.skill === "writing" && isEmptyRichText(value.prompt))
		fieldErrors.prompt = "Dán hoặc soạn đề trước khi lưu.";
	if (
		isAutoSkill(value.skill) &&
		value.writing != null &&
		isEmptyRichText(value.writing.prompt)
	)
		fieldErrors.writingPrompt = "Dán hoặc soạn đề phần Writing trước khi lưu.";
	if (value.skill === "reading" && isEmptyRichText(value.passage))
		fieldErrors.passage = "Nhập đoạn đọc.";
	if (
		value.skill === "listening" &&
		status === "ready" &&
		!value.audioName.trim()
	)
		fieldErrors.audioName = "Đính file nghe (MP3 hoặc WAV).";
	const trimmedImageUrl = value.imageUrl.trim();
	if (isImageBased(value.skill, value.type)) {
		if (trimmedImageUrl && !isAssignmentImageUrl(trimmedImageUrl))
			fieldErrors.imageUrl = "Chỉ nhận link ảnh https (tối đa 500 ký tự).";
		else if (status === "ready" && !trimmedImageUrl)
			fieldErrors.imageUrl = "Dán link ảnh (https) trước khi lưu.";
	}
	if (
		value.skill === "speaking" &&
		value.part === "part2" &&
		!value.cueTopic.trim()
	)
		fieldErrors.cueTopic = "Nhập chủ đề cue card.";
	// Phase-02 FR2 mirror — the bank panel shows this inline (via
	// errors.optionBank) and the save gate below mirrors the contract.
	const bankIssue = optionBankIssue(value, status);
	if (bankIssue) fieldErrors.optionBank = bankIssue;
	// Phase-03 FR7 mirror — marker count + stem/answer/alts caps block both
	// statuses (contract parse-time); shown at the key editor and the gate.
	const stemIssue = clozeStemIssue(value, status);
	if (stemIssue) fieldErrors.questions = stemIssue;
	// Phase-04 FR2 mirror — image-based pairs gate ready on image + pins.
	const pinIssue = imagePinIssue(value, status);
	if (pinIssue && !stemIssue) fieldErrors.questions = pinIssue;
	const canSave =
		hasCoreContent(value) &&
		!(
			value.skill === "listening" &&
			status === "ready" &&
			!value.audioName.trim()
		) &&
		!(
			isImageBased(value.skill, value.type) &&
			status === "ready" &&
			!value.imageUrl.trim()
		) &&
		!(
			value.skill === "reading" &&
			value.imageUrl.trim() &&
			!isAssignmentImageUrl(value.imageUrl)
		) &&
		!bankIssue &&
		!stemIssue &&
		!pinIssue &&
		!(
			isAutoSkill(value.skill) &&
			status === "ready" &&
			countAnswers(value) !== value.items.length
		);
	const actionCopy = actionCopyFor(value, status);
	function handleFieldChange(patch: Partial<ComposerValue>) {
		// Confirm decision happens HERE, outside the state updater — React
		// StrictMode double-fires updaters, so a confirm inside one would fire
		// twice (red-team #8). The updater stays pure.
		const change = structuralChangeKind(value, patch);
		const losesContent =
			change === "skill"
				? isAutoSkill(value.skill) &&
					patch.skill !== undefined &&
					isAutoSkill(patch.skill)
					? hasPrimaryAuthoringContent(value)
					: hasAuthoringContent(value)
				: change !== null && hasPrimaryAuthoringContent(value);
		if (change && losesContent) {
			// title); a part/type change only wipes the type-specific fields.
			const message =
				change === "skill"
					? "Đổi kỹ năng sẽ xóa toàn bộ nội dung đã soạn của đề hiện tại. Tiếp tục?"
					: `Đổi ${STRUCTURAL_LABELS[change]} sẽ xóa câu hỏi, đáp án và câu lệnh đã soạn của dạng hiện tại. Tiếp tục?`;
			const ok = window.confirm(message);
			if (!ok) return;
		}
		setValue((current) => applyComposerFieldChange(current, patch));
	}
	function acceptDraftBanner() {
		// The restored content is now the live form state — drop the stored
		// copy so the next mount never resurrects the banner.
		clearAssignmentDraft();
		setBannerOpen(false);
	}
	function discardDraftBanner() {
		clearAssignmentDraft();
		setBannerOpen(false);
		setValue(freshComposer());
		setStatus("ready");
	}
	function resetAll() {
		clearAssignmentDraft();
		setBannerOpen(false);
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
				skill: value.skill as
					| "writing"
					| "reading"
					| "listening"
					| "speaking"
					| "grammar"
					| "vocabulary",
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
				optionBank: value.optionBank,
				note: value.note.trim(),
				status,
				...(value.writing
					? {
							writing: {
								part: value.writing.part,
								type: value.writing.type,
								prompt: value.writing.prompt.trim(),
							},
						}
					: {}),
			},
		});
		// The write may be saved on refreshed/committed and may-or-may-not on
		// outcome-unknown — the draft must not resurrect in any of those. A
		// definite-failure (4xx) provably did NOT save: keep the draft.
		if (
			result?.kind === "refreshed" ||
			result?.kind === "committed" ||
			result?.kind === "outcome-unknown"
		)
			clearAssignmentDraft();
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
		clearAssignmentDraft();
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
				className="mb-3 flex items-center gap-2 text-muted-foreground text-xs"
			>
				<Link
					to="/assignments"
					className="underline-offset-[3px] transition-colors hover:text-primary hover:underline"
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
			{bannerOpen && !saved && (
				<div
					role="status"
					className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md rounded-md bg-muted px-3 py-2"
				>
					<span className="text-xs">
						Đã phục hồi bản nháp — kiểm tra rồi tiếp tục, hoặc Hủy để soạn mới.
					</span>
					<span className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={discardDraftBanner}
						>
							Hủy
						</Button>
						<Button type="button" size="sm" onClick={acceptDraftBanner}>
							Tiếp tục
						</Button>
					</span>
				</div>
			)}
			{saved ? (
				<CreateSuccessCard {...saved} onCreateAnother={resetAll} />
			) : (
				<form onSubmit={handleSubmit} noValidate>
					<PromptComposer
						value={value}
						errors={fieldErrors}
						showErrors={showErrors}
						status={status}
						onFieldChange={handleFieldChange}
					/>
					<div className="sticky bottom-0 mt-5 border-border border-t bg-background/90 py-3 backdrop-blur">
						{submit.notice && (
							<KernelSubmitNotice
								notice={submit.notice}
								onReconcile={handleReconcile}
								disabled={submit.saving}
								className="mb-2"
							/>
						)}
						{submit.error && (
							<p role="alert" className="mb-2 text-destructive text-xs">
								{submit.error}
							</p>
						)}
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex flex-col">
								<strong className="text-sm">{actionCopy.title}</strong>
								<span className="text-muted-foreground text-xs">
									{actionCopy.sub}
								</span>
							</div>
							<div className="flex flex-col gap-1.5">
								<span className="text-muted-foreground text-xs">
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
										savePreviewDraft(previewDraftFrom(value, status));
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
