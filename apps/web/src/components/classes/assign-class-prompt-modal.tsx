import { Link } from "@tanstack/react-router";
import { ASSIGNMENT_IMAGE_SRC_PATTERN } from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import {
	addDaysISO,
	formatVietnamTimeHHMM,
	formatViWeekdayDate,
	parseTimeHHMM,
	vietnamDateTimeMs,
	vietnamTodayISO,
} from "@teacher-os/api/vietnam-date";
import { ClozeStemText } from "@teacher-os/ui/components/assignments/cloze-stem";
import { OptionBankList } from "@teacher-os/ui/components/assignments/option-bank-list";
import { PinOverlay } from "@teacher-os/ui/components/assignments/pin-overlay";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	isAutoSkill,
	isBankableType,
	isImageBased,
	kindOf,
	partOf,
	qStartOf,
	type SkillId,
	selectedTypeOf,
	skillOf,
} from "@/components/assignments/assignment-presets";
import {
	fmtDue,
	fmtDueDisplay,
} from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChipFilter } from "@/components/ui/chip-filter";
import {
	DatePickerInput,
	TimeInput24h,
} from "@/components/ui/date-picker-input";
import { inputCls } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type { AssignmentPrompt, ClassGroup, Student } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

const MAX_STUDENTS_PER_ASSIGN = 100;

export interface AssignedPromptResult {
	promptId: string;
	promptTitle: string;
	studentCount: number;
	assignedId?: string;
	baselineIds: ReadonlySet<string>;
}

export interface AssignClassPromptModalProps {
	open: boolean;
	onClose: () => void;
	classGroup: ClassGroup;
	onAssigned?: (info: AssignedPromptResult) => void;
	onRequestAddStudent?: () => void;
}

const PICKER_SKILL_OPTIONS = [
	"Tất cả",
	"Writing",
	"Reading",
	"Listening",
	"Speaking",
	"Grammar",
	"Vocabulary",
] as const;

const CHIP_TO_SKILL: Record<string, "all" | SkillId> = {
	"Tất cả": "all",
	Writing: "writing",
	Reading: "reading",
	Listening: "listening",
	Speaking: "speaking",
	Grammar: "grammar",
	Vocabulary: "vocabulary",
};

const SKILL_TO_CHIP: Record<string, string> = {
	all: "Tất cả",
	writing: "Writing",
	reading: "Reading",
	listening: "Listening",
	speaking: "Speaking",
	grammar: "Grammar",
	vocabulary: "Vocabulary",
};

