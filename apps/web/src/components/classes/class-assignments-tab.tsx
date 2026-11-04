import { Link } from "@tanstack/react-router";
import {
	formatBand,
	hasGradableTask,
	isGradableSkill,
} from "@teacher-os/api/lib/ielts-band";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { BookOpen, ChevronDown, Headphones, Mic, PenLine } from "lucide-react";
import { type ComponentType, useMemo, useState } from "react";
import {
	isAutoSkill,
	partOf,
	type SkillId,
	skillOf,
	typeOf,
} from "@/components/assignments/assignment-presets";
import {
	fmtDue,
	fmtWhen,
	rollupStatus,
	studentSubmissionStatus,
} from "@/components/assignments/assignment-status";
import { StatusTag } from "@/components/assignments/status-tag";
import { KernelSubmitNotice } from "@/components/modals/kernel-submit-notice";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { Section } from "@/components/ui/section";
import { SectionLabel } from "@/components/ui/section-label";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type { ClassAssignment, ClassGroup, Student } from "@/lib/mock-data";
import { useKernelFormSubmit } from "@/lib/use-kernel-form-submit";

export interface ClassAssignmentsTabProps {
	classGroup: ClassGroup;
	view: "list" | "assign" | "success";
	onViewChange: (view: "list" | "assign" | "success") => void;
	/** #319: vào bằng `?tab=assignments` từ trang chấm — mở sẵn toàn bộ item. */
	assignmentsFocus?: boolean;
}

const PICKER_SKILL_OPTIONS = [
	"Tất cả",
	"Writing",
	"Reading",
	"Listening",
	"Speaking",
	"Grammar",
	"Vocabulary",
];

/** Icon kỹ năng cho header accordion bài đã giao (#391, design SKILL_ICON);
 * kỹ năng lạ rơi về BookOpen. Không có data thanh kỹ năng theo học viên nên
 * chỉ dùng ở mức icon. */
const SKILL_ICON: Record<string, ComponentType<{ className?: string }>> = {
	writing: PenLine,
	reading: BookOpen,
	listening: Headphones,
	speaking: Mic,
	grammar: BookOpen,
	vocabulary: BookOpen,
};

/** Nút "Chấm bài" (Link, không phải button thật) — outline `size=sm` của
 * design v2 (#391, thay bản chép tay kiểu v1). */
const GRADE_LINK_BUTTON_CLASS = buttonVariants({
	variant: "outline",
	size: "sm",
});

/** Phần chấm tay (#319) của một target đã nộp đề Writing/Speaking: đã chấm
 * → tag band + link sửa điểm; chưa chấm → nút "Chấm bài". Target chưa có
 * attempt (chưa nộp) không render gì. */
function TargetGradeActions({
	target,
	studentName,
}: {
	target: ClassAssignment["targets"][number];
	studentName: string;
}) {
	if (!target.attemptId) return null;
	if (target.band != null && target.gradedAt) {
		return (
			<>
				<StatusTag tone="ok">
					{`Đã chấm · Band ${formatBand(target.band)}`}
				</StatusTag>
				<Link
					to="/grading/$attemptId"
					params={{ attemptId: target.attemptId }}
					className="font-medium text-primary text-xs hover:text-primary"
				>
					Xem / sửa điểm
				</Link>
			</>
		);
	}
	return (
		<Link
			to="/grading/$attemptId"
			params={{ attemptId: target.attemptId }}
			aria-label={`Chấm bài của ${studentName}`}
			className={GRADE_LINK_BUTTON_CLASS}
		>
			Chấm bài
		</Link>
	);
}

