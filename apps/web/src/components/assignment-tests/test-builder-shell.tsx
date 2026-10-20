import { useNavigate } from "@tanstack/react-router";
import {
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentSkill,
	isAssignmentImageUrl,
	type KernelAssignmentTestRow,
} from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { useEffect, useMemo, useState } from "react";
import { AnswersCheckingPanel } from "@/components/assignment-tests/answers-checking-panel";
import { PromptPickerDialog } from "@/components/assignment-tests/prompt-picker-dialog";
import {
	buildTestPayload,
	emptyTestHeader,
	formatTimeLimit,
	TestHeaderForm,
	type TestHeaderFormValue,
} from "@/components/assignment-tests/test-header-form";
import { TestPartSlot } from "@/components/assignment-tests/test-part-slot";
import {
	emptyComposer,
	isAutoSkill,
	isImageBased,
	kindOf,
	partOf,
} from "@/components/assignments/assignment-presets";
import {
	applyComposerFieldChange,
	clozeStemIssue,
	hasAuthoringContent,
	imagePinIssue,
	optionBankIssue,
	structuralChangeKind,
} from "@/components/assignments/composer-transitions";
import {
	type ComposerValue,
	PromptComposer,
} from "@/components/assignments/prompt-composer";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { SectionLabel } from "@/components/ui/section-label";
import {
	ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION,
	clearAssignmentTestDraft,
	readAssignmentTestDraft,
	saveAssignmentTestDraft,
	testDraftHasContent,
} from "@/lib/assignment-test-draft-store";
import { saveTestPreviewDraft } from "@/lib/assignment-test-preview-draft";
import { useData } from "@/lib/data-store";
import type { AssignmentPrompt } from "@/lib/mock-data";
import {
	type AnswerKeyPartChange,
	collectionOptions,
	composerFromPrompt,
	groupOptions,
	partsSetPayload,
} from "@/lib/repos/assignment-tests";
import { normalizeLegacyRichText } from "@/lib/rich-text-legacy";
import { computeTestRanges } from "@/lib/test-ranges";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

/**
 * Test builder shell (phase-03 Task 3.3): outline trái + editor phải theo
 * bố cục Selfomy. Mọi slot render từ ASSIGNMENT_TEST_PRESETS[skill] —
 * KHÔNG hard-code p1/p2/p3; đánh số CHỈ từ computeTestRanges. Composer nhúng
 * luôn lockPart (skill/part của slot không đổi được mid-test).
 */
interface OpenComposer {
	part: string;
	/** null = soạn mới; id = chỉnh prompt đã gán (PATCH). */
	promptId: string | null;
	value: ComposerValue;
	status: "draft" | "ready";
}