export function AssignClassPromptModal({
	open,
	onClose,
	classGroup,
	onAssigned,
	onRequestAddStudent,
}: AssignClassPromptModalProps) {
	const { data, studentById } = useData();
	const submit = useKernelFormSubmit();
	const resetSubmitRef = useRef(submit.reset);
	resetSubmitRef.current = submit.reset;

	const [validationNowMs, setValidationNowMs] = useState(() => Date.now());
	const effectiveNowMs = Math.max(Date.now(), validationNowMs);
	const todayVN = vietnamTodayISO(new Date(effectiveNowMs));

	const enrolledStudents = useMemo(() => {
		return classGroup.studentIds
			.map(studentById)
			.filter((s): s is Student => s !== undefined);
	}, [classGroup.studentIds, studentById]);
	const enrolledStudentIdSet = useMemo(
		() => new Set(enrolledStudents.map((s) => s.id)),
		[enrolledStudents],
	);

	const classAssignments = useMemo(() => {
		return (data.classAssignments ?? []).filter(
			(ca) => ca.classId === classGroup.id,
		);
	}, [data.classAssignments, classGroup.id]);

	const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [skillFilter, setSkillFilter] = useState<"all" | SkillId>("all");
	const [previewExpanded, setPreviewExpanded] = useState(false);
	const [due, setDue] = useState<string>(() => addDaysISO(todayVN, 7));
	const [dueTime, setDueTime] = useState<string>("23:59");
	const [dueDateInvalid, setDueDateInvalid] = useState(false);
	const [dueTimeInvalid, setDueTimeInvalid] = useState(false);
	const [dueTouched, setDueTouched] = useState(false);
	const [dueTimeTouched, setDueTimeTouched] = useState(false);
	const [formResetKey, setFormResetKey] = useState(0);
	const [note, setNote] = useState("");
	const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() =>
		enrolledStudents.map((s) => s.id).slice(0, MAX_STUDENTS_PER_ASSIGN),
	);
	const committedAssignRef = useRef<AssignedPromptResult | null>(null);

	// Reset sạch toàn bộ state khi mở lại Modal (false -> true)
	const wasOpenRef = useRef(open);
	useEffect(() => {
		if (open && !wasOpenRef.current) {
			const freshNowMs = Date.now();
			const freshTodayVN = vietnamTodayISO(new Date(freshNowMs));
			resetSubmitRef.current();
			committedAssignRef.current = null;
			setValidationNowMs(freshNowMs);
			setSelectedPromptId(null);
			setSearchQuery("");
			setSkillFilter("all");
			setPreviewExpanded(false);
			setDue(addDaysISO(freshTodayVN, 7));
			setDueTime("23:59");
			setDueDateInvalid(false);
			setDueTimeInvalid(false);
			setDueTouched(false);
			setDueTimeTouched(false);
			setFormResetKey((k) => k + 1);
			setNote("");
			setSelectedStudentIds(
				enrolledStudents.map((s) => s.id).slice(0, MAX_STUDENTS_PER_ASSIGN),
			);
		}
		wasOpenRef.current = open;
	}, [open, enrolledStudents]);

	const allReadyPrompts = useMemo(() => {
		return (data.assignmentPrompts ?? []).filter((p) => p.status === "ready");
	}, [data.assignmentPrompts]);

	const searchMatchedPrompts = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return allReadyPrompts;
		return allReadyPrompts.filter((p) => {
			const titleMatch = p.title.toLowerCase().includes(query);
			const sourceMatch = p.source.toLowerCase().includes(query);
			return titleMatch || sourceMatch;
		});
	}, [allReadyPrompts, searchQuery]);

	const skillCounts = useMemo(() => {
		const counts: Record<string, number> = {
			"Tất cả": searchMatchedPrompts.length,
			Writing: 0,
			Reading: 0,
			Listening: 0,
			Speaking: 0,
			Grammar: 0,
			Vocabulary: 0,
		};
		for (const p of searchMatchedPrompts) {
			const chipLabel = SKILL_TO_CHIP[p.skill ?? "writing"] ?? "Writing";
			counts[chipLabel] = (counts[chipLabel] ?? 0) + 1;
		}
		return counts;
	}, [searchMatchedPrompts]);

	const readyPrompts = useMemo(() => {
		if (skillFilter === "all") return searchMatchedPrompts;
		return searchMatchedPrompts.filter(
			(p) => (p.skill ?? "writing") === skillFilter,
		);
	}, [searchMatchedPrompts, skillFilter]);

	const assignedPromptIds = useMemo(() => {
		return new Set(classAssignments.map((ca) => ca.promptId));
	}, [classAssignments]);

	const selectedPrompt = useMemo(() => {
		if (!selectedPromptId) return null;
		return allReadyPrompts.find((p) => p.id === selectedPromptId) ?? null;
	}, [allReadyPrompts, selectedPromptId]);

	const previousAssignment = useMemo(() => {
		if (!selectedPromptId) return null;
		return (
			classAssignments.find((ca) => ca.promptId === selectedPromptId) ?? null
		);
	}, [classAssignments, selectedPromptId]);

	// Validation
	const promptOk = Boolean(selectedPrompt);
	const dueValidDate =
		!dueDateInvalid && Boolean(due && parseStartDateStrict(due) !== null);
	const dueTimeValid =
		!dueTimeInvalid && Boolean(dueTime && parseTimeHHMM(dueTime) !== null);
	const dueAtMs =
		dueValidDate && dueTimeValid ? vietnamDateTimeMs(due, dueTime) : Number.NaN;
	const dueAtPreviewIso = Number.isFinite(dueAtMs)
		? new Date(dueAtMs).toISOString()
		: null;
	const dueDateNotPast = dueValidDate && due >= todayVN;
	const dueTimeNotPast =
		dueDateNotPast &&
		(due > todayVN ||
			dueTime === "23:59" ||
			(Number.isFinite(dueAtMs) && dueAtMs > effectiveNowMs));
	const dueOk =
		dueValidDate && dueTimeValid && dueDateNotPast && dueTimeNotPast;
	const dueDateMissing = dueTouched && !due;
	const dueTimeMissing = dueTimeTouched && !dueTime;
	const dueErrorMsg =
		dueDateInvalid || dueDateMissing
			? "Ngày không hợp lệ — nhập theo định dạng dd/mm/yyyy (ví dụ 06/11/2026)."
			: dueTimeInvalid || dueTimeMissing
				? "Giờ không hợp lệ — nhập theo định dạng 24h HH:mm (ví dụ 23:59)."
				: dueValidDate && !dueDateNotPast
					? "Chọn hạn nộp từ hôm nay trở đi."
					: dueDateNotPast && dueTimeValid && !dueTimeNotPast
						? "Giờ hạn nộp hôm nay phải sau thời điểm hiện tại."
						: null;
	const visibleSelectedStudentIds = useMemo(
		() =>
			selectedStudentIds
				.filter((id) => enrolledStudentIdSet.has(id))
				.slice(0, MAX_STUDENTS_PER_ASSIGN),
		[selectedStudentIds, enrolledStudentIdSet],
	);
	const studentsOk =
		visibleSelectedStudentIds.length > 0 &&
		visibleSelectedStudentIds.length <= MAX_STUDENTS_PER_ASSIGN;
	const maxSelectableCount = Math.min(
		enrolledStudents.length,
		MAX_STUDENTS_PER_ASSIGN,
	);
	const allSelectableSelected =
		maxSelectableCount > 0 &&
		visibleSelectedStudentIds.length === maxSelectableCount;
	const isReassign = promptOk && previousAssignment !== null;
	const canSubmit = promptOk && dueOk && studentsOk;

	const actionState = useMemo(() => {
		if (!promptOk) {
			return {
				title: "Chưa chọn đề",
				sub: "Chọn đề sẵn sàng, hạn nộp, rồi chọn học viên.",
			};
		}
		if (!studentsOk) {
			return {
				title: "Chưa chọn học viên",
				sub: "Giao cho ít nhất một học viên trong lớp này.",
			};
		}
		if (!dueOk) {
			if (dueDateNotPast && dueTimeValid && !dueTimeNotPast) {
				return {
					title: "Giờ hạn nộp đã qua",
					sub: "Chọn giờ sau thời điểm hiện tại hoặc chuyển sang ngày khác.",
				};
			}
			return {
				title: "Thiếu hoặc sai hạn nộp",
				sub: `Hạn phải từ hôm nay (${fmtDue(todayVN)}) trở đi.`,
			};
		}
		return {
			title: `Giao cho ${visibleSelectedStudentIds.length} học viên`,
			sub: `${selectedPrompt?.title} · hạn ${fmtDueDisplay(due, dueAtPreviewIso)}`,
		};
	}, [
		promptOk,
		studentsOk,
		dueOk,
		dueDateNotPast,
		dueTimeValid,
		dueTimeNotPast,
		todayVN,
		visibleSelectedStudentIds.length,
		selectedPrompt,
		due,
		dueAtPreviewIso,
	]);

	function handleRequestClose() {
		if (submit.saving) return;
		onClose();
	}

	function handleToggleAllStudents() {
		if (allSelectableSelected) {
			setSelectedStudentIds([]);
		} else {
			setSelectedStudentIds(
				enrolledStudents.map((s) => s.id).slice(0, MAX_STUDENTS_PER_ASSIGN),
			);
		}
	}

	function handleStudentToggle(studentId: string, checked: boolean) {
		if (checked) {
			setSelectedStudentIds((prev) => {
				const normalized = prev.filter((id) => enrolledStudentIdSet.has(id));
				if (
					normalized.includes(studentId) ||
					normalized.length >= MAX_STUDENTS_PER_ASSIGN
				) {
					return normalized;
				}
				return [...normalized, studentId];
			});
		} else {
			setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
		}
	}

	function handleSkillChipChange(opt: string) {
		setSkillFilter(CHIP_TO_SKILL[opt] ?? "all");
	}

	function handleDueChange(nextIso: string) {
		if (!submit.submitBlocked && submit.error) submit.reset();
		setDueTouched(true);
		setValidationNowMs(Date.now());
		setDue(nextIso);
	}

	function handleDueTimeChange(nextTime: string) {
		if (!submit.submitBlocked && submit.error) submit.reset();
		setDueTimeTouched(true);
		setValidationNowMs(Date.now());
		setDueTime(nextTime);
	}

	function finishAssignSuccess(info: AssignedPromptResult) {
		toast.success(
			`Đã giao “${info.promptTitle}” cho ${info.studentCount} học viên.`,
		);
		onAssigned?.(info);
		onClose();
	}

	async function handleSubmit() {
		const clickNowMs = Date.now();
		setValidationNowMs(clickNowMs);
		const clickTodayVN = vietnamTodayISO(new Date(clickNowMs));
		const clickDateOk = dueValidDate && due >= clickTodayVN;
		const clickTimeOk =
			clickDateOk &&
			dueTimeValid &&
			(due > clickTodayVN ||
				dueTime === "23:59" ||
				(Number.isFinite(dueAtMs) && dueAtMs > clickNowMs));
		if (!promptOk || !studentsOk || !clickTimeOk || !selectedPrompt) return;

		committedAssignRef.current = null;
		const assignMeta: AssignedPromptResult = {
			promptId: selectedPrompt.id,
			promptTitle: selectedPrompt.title,
			studentCount: visibleSelectedStudentIds.length,
			// Chụp trước POST để nhận biết bản ghi mới ngay cả khi notifyManager cập nhật chậm 1 nhịp (#717).
			baselineIds: new Set(classAssignments.map((ca) => ca.id)),
		};

		const result = await submit.run({
			type: "assign-class-prompt",
			payload: {
				classId: classGroup.id,
				promptId: assignMeta.promptId,
				due,
				dueTime,
				note: note.trim(),
				studentIds: visibleSelectedStudentIds,
			},
		});

		if (result?.kind === "refreshed") {
			finishAssignSuccess({
				...assignMeta,
				assignedId: result.id,
			});
		} else if (result?.kind === "committed") {
			committedAssignRef.current = {
				...assignMeta,
				assignedId: result.id,
			};
		}
	}

	async function handleReconcile() {
		const pendingCommitted = committedAssignRef.current;
		const reconciled = await submit.reconcile();
		if (!reconciled) return;
		committedAssignRef.current = null;
		if (pendingCommitted) {
			finishAssignSuccess(pendingCommitted);
		}
	}

	const selectedSkillChip = SKILL_TO_CHIP[skillFilter];
	const previewSkillId = selectedPrompt
		? (selectedPrompt.skill ?? "writing")
		: "writing";
	const previewPartId = selectedPrompt
		? (selectedPrompt.part ?? selectedPrompt.task ?? "task2")
		: "task2";
	const previewPart = selectedPrompt
		? partOf(previewSkillId, previewPartId)
		: null;
	const duePreviewText =
		dueValidDate && dueTimeValid ? fmtDueDisplay(due, dueAtPreviewIso) : "—";

	const hasActivePromptFilter =
		searchQuery.trim().length > 0 || skillFilter !== "all";

	return (
		<Modal
			open={open}
			onClose={handleRequestClose}
			title={`Giao bài tập · ${classGroup.name}`}
			description="Chọn một đề sẵn sàng từ ngân hàng, đặt hạn nộp và chọn học viên nhận bài."
			size="xl"
			scrollableBody
			footer={
				<div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="min-w-0 flex-1">
						<strong className="block font-semibold text-foreground text-sm">
							{actionState.title}
						</strong>
						<span className="block truncate text-muted-foreground text-xs">
							{actionState.sub}
						</span>
						{submit.error && (
							<p
								role="alert"
								className="mt-1 font-medium text-destructive text-xs"
							>
								{submit.error}
							</p>
						)}
						{submit.notice && (
							<div className="mt-1">
								<KernelSubmitNotice
									notice={submit.notice}
									onReconcile={handleReconcile}
									disabled={submit.saving}
								/>
							</div>
						)}
					</div>
					<div className="flex shrink-0 items-center justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleRequestClose}
							disabled={submit.saving}
						>
							Huỷ
						</Button>
						<Button
							type="button"
							onClick={handleSubmit}
							disabled={!canSubmit || submit.saving || submit.submitBlocked}
						>
							{submit.saving ? "Đang giao…" : "Giao bài tập"}
						</Button>
					</div>
				</div>
			}
		>
			<div className="grid gap-6 lg:grid-cols-[1.15fr_1fr] lg:items-start">
				{/* Cột trái: 1. Chọn đề sẵn sàng */}
				<div className="flex min-w-0 flex-col gap-3.5">
					<div className="flex items-center justify-between gap-2">
						<h4 className="font-semibold text-[15px] tracking-tight">
							1. Chọn đề sẵn sàng
						</h4>
						<Link
							to="/assignments/new"
							search={{ classId: classGroup.id }}
							className="rounded-xs font-medium text-primary text-xs outline-none hover:underline focus-visible:shadow-[var(--focus-ring)]"
						>
							+ Tạo đề mới
						</Link>
					</div>

					{/* Ô tìm kiếm đề client-side */}
					<div className="relative">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<input
							type="text"
							aria-label="Tìm đề sẵn sàng"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Tìm theo tên đề hoặc nguồn..."
							className={cn(inputCls, "pr-8 pl-9")}
						/>
						{searchQuery.length > 0 && (
							<button
								type="button"
								aria-label="Xoá từ khoá tìm kiếm"
								onClick={() => setSearchQuery("")}
								className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:shadow-[var(--focus-ring)]"
							>
								<X aria-hidden="true" className="size-3.5" />
							</button>
						)}
					</div>

					{/* Chip lọc kỹ năng kèm counts aria-hidden */}
					<ChipFilter
						options={[...PICKER_SKILL_OPTIONS]}
						value={selectedSkillChip}
						onChange={handleSkillChipChange}
						ariaLabel="Lọc đề theo kỹ năng"
						counts={skillCounts}
					/>

					{/* Danh sách thẻ đề */}
					{readyPrompts.length === 0 ? (
						<div className="rounded-lg border border-border border-dashed bg-muted/40 p-5 text-center text-muted-foreground text-sm">
							<p>
								{hasActivePromptFilter
									? "Không có đề sẵn sàng khớp bộ lọc."
									: "Chưa có đề sẵn sàng trong ngân hàng."}
							</p>
							{hasActivePromptFilter && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="mt-3"
									onClick={() => {
										setSearchQuery("");
										setSkillFilter("all");
									}}
								>
									Xoá bộ lọc tìm kiếm
								</Button>
							)}
						</div>
					) : (
						<fieldset
							aria-label="Chọn đề"
							className="flex max-h-72 min-w-0 flex-col gap-2 overflow-y-auto border-0 p-0.5"
						>
							{readyPrompts.map((p) => {
								const isSelected = selectedPromptId === p.id;
								const isAlreadyAssigned = assignedPromptIds.has(p.id);
								const skill = skillOf(p.skill ?? "writing");
								const part = partOf(skill.id, p.part ?? p.task);

								return (
									<button
										type="button"
										key={p.id}
										aria-pressed={isSelected}
										onClick={() => {
											setSelectedPromptId(p.id);
											setPreviewExpanded(false);
										}}
										className={cn(
											"flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
											isSelected
												? "border-primary bg-muted text-foreground ring-1 ring-primary"
												: "border-border bg-card text-foreground hover:bg-accent/60",
										)}
									>
										<span
											aria-hidden="true"
											className={cn(
												"mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors",
												isSelected
													? "border-primary bg-primary text-primary-foreground"
													: "border-input bg-background",
											)}
										>
											{isSelected && <Check className="size-3.5" />}
										</span>
										<span className="min-w-0 flex-1">
											<span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
												<strong className="min-w-0 break-words font-semibold text-foreground text-sm">
													{p.title}
												</strong>
												<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
													{part.label} · Band {p.band}
												</span>
											</span>
											<span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
												<Tag>{skill.name}</Tag>
												{p.writing != null && <Tag>+ Writing</Tag>}
												{isAlreadyAssigned ? (
													<StatusTag tone="used">Đã giao lớp này</StatusTag>
												) : (
													<StatusTag tone="ok">Sẵn sàng</StatusTag>
												)}
												{p.source.trim() && (
													<span className="truncate text-muted-foreground">
														{p.source.trim()}
													</span>
												)}
											</span>
										</span>
									</button>
								);
							})}
						</fieldset>
					)}

					{/* Xem trước đề thu gọn — chỉ hiện khi đã chọn đề */}
					{selectedPrompt && (
						<div className="rounded-lg border border-border bg-muted/40 p-3.5">
							<button
								type="button"
								aria-expanded={previewExpanded}
								onClick={() => setPreviewExpanded((v) => !v)}
								className="flex w-full items-center justify-between gap-3 rounded-sm text-left outline-none focus-visible:shadow-[var(--focus-ring)]"
							>
								<span className="min-w-0 flex-1">
									<span className="block text-muted-foreground text-xs">
										Xem trước phía học viên
									</span>
									<span className="mt-0.5 block truncate font-medium text-foreground text-sm">
										{selectedPrompt.title}
									</span>
									<span className="mt-0.5 block text-muted-foreground text-xs">
										{previewPart
											? `${previewPart.spec} · hạn ${duePreviewText}`
											: `hạn ${duePreviewText}`}
									</span>
								</span>
								<span className="flex shrink-0 items-center gap-1.5 font-medium text-foreground text-xs">
									<span>{previewExpanded ? "Thu gọn" : "Xem nội dung"}</span>
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"size-4 text-muted-foreground transition-transform duration-150",
											previewExpanded && "rotate-180",
										)}
									/>
								</span>
							</button>
							{previewExpanded && (
								<div className="mt-3 max-h-52 overflow-y-auto border-border border-t pt-3">
									<SelectedPromptPreviewContent
										prompt={selectedPrompt}
										note={note}
									/>
								</div>
							)}
						</div>
					)}

					<p className="text-muted-foreground text-xs">
						Bản nháp không hiện ở đây. Hoàn thiện đề trong ngân hàng rồi mới
						giao.
					</p>
				</div>

				{/* Cột phải: 2. Hạn nộp & học viên */}
				<div className="flex min-w-0 flex-col gap-4">
					<h4 className="font-semibold text-[15px] tracking-tight">
						2. Hạn nộp & học viên
					</h4>

					{/* Ngày & giờ hạn nộp (#572) */}
					<div className="flex flex-col gap-2">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="assignment-due-input"
									className="font-medium text-foreground text-xs"
								>
									Ngày hạn nộp <span className="text-destructive">*</span>
								</label>
								<DatePickerInput
									key={`due-date-${formResetKey}`}
									id="assignment-due-input"
									required
									minDateISO={todayVN}
									todayISO={todayVN}
									value={due}
									onChange={handleDueChange}
									onInvalidChange={setDueDateInvalid}
									aria-invalid={
										dueDateInvalid ||
										dueDateMissing ||
										(dueValidDate && !dueDateNotPast)
									}
									aria-describedby={
										dueErrorMsg || dueOk ? "assignment-due-feedback" : undefined
									}
								/>
							</div>
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="assignment-due-time-input"
									className="font-medium text-foreground text-xs"
								>
									Giờ hạn nộp <span className="text-destructive">*</span>
								</label>
								<TimeInput24h
									key={`due-time-${formResetKey}`}
									id="assignment-due-time-input"
									required
									value={dueTime}
									minTimeHHMM={
										due === todayVN
											? formatVietnamTimeHHMM(effectiveNowMs)
											: undefined
									}
									onChange={handleDueTimeChange}
									onInvalidChange={setDueTimeInvalid}
									aria-invalid={
										dueTimeInvalid ||
										dueTimeMissing ||
										(dueDateNotPast && dueTimeValid && !dueTimeNotPast)
									}
									aria-describedby={
										dueErrorMsg || dueOk ? "assignment-due-feedback" : undefined
									}
								/>
							</div>
						</div>
						{dueErrorMsg ? (
							<p
								id="assignment-due-feedback"
								aria-live="polite"
								className="font-medium text-destructive text-xs"
							>
								{dueErrorMsg}
							</p>
						) : dueOk ? (
							<p
								id="assignment-due-feedback"
								data-testid="assignment-due-preview"
								className="text-muted-foreground text-xs"
							>
								Đã hiểu:{" "}
								<strong className="font-medium text-foreground">
									{formatViWeekdayDate(due)} lúc {dueTime}
								</strong>{" "}
								(giờ Việt Nam)
							</p>
						) : null}
					</div>

					{/* Cảnh báo giao lại đề đã giao cho lớp */}
					{isReassign && previousAssignment && (
						<div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-foreground text-xs leading-relaxed">
							Đề này đã giao lớp này, hạn{" "}
							{fmtDueDisplay(previousAssignment.due, previousAssignment.dueAt)}.
							Giao lại sẽ thêm lượt mới cho học viên đã chọn.
						</div>
					)}

					{/* Lời nhắn cho học viên */}
					<div className="flex flex-col gap-1.5">
						<label
							htmlFor="assignment-note-input"
							className="font-medium text-foreground text-xs"
						>
							Nhắn học viên (không bắt buộc)
						</label>
						<textarea
							id="assignment-note-input"
							rows={2}
							value={note}
							onChange={(e) => setNote(e.target.value)}
							placeholder="Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn."
							className={cn(
								inputCls,
								"h-auto min-h-20 resize-y py-2 leading-[1.5]",
							)}
						/>
					</div>

					{/* Danh sách học viên nhận bài */}
					<div className="flex flex-col gap-2">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-1.5">
								<h4 className="font-semibold text-[15px] tracking-tight">
									Học viên nhận bài
								</h4>
								<span className="text-muted-foreground text-xs tabular-nums">
									({visibleSelectedStudentIds.length}/{enrolledStudents.length})
								</span>
							</div>
							{enrolledStudents.length > 0 && (
								<button
									type="button"
									onClick={handleToggleAllStudents}
									className="rounded-xs font-medium text-muted-foreground text-xs outline-none hover:text-foreground focus-visible:shadow-[var(--focus-ring)]"
								>
									{allSelectableSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
								</button>
							)}
						</div>

						{enrolledStudents.length > MAX_STUDENTS_PER_ASSIGN && (
							<p className="text-muted-foreground text-xs">
								Mỗi lượt giao tối đa 100 học viên.
							</p>
						)}

						{enrolledStudents.length === 0 ? (
							<div className="rounded-lg border border-border border-dashed bg-muted/30 p-4 text-center">
								<p className="text-muted-foreground text-xs">
									Lớp chưa có học viên đang học.
								</p>
								{onRequestAddStudent ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="mt-2.5"
										onClick={onRequestAddStudent}
									>
										+ Thêm học viên vào lớp
									</Button>
								) : (
									<p className="mt-1 text-muted-foreground text-xs">
										Mở lại lớp để thêm học viên trước khi giao bài.
									</p>
								)}
							</div>
						) : (
							<div className="flex max-h-52 flex-col divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
								{enrolledStudents.map((s) => {
									const isChecked = visibleSelectedStudentIds.includes(s.id);
									const isDisabled =
										!isChecked &&
										visibleSelectedStudentIds.length >= MAX_STUDENTS_PER_ASSIGN;
									return (
										<label
											key={s.id}
											className={cn(
												"flex items-center gap-3 p-3 transition-colors",
												isDisabled
													? "cursor-not-allowed opacity-50"
													: "cursor-pointer hover:bg-muted/50",
											)}
										>
											<input
												type="checkbox"
												checked={isChecked}
												disabled={isDisabled}
												onChange={(e) =>
													handleStudentToggle(s.id, e.target.checked)
												}
												className="peer sr-only"
											/>
											<span
												aria-hidden="true"
												className={cn(
													"grid size-4 shrink-0 place-items-center rounded-sm border transition-colors peer-focus-visible:shadow-[var(--focus-ring)]",
													isChecked
														? "border-primary bg-primary text-primary-foreground"
														: "border-input bg-background",
												)}
											>
												{isChecked && <Check className="size-3" />}
											</span>
											<Avatar text={s.avatar} size="sm" />
											<span className="min-w-0 truncate font-medium text-foreground text-sm">
												{s.name}
											</span>
										</label>
									);
								})}
							</div>
						)}
					</div>
				</div>
			</div>
		</Modal>
	);
}