export function ClassAssignmentsTab({
	classGroup,
	view,
	onViewChange,
	assignmentsFocus = false,
}: ClassAssignmentsTabProps) {
	const { data, studentById } = useData();
	const submit = useKernelFormSubmit();
	const todayVN = vietnamTodayISO();

	// Class assignments for this specific class
	const classAssignments = useMemo(() => {
		return (data.classAssignments ?? [])
			.filter((ca) => ca.classId === classGroup.id)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [data.classAssignments, classGroup.id]);

	/**
	 * Accordion (#391): mặc định mở item có bài đã nộp chờ chấm (fallback:
	 * item đầu) như design mở 1 item; `assignmentsFocus` (#319 — vào từ trang
	 * chấm) mở toàn bộ. Toggle của người dùng đè default.
	 */
	const defaultOpenIds = useMemo(() => {
		if (assignmentsFocus) {
			return new Set(classAssignments.map((ca) => ca.id));
		}
		const firstPending = classAssignments.find((ca) =>
			ca.targets.some(
				(t) => t.submittedAt !== null && !(t.band != null && t.gradedAt),
			),
		);
		const first = firstPending ?? classAssignments[0];
		return first ? new Set([first.id]) : new Set<string>();
	}, [classAssignments, assignmentsFocus]);
	const [userOpenIds, setUserOpenIds] = useState<Set<string> | null>(null);
	const toggleItem = (id: string) => {
		const base = new Set(userOpenIds ?? defaultOpenIds);
		if (base.has(id)) {
			base.delete(id);
		} else {
			base.add(id);
		}
		setUserOpenIds(base);
	};

	// Enrolled students in this class
	const enrolledStudents = useMemo(() => {
		return classGroup.studentIds
			.map(studentById)
			.filter((s): s is Student => s !== undefined);
	}, [classGroup.studentIds, studentById]);

	// Assign form state
	const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
	const [skillFilter, setSkillFilter] = useState<"all" | SkillId>("all");
	const [due, setDue] = useState<string>(() => addDaysISO(todayVN, 7));
	const [note, setNote] = useState("");
	const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>(() =>
		classGroup.studentIds.slice(0, 100),
	);
	const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
	const [lastAssigned, setLastAssigned] = useState<{
		promptTitle: string;
		due: string;
		studentIds: string[];
	} | null>(null);

	// Ready prompts for picker
	const readyPrompts = useMemo(() => {
		return data.assignmentPrompts.filter((p) => {
			if (p.status !== "ready") return false;
			const pSkill = p.skill ?? "writing";
			if (skillFilter !== "all" && pSkill !== skillFilter) return false;
			return true;
		});
	}, [data.assignmentPrompts, skillFilter]);

	// Previously assigned prompt IDs in this class
	const assignedPromptIds = useMemo(() => {
		return new Set(classAssignments.map((ca) => ca.promptId));
	}, [classAssignments]);

	const selectedPrompt = useMemo(() => {
		if (!selectedPromptId) return null;
		return (
			data.assignmentPrompts.find(
				(p) => p.id === selectedPromptId && p.status === "ready",
			) ?? null
		);
	}, [data.assignmentPrompts, selectedPromptId]);

	// Reassign check
	const previousAssignment = useMemo(() => {
		if (!selectedPromptId) return null;
		return (
			classAssignments.find((ca) => ca.promptId === selectedPromptId) ?? null
		);
	}, [classAssignments, selectedPromptId]);

	// Validation
	const promptOk = Boolean(selectedPrompt);
	const dueValidDate = Boolean(due && parseStartDateStrict(due) !== null);
	const dueNotPast = dueValidDate && due >= todayVN;
	const dueOk = dueValidDate && dueNotPast;
	const studentsOk =
		selectedStudentIds.length > 0 && selectedStudentIds.length <= 100;
	const isReassign = promptOk && previousAssignment !== null;
	const canSubmit = promptOk && dueOk && studentsOk;

	// Toggle all students
	function handleToggleAllStudents() {
		if (selectedStudentIds.length === enrolledStudents.length) {
			setSelectedStudentIds([]);
		} else {
			setSelectedStudentIds(enrolledStudents.map((s) => s.id).slice(0, 100));
		}
	}

	function handleStudentToggle(studentId: string, checked: boolean) {
		if (checked) {
			if (selectedStudentIds.length >= 100) return;
			setSelectedStudentIds((prev) => [...prev, studentId]);
		} else {
			setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
		}
	}

	function handleSkillChipChange(opt: string) {
		if (opt === "Writing") setSkillFilter("writing");
		else if (opt === "Reading") setSkillFilter("reading");
		else if (opt === "Listening") setSkillFilter("listening");
		else if (opt === "Speaking") setSkillFilter("speaking");
		else if (opt === "Grammar") setSkillFilter("grammar");
		else if (opt === "Vocabulary") setSkillFilter("vocabulary");
		else setSkillFilter("all");
	}

	const selectedSkillChip =
		skillFilter === "writing"
			? "Writing"
			: skillFilter === "reading"
				? "Reading"
				: skillFilter === "listening"
					? "Listening"
					: skillFilter === "speaking"
						? "Speaking"
						: skillFilter === "grammar"
							? "Grammar"
							: skillFilter === "vocabulary"
								? "Vocabulary"
								: "Tất cả";
	// Action bar copy
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
			return {
				title: "Thiếu hạn nộp",
				sub: `Hạn phải từ hôm nay (${fmtDue(todayVN)}) trở đi.`,
			};
		}
		return {
			title: `Giao cho ${selectedStudentIds.length} học viên`,
			sub: `${selectedPrompt?.title} · hạn ${fmtDue(due)}`,
		};
	}, [
		promptOk,
		studentsOk,
		dueOk,
		todayVN,
		selectedStudentIds.length,
		selectedPrompt,
		due,
	]);

	async function handleSubmit() {
		setHasAttemptedSubmit(true);
		if (!canSubmit || !selectedPrompt) return;

		const result = await submit.run({
			type: "assign-class-prompt",
			payload: {
				classId: classGroup.id,
				promptId: selectedPrompt.id,
				due,
				note: note.trim(),
				studentIds: selectedStudentIds,
			},
		});

		if (result?.kind === "refreshed") {
			setLastAssigned({
				promptTitle: selectedPrompt.title,
				due,
				studentIds: selectedStudentIds,
			});
			onViewChange("success");
		}
	}

	function handleResetToAssign() {
		setSelectedPromptId(null);
		setSkillFilter("all");
		setDue(addDaysISO(todayVN, 7));
		setNote("");
		setSelectedStudentIds(enrolledStudents.map((s) => s.id).slice(0, 100));
		setHasAttemptedSubmit(false);
		onViewChange("assign");
	}

	async function handleReconcile() {
		await submit.reconcile();
	}

	// --------------------------------------------------------------------------
	// 1. VIEW: SUCCESS
	// --------------------------------------------------------------------------
	if (view === "success" && lastAssigned) {
		return (
			<Card
				variant="white"
				className="mx-auto flex max-w-xl flex-col gap-5 p-8"
			>
				<div
					aria-hidden="true"
					className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"
				>
					<svg
						aria-hidden="true"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
					>
						<path d="M5 12l5 5L20 7" />
					</svg>
				</div>
				<h2 className="font-semibold text-[22px] text-foreground">
					Đã giao bài tập
				</h2>
				<p className="text-muted-foreground text-sm">
					“{lastAssigned.promptTitle}” đã giao cho lớp {classGroup.name}. Học
					viên thấy đề và hạn nộp. Chưa có bài nộp.
				</p>

				<ul className="flex flex-col gap-2.5 border-border-soft border-y py-4">
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-sm">Lớp</span>
						<strong className="font-semibold text-foreground text-sm">
							{classGroup.name}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-sm">Đề</span>
						<strong className="font-semibold text-foreground text-sm">
							{lastAssigned.promptTitle}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-sm">Hạn nộp</span>
						<strong className="text-foreground text-sm">
							{fmtDue(lastAssigned.due)}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-foreground text-sm">Đã nộp</span>
						<strong className="text-foreground text-sm">
							0/{lastAssigned.studentIds.length}
						</strong>
					</li>
				</ul>

				<div className="flex flex-col gap-2">
					<span className="text-muted-foreground text-sm">
						Học viên ({lastAssigned.studentIds.length})
					</span>
					<div className="flex flex-col gap-2">
						{lastAssigned.studentIds.map((sid) => {
							const s = studentById(sid);
							return (
								<div
									key={sid}
									className="flex items-center justify-between rounded-lg border border-border-soft bg-muted/40 p-2.5"
								>
									<div className="flex items-center gap-2.5">
										<Avatar text={s?.avatar ?? "??"} size="sm" />
										<span className="font-medium text-foreground text-sm">
											{s?.name ?? sid}
										</span>
									</div>
									<StatusTag tone="neutral">Chưa nộp</StatusTag>
								</div>
							);
						})}
					</div>
				</div>

				<div className="flex flex-wrap gap-3 pt-2">
					<Button variant="secondary" onClick={handleResetToAssign}>
						Giao đề khác
					</Button>
					<Button variant="ghost" onClick={() => onViewChange("list")}>
						Xem bài đã giao
					</Button>
				</div>
			</Card>
		);
	}

	// --------------------------------------------------------------------------
	// 2. VIEW: ASSIGN FORM
	// --------------------------------------------------------------------------
	if (view === "assign") {
		const previewSkill = selectedPrompt
			? skillOf(selectedPrompt.skill ?? "writing")
			: null;
		const previewPart = selectedPrompt
			? partOf(
					selectedPrompt.skill ?? "writing",
					selectedPrompt.part ?? selectedPrompt.task,
				)
			: null;
		const previewType = selectedPrompt
			? typeOf(
					selectedPrompt.skill ?? "writing",
					selectedPrompt.part ?? selectedPrompt.task,
					selectedPrompt.type ?? selectedPrompt.genre,
				)
			: null;

		return (
			<div className="flex flex-col gap-6 pb-28">
				<div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
					{/* Left: Picker Card */}
					<Card variant="white" className="flex flex-col gap-4 p-5">
						<div className="flex items-center justify-between gap-2">
							<SectionLabel>Đề sẵn sàng</SectionLabel>
							<Link
								to="/assignments/new"
								className="font-medium text-muted-foreground text-xs hover:text-foreground"
							>
								Thêm đề mới
							</Link>
						</div>

						{/* Filter chips */}
						<ChipFilter
							options={PICKER_SKILL_OPTIONS}
							value={selectedSkillChip}
							onChange={handleSkillChipChange}
						/>

						{/* Prompt Cards */}
						{readyPrompts.length === 0 ? (
							<div className="rounded-lg border border-border-soft bg-muted/50 p-6 text-center text-muted-foreground text-sm">
								Không có đề{" "}
								{selectedSkillChip !== "Tất cả" ? `${selectedSkillChip} ` : ""}
								sẵn sàng.
							</div>
						) : (
							<div
								role="radiogroup"
								aria-label="Chọn đề"
								className="flex flex-col gap-2"
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
											onClick={() => setSelectedPromptId(p.id)}
											className={cn(
												"flex flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-all duration-150",
												isSelected
													? "border-primary bg-muted shadow-xs ring-1 ring-fg"
													: "border-border bg-background hover:border-primary/60 hover:bg-muted/50",
											)}
										>
											<div className="flex items-start justify-between gap-2">
												<strong className="font-semibold text-foreground text-sm">
													{p.title}
												</strong>
												<span className="shrink-0 text-muted-foreground text-xs">
													{part.label} · Band {p.band}
												</span>
											</div>
											<div className="flex flex-wrap items-center gap-2 text-xs">
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
											</div>
										</button>
									);
								})}
							</div>
						)}

						<p className="text-[11px] text-muted-foreground">
							Bản nháp không hiện ở đây. Sửa trong ngân hàng rồi mới giao.
						</p>
						{hasAttemptedSubmit && !promptOk && (
							<p className="font-medium text-danger text-xs">
								Chọn một đề sẵn sàng trước khi giao.
							</p>
						)}
					</Card>

					{/* Right: Targets + Preview */}
					<div className="flex flex-col gap-6">
						{/* Target Card */}
						<Card variant="white" className="flex flex-col gap-5 p-5">
							<div>
								<SectionLabel>Giao cho lớp này</SectionLabel>
								<h2 className="mt-1 font-semibold text-[20px] text-foreground">
									Hạn nộp và học viên
								</h2>
							</div>

							{/* Due Date */}
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="assignment-due-input"
									className="font-medium text-foreground text-xs"
								>
									Hạn nộp <span className="text-danger">*</span>
								</label>
								<input
									id="assignment-due-input"
									type="date"
									required
									min={todayVN}
									value={due}
									onChange={(e) => setDue(e.target.value)}
									className="w-full rounded-md border border-border bg-muted px-3 py-2 text-foreground text-sm focus:border-primary focus:outline-none"
								/>
								{hasAttemptedSubmit && !dueOk && (
									<p className="font-medium text-danger text-xs">
										Chọn hạn nộp từ hôm nay trở đi.
									</p>
								)}
							</div>

							{/* Message / Note */}
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="assignment-note-input"
									className="font-medium text-muted-foreground text-xs"
								>
									Nhắn học viên (không bắt buộc)
								</label>
								<textarea
									id="assignment-note-input"
									rows={2}
									value={note}
									onChange={(e) => setNote(e.target.value)}
									placeholder="Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn."
									className="w-full rounded-md border border-border bg-muted px-3 py-2 text-foreground text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
								/>
							</div>

							{/* Student Checklist */}
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between gap-2">
									<SectionLabel>Học viên trong lớp</SectionLabel>
									<button
										type="button"
										onClick={handleToggleAllStudents}
										className="font-medium text-muted-foreground text-xs hover:text-foreground"
									>
										{selectedStudentIds.length === enrolledStudents.length
											? "Bỏ chọn tất cả"
											: "Chọn tất cả"}
									</button>
								</div>

								{enrolledStudents.length === 0 ? (
									<p className="text-muted-foreground text-xs">
										Lớp chưa có học viên nào.
									</p>
								) : (
									<div className="flex flex-col divide-y divide-border-soft rounded-lg border border-border-soft">
										{enrolledStudents.map((s) => {
											const isChecked = selectedStudentIds.includes(s.id);
											return (
												<label
													key={s.id}
													className="flex cursor-pointer items-center justify-between p-3 hover:bg-muted/50"
												>
													<div className="flex items-center gap-3">
														<input
															type="checkbox"
															checked={isChecked}
															onChange={(e) =>
																handleStudentToggle(s.id, e.target.checked)
															}
															className="h-4 w-4 rounded-sm border-border text-primary focus:ring-primary"
														/>
														<Avatar text={s.avatar} size="sm" />
														<span className="font-medium text-foreground text-sm">
															{s.name}
														</span>
													</div>
													<span className="text-muted-foreground text-xs">
														{s.phone}
													</span>
												</label>
											);
										})}
									</div>
								)}

								{hasAttemptedSubmit && !studentsOk && (
									<p className="font-medium text-danger text-xs">
										Chọn ít nhất một học viên.
									</p>
								)}
							</div>

							{/* Reassign Warning Note */}
							{isReassign && previousAssignment && (
								<div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-muted-foreground text-xs leading-relaxed">
									Đề này đã giao lớp này, hạn {fmtDue(previousAssignment.due)}.
									Giao lại sẽ thêm lượt mới cho học viên đã chọn.
								</div>
							)}
						</Card>

						{/* Live Preview Paper */}
						<div className="rounded-lg border border-border bg-muted/40 p-5">
							<p className="text-muted-foreground text-sm">
								Xem trước phía học viên
							</p>
							<p className="mt-1 font-semibold text-[17px] text-foreground">
								{selectedPrompt ? selectedPrompt.title : "Chọn một đề"}
							</p>
							<p className="mt-1.5 text-muted-foreground text-xs">
								{selectedPrompt && previewPart
									? `${previewPart.spec} · hạn ${fmtDue(due)}`
									: `hạn ${fmtDue(due)}`}
							</p>
							{selectedPrompt ? (
								<>
									{isAutoSkill(selectedPrompt.skill ?? "writing") && (
										<p className="mt-3 font-medium text-foreground text-xs">
											Phần 1 · {(selectedPrompt.questions ?? []).length} câu hỏi
											trắc nghiệm
										</p>
									)}
									{!isEmptyRichText(
										isAutoSkill(selectedPrompt.skill ?? "writing")
											? (selectedPrompt.passage ?? "")
											: selectedPrompt.prompt,
									) && (
										<RichTextBody
											text={
												isAutoSkill(selectedPrompt.skill ?? "writing")
													? (selectedPrompt.passage ?? "")
													: selectedPrompt.prompt
											}
											legacyWhitespace="pre-wrap"
											className="mt-2 text-foreground text-sm leading-[1.55]"
										/>
									)}
									{selectedPrompt.writing != null && (
										<div className="mt-3 border-border border-t pt-2.5 text-sm">
											<p className="font-medium text-foreground text-xs">
												Phần 2 · Writing (
												{selectedPrompt.writing.part === "task1"
													? "Task 1"
													: "Task 2"}
												)
											</p>
											<RichTextBody
												text={selectedPrompt.writing.prompt}
												className="mt-1 text-foreground text-sm leading-[1.55]"
											/>
										</div>
									)}
								</>
							) : (
								<p className="mt-3 text-foreground text-sm leading-[1.55]">
									Đề sẽ hiện khi bạn chọn từ ngân hàng.
								</p>
							)}
							{selectedPrompt && previewType && (
								<div className="mt-3 flex flex-wrap gap-2">
									{previewSkill && <Tag>{previewSkill.name}</Tag>}
									{selectedPrompt.writing != null && <Tag>+ Writing</Tag>}
									{previewPart && <Tag>{previewPart.label}</Tag>}
									<Tag>{previewType.label}</Tag>
									<Tag>{`Band ${selectedPrompt.band}`}</Tag>
									{selectedPrompt.source.trim() && (
										<Tag>{selectedPrompt.source.trim()}</Tag>
									)}
									{note.trim() && <Tag>Có lời nhắn</Tag>}
								</div>
							)}
						</div>
					</div>
				</div>

				{/* Sticky Action Bar */}
				<div className="fixed inset-x-0 bottom-0 z-20 border-border border-t bg-background/95 p-4 shadow-lg backdrop-blur-sm">
					<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
						{/* Left: Action copy */}
						<div className="flex flex-col">
							<strong className="font-semibold text-foreground text-sm">
								{actionState.title}
							</strong>
							<span className="text-muted-foreground text-xs">
								{actionState.sub}
							</span>
						</div>

						{/* Right: Buttons + Submit Notice */}
						<div className="flex items-center gap-3">
							{submit.notice && (
								<KernelSubmitNotice
									notice={submit.notice}
									onReconcile={handleReconcile}
									disabled={submit.saving}
								/>
							)}
							<Button
								onClick={handleSubmit}
								disabled={!canSubmit || submit.saving}
								className={cn(!canSubmit && "cursor-not-allowed opacity-40")}
							>
								Giao bài tập
							</Button>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// --------------------------------------------------------------------------
	// 3. VIEW: LIST
	// --------------------------------------------------------------------------
	const totalTargetsCount = classAssignments.reduce(
		(acc, ca) => acc + ca.targets.length,
		0,
	);
	const doneTargetsCount = classAssignments.reduce(
		(acc, ca) => acc + ca.targets.filter((t) => t.submittedAt !== null).length,
		0,
	);
	const summaryText =
		classAssignments.length === 0
			? "Chưa giao bài"
			: `${doneTargetsCount}/${totalTargetsCount} đã nộp`;

	return (
		<Section
			title={
				<>
					Bài đã giao lớp này{" "}
					<span
						id="assign-summary"
						className="font-normal text-muted-foreground text-xs"
					>
						{summaryText}
					</span>
				</>
			}
			count={classAssignments.length}
			action={
				<Button
					id="list-assign-btn"
					variant="ghost"
					size="sm"
					onClick={() => onViewChange("assign")}
				>
					Giao thêm đề
				</Button>
			}
		>
			{classAssignments.length === 0 ? (
				<div className="rounded-lg border border-dashed p-6 text-center">
					<p className="text-muted-foreground text-sm">
						Chưa giao bài nào cho lớp này.
					</p>
					<div className="mt-4 flex justify-center">
						<Button size="sm" onClick={() => onViewChange("assign")}>
							Giao bài tập
						</Button>
					</div>
				</div>
			) : (
				<div id="assigned-list" className="flex flex-col gap-2">
					{classAssignments.map((ca) => {
						const rollup = rollupStatus(ca, todayVN);
						const doneCount = ca.targets.filter(
							(t) => t.submittedAt !== null,
						).length;
						const promptRow = data.assignmentPrompts?.find(
							(p) => p.id === ca.promptId,
						);
						const skill = promptRow?.skill ?? "";
						const gradable = promptRow
							? hasGradableTask(promptRow)
							: isGradableSkill(skill);
						const SkillIcon = SKILL_ICON[skill] ?? BookOpen;
						const open = (userOpenIds ?? defaultOpenIds).has(ca.id);
						const pctDone =
							ca.targets.length > 0
								? Math.round((doneCount / ca.targets.length) * 100)
								: 0;

						return (
							<article
								key={ca.id}
								aria-label={`${doneCount} trên ${ca.targets.length} đã nộp`}
								className="assign-item rounded-lg border"
							>
								<button
									type="button"
									aria-expanded={open}
									onClick={() => toggleItem(ca.id)}
									className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
								>
									<span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
										<SkillIcon className="size-4" />
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium text-sm">
											{ca.title}
										</span>
										<span className="block text-muted-foreground text-xs">
											Hạn {fmtDue(ca.due)} ·{" "}
											<span
												className={cn(
													"tabular-nums",
													doneCount === ca.targets.length
														? "text-success"
														: doneCount === 0 && "text-warn",
												)}
											>
												{doneCount}/{ca.targets.length} đã nộp
											</span>
										</span>
									</span>
									{promptRow?.writing != null && <Tag>+ Writing</Tag>}
									<StatusTag tone={rollup.tone}>{rollup.label}</StatusTag>
									<span className="hidden w-24 sm:block">
										<span className="block h-1.5 overflow-hidden rounded-full bg-muted">
											<span
												className="block h-full rounded-full bg-success"
												style={{ width: `${pctDone}%` }}
											/>
										</span>
									</span>
									<ChevronDown
										className={cn(
											"size-4 shrink-0 text-muted-foreground transition-transform",
											open && "rotate-180",
										)}
									/>
								</button>
								{open && (
									<div
										id={`assign-body-${ca.id}`}
										className="sub-list divide-y divide-border-soft border-border-soft border-t"
									>
										{ca.targets.map((target) => {
											const s = studentById(target.studentId);
											const sub = studentSubmissionStatus(
												target,
												ca.due,
												todayVN,
											);
											return (
												<div
													key={target.studentId}
													className="sub-row flex items-center justify-between px-4 py-2.5"
												>
													<div className="flex items-center gap-2.5">
														<Avatar text={s?.avatar ?? "??"} size="sm" />
														<strong className="font-medium text-foreground text-sm">
															{s?.name ?? target.studentId}
														</strong>
													</div>
													<div className="flex items-center gap-3">
														<span className="text-muted-foreground text-xs">
															{target.submittedAt
																? fmtWhen(target.submittedAt)
																: "Chưa có bài nộp"}
														</span>
														<StatusTag tone={sub.tone}>{sub.label}</StatusTag>
														{gradable && (
															<TargetGradeActions
																target={target}
																studentName={s?.name ?? target.studentId}
															/>
														)}
													</div>
												</div>
											);
										})}
									</div>
								)}
							</article>
						);
					})}
				</div>
			)}
		</Section>
	);
}