export function TestBuilderShell({
	mode,
	test,
}: {
	mode: "create" | "edit";
	test?: KernelAssignmentTestRow;
}) {
	const navigate = useNavigate();
	const submit = useKernelFormSubmit();
	const { data } = useData();

	// Draft restore (create only): phiên soạn dở được đưa thẳng vào state,
	// banner chỉ quyết giữ hay bỏ — mirror `/assignments/new` (FR6).
	const [bannerDraft] = useState(() =>
		mode === "create" ? readAssignmentTestDraft() : null,
	);
	const [bannerOpen, setBannerOpen] = useState(() => bannerDraft !== null);
	const [header, setHeader] = useState<TestHeaderFormValue>(() => {
		if (bannerDraft)
			return {
				...emptyTestHeader(),
				title: bannerDraft.test.title,
				description: bannerDraft.test.description,
				skill: bannerDraft.test.skill,
				timeLimit:
					bannerDraft.test.timeLimitSeconds != null
						? formatTimeLimit(bannerDraft.test.timeLimitSeconds)
						: "",
				collection: bannerDraft.test.collection,
				testGroup: bannerDraft.test.testGroup,
			};
		if (mode === "edit" && test)
			return {
				title: test.title,
				description: test.description ?? "",
				skill: test.skill,
				timeLimit:
					test.timeLimitSeconds != null
						? formatTimeLimit(test.timeLimitSeconds)
						: "",
				collection: test.collection ?? "",
				testGroup: test.testGroup ?? "",
			};
		return emptyTestHeader();
	});
	const [assigned, setAssigned] = useState<Record<string, string | null>>(
		() => {
			if (mode !== "edit" || !test) return {};
			const map: Record<string, string | null> = {};
			for (const part of test.parts) map[part.part] = part.promptId;
			return map;
		},
	);
	const [overrides, setOverrides] = useState<Record<string, number | null>>(
		() => {
			if (mode !== "edit" || !test) return {};
			const map: Record<string, number | null> = {};
			for (const part of test.parts)
				if (part.qStartOverride != null) map[part.part] = part.qStartOverride;
			return map;
		},
	);
	const [slotDrafts, setSlotDrafts] = useState<
		Record<string, ComposerValue | null>
	>(() => (bannerDraft ? bannerDraft.slotDrafts : {}));
	const [composer, setComposer] = useState<OpenComposer | null>(null);
	const [pickerPart, setPickerPart] = useState<string | null>(null);
	const [showHeaderErrors, setShowHeaderErrors] = useState(false);
	const [answersOpen, setAnswersOpen] = useState(false);
	const [answersKeyText, setAnswersKeyText] = useState("");
	const [showComposerErrors, setShowComposerErrors] = useState(false);
	const [savedNotice, setSavedNotice] = useState<string | null>(null);

	const slots = useMemo(() => {
		// Slot catalog duy nhất — mọi skill render từ đây (risk: hard-code
		// reading slots trong component).
		return (
			ASSIGNMENT_TEST_PRESETS[header.skill as AssignmentSkill]?.slots ?? []
		);
	}, [header.skill]);

	const promptById = useMemo(() => {
		const map = new Map<string, AssignmentPrompt>();
		for (const prompt of data.assignmentPrompts) map.set(prompt.id, prompt);
		return map;
	}, [data.assignmentPrompts]);

	const slotViews = useMemo(() => {
		// computeTestRanges là NGUỒN SỐ DUY NHẤT — không dùng qStart tĩnh của
		// preset part (contract test cấm chuỗi đó trong thư mục này).
		const ranges = computeTestRanges({
			parts: slots.map((slot) => {
				const promptId = assigned[slot.part];
				const prompt = promptId ? (promptById.get(promptId) ?? null) : null;
				return {
					part: slot.part,
					qStartOverride: overrides[slot.part] ?? null,
					promptQuestions: prompt?.questions ?? [],
				};
			}),
		});
		const rangeByPart = new Map(ranges.map((range) => [range.part, range]));
		return slots.map((slot) => {
			const promptId = assigned[slot.part];
			const prompt = promptId ? (promptById.get(promptId) ?? null) : null;
			const range = rangeByPart.get(slot.part);
			return {
				...slot,
				prompt,
				qStart: range?.qStart ?? 1,
				count: range?.count ?? 0,
			};
		});
	}, [slots, assigned, overrides, promptById]);

	const assignedCount = slotViews.filter((slot) => slot.prompt).length;
	const totalQuestions = slotViews.reduce(
		(sum, slot) => sum + (slot.prompt ? slot.count : 0),
		0,
	);

	// Panel Soát đáp án (phase-05): chỉ part có prompt — questions đọc từ
	// snapshot (promptById), panel không fetch riêng.
	const answerSlots = useMemo(
		() =>
			slotViews
				.filter((slot) => slot.prompt !== null && assigned[slot.part])
				.map((slot) => ({
					part: slot.part,
					label: slot.label,
					promptId: assigned[slot.part] as string,
					qStart: slot.qStart,
					kind: kindOf(slot.prompt?.type ?? slot.prompt?.genre ?? ""),
					questions: slot.prompt?.questions ?? [],
				})),
		[slotViews, assigned],
	);

	const collections = useMemo(
		() => collectionOptions(data.assignmentTests),
		[data.assignmentTests],
	);
	const groups = useMemo(
		() => groupOptions(data.assignmentTests),
		[data.assignmentTests],
	);

	const built = buildTestPayload(header);

	// Debounced autosave (create only): form + slot drafts, skip untouched.
	useEffect(() => {
		if (mode !== "create") return;
		const testMeta = {
			title: header.title,
			description: header.description,
			skill: header.skill,
			timeLimitSeconds: built.ok ? built.payload.timeLimitSeconds : null,
			collection: header.collection,
			testGroup: header.testGroup,
		};
		if (!testDraftHasContent(testMeta, slotDrafts)) return;
		const timer = setTimeout(() => {
			saveAssignmentTestDraft({
				schemaVersion: ASSIGNMENT_TEST_DRAFT_SCHEMA_VERSION,
				savedAt: Date.now(),
				test: testMeta,
				slotDrafts,
			});
		}, 1000);
		return () => clearTimeout(timer);
	}, [mode, header, slotDrafts, built]);

	function handleHeaderChange(patch: Partial<TestHeaderFormValue>) {
		setSavedNotice(null);
		setHeader((current) => ({ ...current, ...patch }));
	}

	function handleSkillChange(skill: string) {
		const hasWork =
			Object.values(assigned).some(Boolean) ||
			Object.values(slotDrafts).some(Boolean);
		if (
			hasWork &&
			!window.confirm(
				"Đổi kỹ năng sẽ xóa các part đã gán và bản nháp slot của kỹ năng cũ. Tiếp tục?",
			)
		)
			return;
		setHeader((current) => ({ ...current, skill }));
		setAssigned({});
		setOverrides({});
		setSlotDrafts({});
		setComposer(null);
	}

	async function persistParts(nextAssigned: Record<string, string | null>) {
		if (mode !== "edit" || !test) return;
		await submit.run({
			type: "set-assignment-test-parts",
			testId: test.id,
			parts: partsSetPayload(header.skill, nextAssigned, overrides),
		});
	}

	/** Phase-05 Apply: PATCH questions của 1 part (giữ stem/opts/pin, chỉ
	 * thay answer/alts). false = lỗi/chưa refresh → Apply dừng ở part đó. */
	async function patchAnswerKeyPart(change: AnswerKeyPartChange) {
		const result = await submit.run({
			type: "update-assignment-prompt",
			promptId: change.promptId,
			payload: { questions: change.questions },
		});
		return result?.kind === "refreshed";
	}

	function handleAssign(part: string, promptId: string) {
		setPickerPart(null);
		setSavedNotice(null);
		const next = { ...assigned, [part]: promptId };
		setAssigned(next);
		// Part đã vào test từ ngân hàng — bản nháp slot (nếu có) hết tác dụng.
		setSlotDrafts((current) => ({ ...current, [part]: null }));
		if (mode === "edit") void persistParts(next);
	}

	function handleRemoveSlot(part: string) {
		setSavedNotice(null);
		// Chỉ gỡ khỏi test — prompt vẫn nằm nguyên trong ngân hàng.
		const next = { ...assigned, [part]: null };
		setAssigned(next);
		setOverrides((current) => ({ ...current, [part]: null }));
		if (mode === "edit") void persistParts(next);
	}

	function openComposeNew(part: string) {
		const draft = slotDrafts[part];
		const preset = partOf(header.skill, part);
		setComposer({
			part,
			promptId: null,
			value: draft
				? {
						...draft,
						skill: header.skill,
						part,
						// Slot drafts may be legacy plain text — same adapter rule as
						// /assignments/new: never load plain \n into the editor raw.
						prompt: normalizeLegacyRichText(draft.prompt),
						passage: normalizeLegacyRichText(draft.passage),
						intro: normalizeLegacyRichText(draft.intro),
						transcript: normalizeLegacyRichText(draft.transcript),
						note: normalizeLegacyRichText(draft.note),
					}
				: {
						skill: header.skill,
						part,
						type: preset.types[0].id,
						band: "7.0",
						...emptyComposer(header.skill, preset.types[0].id),
					},
			status: "draft",
		});
	}

	function openEditAssigned(part: string) {
		const promptId = assigned[part];
		const prompt = promptId ? promptById.get(promptId) : undefined;
		if (!prompt) return;
		setComposer({
			part,
			promptId,
			value: composerFromPrompt(prompt),
			status: prompt.status,
		});
	}

	function closeComposer() {
		setComposer(null);
		setShowComposerErrors(false);
	}

	function handleComposerFieldChange(patch: Partial<ComposerValue>) {
		if (!composer) return;
		const change = structuralChangeKind(composer.value, patch);
		// lockPart: skill/part không bao giờ đến từ UI; patch lạ bị bỏ.
		if (change === "skill" || change === "part") return;
		if (change === "type" && hasAuthoringContent(composer.value)) {
			const ok = window.confirm(
				"Đổi dạng đề sẽ xóa câu hỏi, đáp án và câu lệnh đã soạn của dạng hiện tại. Tiếp tục?",
			);
			if (!ok) return;
		}
		const value = applyComposerFieldChange(composer.value, patch);
		setComposer({ ...composer, value });
		// Live autosave draft của slot (create flow) — refresh giữa chừng không
		// mất nội dung đang soạn dở.
		if (composer.promptId === null)
			setSlotDrafts((current) => ({ ...current, [composer.part]: value }));
	}

	const composerErrors = useMemo(() => {
		if (!composer) return {};
		return composerFieldErrors(composer.value, composer.status);
	}, [composer]);

	const composerCanSave = composer
		? composerSaveAllowed(composer.value, composer.status, composerErrors)
		: false;

	async function handleComposerSave() {
		if (!composer || !composerCanSave) {
			setShowComposerErrors(true);
			return;
		}
		setShowComposerErrors(true);
		const payload = composerToPromptPayload(composer.value, composer.status);
		if (composer.promptId) {
			const result = await submit.run({
				type: "update-assignment-prompt",
				promptId: composer.promptId,
				payload,
			});
			if (result?.kind === "refreshed") closeComposer();
			return;
		}
		const result = await submit.run({
			type: "create-assignment-prompt",
			payload,
		});
		if (result?.kind === "refreshed") {
			const promptId = result.id;
			closeComposer();
			if (promptId) handleAssign(composer.part, promptId);
			else
				submit.setError(
					"Đã lưu đề vào ngân hàng nhưng chưa xác nhận được id — gán lại part từ ngân hàng.",
				);
		}
	}

	async function handleHeaderSubmit() {
		setShowHeaderErrors(true);
		setSavedNotice(null);
		if (!built.ok) return;
		const result = await submit.run(
			mode === "edit" && test
				? {
						type: "update-assignment-test",
						testId: test.id,
						payload: built.payload,
					}
				: { type: "create-assignment-test", payload: built.payload },
		);
		// Write có thể đã lưu (refreshed/committed/outcome-unknown) — draft
		// không được hồi sinh; definite-failure chắc CHƯA lưu → giữ draft.
		if (
			mode === "create" &&
			(result?.kind === "refreshed" ||
				result?.kind === "committed" ||
				result?.kind === "outcome-unknown")
		)
			clearAssignmentTestDraft();
		if (result?.kind !== "refreshed") return;
		if (mode === "edit") {
			setSavedNotice("Đã lưu thông tin bộ đề.");
			return;
		}
		const testId = result.id;
		if (!testId) {
			submit.setError(
				"Đã tạo bộ đề nhưng chưa xác nhận được id — tìm bộ đề trong danh sách để tiếp tục.",
			);
			return;
		}
		const parts = partsSetPayload(header.skill, assigned, overrides);
		if (parts.length > 0) {
			await submit.run({
				type: "set-assignment-test-parts",
				testId,
				parts,
			});
		}
		navigate({ to: "/assignments/tests/$id", params: { id: testId } });
	}

	async function handleReconcile() {
		const applied = await submit.reconcile();
		if (!applied) return;
		if (mode === "create" && built.ok) {
			// Snapshot mới nhất đã vào store — đối chiếu bằng title+skill.
			const row = data.assignmentTests.find(
				(candidate) =>
					candidate.title === built.payload.title &&
					candidate.skill === built.payload.skill,
			);
			if (row) {
				clearAssignmentTestDraft();
				navigate({ to: "/assignments/tests/$id", params: { id: row.id } });
				return;
			}
		}
		setSavedNotice("Đã tải lại dữ liệu mới nhất từ máy chủ.");
	}

	/** Task 4.3: lưu handoff sessionStorage rồi mở preview — không qua server. */
	function handlePreview() {
		saveTestPreviewDraft(
			{
				test: {
					title: header.title,
					skill: header.skill,
					timeLimitSeconds: built.ok ? built.payload.timeLimitSeconds : null,
					collection: header.collection,
					testGroup: header.testGroup,
				},
				parts: slots.map((slot) => {
					const promptId = assigned[slot.part] ?? null;
					const prompt = promptId ? promptById.get(promptId) : undefined;
					const slotDraft = slotDrafts[slot.part] ?? null;
					return {
						part: slot.part,
						label: slot.label,
						qStartOverride: overrides[slot.part] ?? null,
						promptId,
						type: prompt?.type ?? slotDraft?.type ?? "",
						title: prompt?.title ?? slotDraft?.title ?? "",
						intro: prompt?.intro ?? slotDraft?.intro ?? "",
						passage: prompt?.passage ?? slotDraft?.passage ?? "",
						prompt: prompt?.prompt ?? slotDraft?.prompt ?? "",
						audioName: prompt?.audioName ?? slotDraft?.audioName ?? "",
						optionBank: prompt?.optionBank ?? slotDraft?.optionBank ?? [],
						items: prompt?.questions ?? slotDraft?.items ?? [],
					};
				}),
			},
			mode === "edit" ? (test?.id ?? null) : null,
		);
		navigate({ to: "/assignments/tests/preview" });
	}

	function acceptDraftBanner() {
		clearAssignmentTestDraft();
		setBannerOpen(false);
	}

	function discardDraftBanner() {
		clearAssignmentTestDraft();
		setBannerOpen(false);
		setHeader(emptyTestHeader());
		setAssigned({});
		setOverrides({});
		setSlotDrafts({});
	}

	const pickerPrompts = useMemo(() => {
		if (!pickerPart) return [];
		return data.assignmentPrompts
			.filter(
				(prompt) =>
					(prompt.skill ?? "writing") === header.skill &&
					(prompt.part ?? prompt.task) === pickerPart,
			)
			.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
	}, [pickerPart, data.assignmentPrompts, header.skill]);

	const pickerSlot = slots.find((slot) => slot.part === pickerPart);

	return (
		<div className="grid grid-cols-[1fr_1.3fr] gap-6 max-app:grid-cols-1">
			{/* Cột trái — outline theo mẫu Selfomy ("3 groups, 13 questions"). */}
			<Card
				variant="white"
				className="sticky top-6 flex h-fit flex-col gap-3 py-4"
			>
				<SectionLabel>Bộ đề</SectionLabel>
				<strong className="text-sm">
					{header.title.trim() || "Bộ đề chưa đặt tên"}
				</strong>
				<span className="text-muted-foreground text-xs">
					{assignedCount}/{slots.length} parts · {totalQuestions} questions
				</span>
				<ol className="flex flex-col">
					{slotViews.map((slot) => (
						<li
							key={slot.part}
							className="flex flex-col border-border border-t py-2 transition-colors duration-150 first:border-t-0 hover:text-primary"
						>
							<span className="text-muted-foreground text-xs">
								{slot.label}
							</span>
							<span className="text-xs">
								{slot.prompt ? (
									<>
										{slot.prompt.title}
										{slot.count > 0
											? ` · Câu ${slot.qStart}–${slot.qStart + slot.count - 1}`
											: ""}
									</>
								) : (
									"Trống"
								)}
							</span>
						</li>
					))}
				</ol>
			</Card>

			{/* Cột phải — header form + slots + composer nhúng. */}
			<form
				onSubmit={(event) => {
					event.preventDefault();
					void handleHeaderSubmit();
				}}
				noValidate
				className="flex min-w-0 flex-col gap-5"
			>
				{bannerOpen && (
					<div
						role="status"
						className="neu-in flex flex-wrap items-center justify-between gap-2 rounded-md px-3 py-2"
					>
						<span className="text-xs">
							Đã phục hồi bản nháp bộ đề — kiểm tra rồi tiếp tục, hoặc Hủy để
							soạn mới.
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
				<Card variant="white" className="flex flex-col gap-4 py-4">
					<SectionLabel>Thông tin bộ đề</SectionLabel>
					<TestHeaderForm
						value={header}
						errors={built.ok ? undefined : built.errors}
						showErrors={showHeaderErrors}
						skillLocked={mode === "edit"}
						collections={collections}
						groups={groups}
						onSkillChange={handleSkillChange}
						onChange={handleHeaderChange}
					/>
				</Card>
				<Card variant="white" className="flex flex-col gap-3 py-4">
					<SectionLabel>{`Parts (${slots.length} slot)`}</SectionLabel>
					{slotViews.map((slot) => (
						<TestPartSlot
							key={slot.part}
							skill={header.skill}
							part={slot.part}
							label={slot.label}
							prompt={slot.prompt}
							qStart={slot.qStart}
							count={slot.count}
							busy={submit.saving}
							onPick={() => setPickerPart(slot.part)}
							onCompose={() => openComposeNew(slot.part)}
							onEdit={() => openEditAssigned(slot.part)}
							onRemove={() => handleRemoveSlot(slot.part)}
						/>
					))}
				</Card>
				{answersOpen && (
					<Card variant="white" className="flex flex-col gap-4 py-4">
						<SectionLabel>Soát đáp án</SectionLabel>
						<AnswersCheckingPanel
							slots={answerSlots}
							keyText={answersKeyText}
							onKeyTextChange={setAnswersKeyText}
							busy={submit.saving}
							onPatchPart={patchAnswerKeyPart}
						/>
					</Card>
				)}
				{composer && (
					<Card variant="white" className="flex flex-col gap-4 py-4">
						<SectionLabel>{`${
							composer.promptId ? "Chỉnh sửa part" : "Soạn mới part"
						} — ${partOf(header.skill, composer.part).label}`}</SectionLabel>
						<PromptComposer
							value={composer.value}
							errors={composerErrors}
							showErrors={showComposerErrors}
							status={composer.status}
							lockPart
							onFieldChange={handleComposerFieldChange}
						/>
						<div className="flex flex-wrap items-center justify-between gap-3 border-border border-t pt-3">
							<div className="flex flex-col gap-1.5">
								<span className="text-muted-foreground text-xs">
									Trạng thái
								</span>
								<ChipFilter
									options={["Bản nháp", "Sẵn sàng giao"]}
									value={
										composer.status === "draft" ? "Bản nháp" : "Sẵn sàng giao"
									}
									onChange={(label) =>
										setComposer({
											...composer,
											status: label === "Bản nháp" ? "draft" : "ready",
										})
									}
								/>
							</div>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									disabled={submit.saving}
									onClick={closeComposer}
								>
									Đóng
								</Button>
								<Button
									type="button"
									disabled={!composerCanSave || submit.saving}
									onClick={() => void handleComposerSave()}
								>
									{submit.saving
										? "Đang lưu…"
										: composer.promptId
											? "Cập nhật đề"
											: "Lưu vào ngân hàng"}
								</Button>
							</div>
						</div>
					</Card>
				)}
				<div className="sticky bottom-0 border-border border-t bg-background/90 py-3 backdrop-blur">
					{submit.notice && (
						<KernelSubmitNotice
							notice={submit.notice}
							onReconcile={() => void handleReconcile()}
							disabled={submit.saving}
						/>
					)}
					{submit.error && (
						<p role="alert" className="mb-2 text-destructive text-xs">
							{submit.error}
						</p>
					)}
					{savedNotice && !submit.error && (
						<p role="status" className="mb-2 text-success text-xs">
							{savedNotice}
						</p>
					)}
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span className="text-muted-foreground text-xs">
							{mode === "create"
								? "Tạo bộ đề rồi gán part ở bước sau."
								: "Thay đổi part lưu ngay vào bộ đề."}
						</span>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="secondary"
								onClick={() => setAnswersOpen((open) => !open)}
							>
								{answersOpen ? "Đóng soát đáp án" : "Soát đáp án"}
							</Button>
							<Button type="button" variant="secondary" onClick={handlePreview}>
								Xem trước
							</Button>
							<Button
								type="submit"
								disabled={!built.ok || submit.saving || submit.submitBlocked}
							>
								{submit.saving
									? "Đang lưu…"
									: mode === "create"
										? "Tạo bộ đề"
										: "Lưu thông tin"}
							</Button>
						</div>
					</div>
				</div>
			</form>
			{pickerSlot && (
				<PromptPickerDialog
					open={pickerPart !== null}
					onClose={() => setPickerPart(null)}
					skill={header.skill}
					part={pickerSlot.part}
					slotLabel={pickerSlot.label}
					prompts={pickerPrompts}
					onPick={(promptId) => handleAssign(pickerSlot.part, promptId)}
				/>
			)}
		</div>
	);
}

/** Mirror lỗi field của `/assignments/new` cho composer nhúng (same rules). */
function composerFieldErrors(
	value: ComposerValue,
	status: "draft" | "ready",
): Record<string, string | undefined> {
	const errors: Record<string, string | undefined> = {};
	if (!value.title.trim()) errors.title = "Nhập tiêu đề bài tập.";
	if (value.skill === "writing" && isEmptyRichText(value.prompt))
		errors.prompt = "Dán hoặc soạn đề trước khi lưu.";
	if (value.skill === "reading" && isEmptyRichText(value.passage))
		errors.passage = "Nhập đoạn đọc.";
	if (
		value.skill === "listening" &&
		status === "ready" &&
		!value.audioName.trim()
	)
		errors.audioName = "Đính file nghe (MP3 hoặc WAV).";
	const trimmedImageUrl = value.imageUrl.trim();
	if (isImageBased(value.skill, value.type)) {
		if (trimmedImageUrl && !isAssignmentImageUrl(trimmedImageUrl))
			errors.imageUrl = "Chỉ nhận link ảnh https (tối đa 500 ký tự).";
		else if (status === "ready" && !trimmedImageUrl)
			errors.imageUrl = "Dán link ảnh (https) trước khi lưu.";
	}
	if (
		value.skill === "speaking" &&
		value.part === "part2" &&
		!value.cueTopic.trim()
	)
		errors.cueTopic = "Nhập chủ đề cue card.";
	const bankIssue = optionBankIssue(value, status);
	if (bankIssue) errors.optionBank = bankIssue;
	const stemIssue = clozeStemIssue(value, status);
	if (stemIssue) errors.questions = stemIssue;
	const pinIssue = imagePinIssue(value, status);
	if (pinIssue && !stemIssue) errors.questions = pinIssue;
	return errors;
}

function composerSaveAllowed(
	value: ComposerValue,
	status: "draft" | "ready",
	errors: Record<string, string | undefined>,
): boolean {
	const hasCore =
		value.title.trim() &&
		(value.skill === "writing"
			? !isEmptyRichText(value.prompt)
			: value.skill === "reading"
				? !isEmptyRichText(value.passage) &&
					value.items.some((item) => item.stem.trim())
				: value.skill === "listening"
					? value.items.some((item) => item.stem.trim())
					: value.part === "part2"
						? !!value.cueTopic.trim()
						: !isEmptyRichText(value.prompt));
	if (!hasCore) return false;
	if (Object.values(errors).some(Boolean)) return false;
	if (isAutoSkill(value.skill) && status === "ready")
		return value.items.every((item) => item.answer.trim());
	return true;
}

/** Composer → create/update prompt payload (same mapping as new.tsx). */
function composerToPromptPayload(
	value: ComposerValue,
	status: "draft" | "ready",
) {
	return {
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
		optionBank: value.optionBank,
		note: value.note.trim(),
		status,
	};
}