/** Nội dung xem trước phía học viên cho đề đang chọn trong Modal. */
function SelectedPromptPreviewContent({
	prompt,
	note,
}: {
	prompt: AssignmentPrompt;
	note: string;
}) {
	const skillId = prompt.skill ?? "writing";
	const partId = prompt.part ?? prompt.task ?? "task2";
	const typeId = prompt.type ?? prompt.genre ?? "";
	const skill = skillOf(skillId);
	const part = partOf(skillId, partId);
	const type = selectedTypeOf(skillId, partId, typeId);
	const isAuto = isAutoSkill(skillId);
	const isSpeakingPart2 = skillId === "speaking" && partId === "part2";
	const questions = prompt.questions ?? [];
	const bankTypeId = isBankableType(skillId, typeId)
		? typeId
		: (questions.find((item) => item.type && isBankableType(skillId, item.type))
				?.type ?? null);
	const bankable = bankTypeId !== null;
	const bank = prompt.optionBank ?? [];
	const bankKind = kindOf(bankTypeId ?? typeId);
	const trimmedImageUrl = prompt.imageUrl?.trim() ?? "";
	const hasValidImage =
		trimmedImageUrl.length > 0 &&
		ASSIGNMENT_IMAGE_SRC_PATTERN.test(trimmedImageUrl);
	const hasPins = questions.some((item) => item.pin);
	const showPlainImage =
		hasValidImage &&
		!hasPins &&
		((skillId === "reading" && typeId === "diagram") ||
			(skillId === "listening" && typeId === "map"));
	const showPinOverlay =
		hasValidImage && hasPins && isImageBased(skillId, typeId);

	return (
		<>
			{skillId === "listening" && (
				<p className="rounded-md bg-muted p-2.5 text-xs">
					🔊{" "}
					{prompt.audioName?.trim() ||
						(prompt.audioUrl?.trim()
							? "Đã đính file nghe"
							: "Chưa đính file nghe")}
				</p>
			)}

			{(skillId === "reading" ||
				skillId === "grammar" ||
				skillId === "vocabulary") &&
				!isEmptyRichText(prompt.passage ?? "") && (
					<RichTextBody
						text={prompt.passage ?? ""}
						className="mt-2 text-foreground text-sm leading-[1.55]"
					/>
				)}

			{showPlainImage && (
				<img
					src={trimmedImageUrl}
					alt={
						skillId === "reading"
							? "Ảnh biểu đồ đề Reading"
							: "Ảnh bản đồ đề Listening"
					}
					className="mt-2 max-h-48 rounded-md border border-border"
					referrerPolicy="no-referrer"
					loading="lazy"
				/>
			)}

			{showPinOverlay && (
				<div className="mt-2">
					<PinOverlay
						imageUrl={trimmedImageUrl}
						items={questions}
						qStart={qStartOf(skillId, partId)}
					/>
				</div>
			)}

			{isAuto && (
				<div className="mt-2 flex flex-col gap-2">
					<p className="font-medium text-foreground text-xs">
						{prompt.writing != null ? "Phần 1 · " : ""}
						{questions.length} câu hỏi
						{type ? ` · ${type.label}` : ""}
					</p>
					{!isEmptyRichText(prompt.intro ?? "") && (
						<RichTextBody
							text={prompt.intro ?? ""}
							className="text-muted-foreground text-xs"
						/>
					)}
					{bankable && (
						<div>
							<OptionBankList bank={bank} kind={bankKind} />
						</div>
					)}
					{questions.map((item, index) => {
						const qNumber = qStartOf(skillId, partId) + index;
						return (
							<div key={`${qNumber}-${item.stem}`} className="text-sm">
								<strong>{qNumber}.</strong>{" "}
								{item.stem.trim() ? (
									<ClozeStemText
										stem={item.stem}
										answer={item.answer}
										typeId={item.type ?? typeId}
										number={qNumber}
									/>
								) : (
									"Câu hỏi sẽ hiện ở đây."
								)}
								{item.opts?.map((option, optionIndex) => (
									<div
										key={`${qNumber}-opt-${optionIndex}-${option}`}
										className="ml-5 text-muted-foreground"
									>
										{String.fromCharCode(65 + optionIndex)} {option}
									</div>
								))}
							</div>
						);
					})}
				</div>
			)}

			{isSpeakingPart2 && (
				<div className="mt-2 text-foreground text-sm">
					<p>Describe {prompt.cueTopic || "the topic"}.</p>
					<p className="mt-1.5 font-medium">You should say:</p>
					<ul className="ml-5 list-disc">
						{(prompt.cuePoints ?? "")
							.split("\n")
							.filter(Boolean)
							.map((point, idx) => (
								<li key={`${idx}-${point}`}>{point}</li>
							))}
					</ul>
				</div>
			)}

			{!isAuto && !isSpeakingPart2 && !isEmptyRichText(prompt.prompt) && (
				<RichTextBody
					text={prompt.prompt}
					legacyWhitespace="pre-wrap"
					className="mt-2 text-foreground text-sm leading-[1.55]"
				/>
			)}

			{prompt.writing != null && (
				<div className="mt-3 border-border border-t pt-2.5 text-sm">
					<p className="font-medium text-foreground text-xs">
						Phần 2 · Writing (
						{prompt.writing.part === "task1" ? "Task 1" : "Task 2"})
					</p>
					{!isEmptyRichText(prompt.writing.prompt) && (
						<RichTextBody
							text={prompt.writing.prompt}
							className="mt-1 text-foreground text-sm leading-[1.55]"
						/>
					)}
				</div>
			)}

			<div className="mt-3 flex flex-wrap gap-2">
				<Tag>{skill.name}</Tag>
				{prompt.writing != null && <Tag>+ Writing</Tag>}
				<Tag>{part.label}</Tag>
				<Tag>{type?.label ?? "Chưa chọn dạng"}</Tag>
				<Tag>{`Band ${prompt.band}`}</Tag>
				{prompt.source.trim() && <Tag>{prompt.source.trim()}</Tag>}
				{isAuto && <Tag>Chấm tự động</Tag>}
				{!isEmptyRichText(prompt.note ?? "") && <Tag>Có hướng dẫn thêm</Tag>}
				{note.trim() && <Tag>Có lời nhắn</Tag>}
			</div>
		</>
	);
}
