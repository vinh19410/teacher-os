import { Link } from "@tanstack/react-router";
import { formatBand, isGradableSkill } from "@teacher-os/api/lib/ielts-band";
import { parseStartDateStrict } from "@teacher-os/api/skeleton";
import { addDaysISO, vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { RichTextBody } from "@teacher-os/ui/components/assignments/rich-text-body";
import { useMemo, useState } from "react";
import {
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
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
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
}

const PICKER_SKILL_OPTIONS = [
	"Tất cả",
	"Writing",
	"Reading",
	"Listening",
	"Speaking",
];

// Nút "Chấm bài" trông như Button primary size sm — `Button` không export
// class variant nên chép tĩnh (Link, không phải button thật).
const GRADE_LINK_BUTTON_CLASS =
	"inline-flex items-center whitespace-nowrap rounded-full bg-accent-blue px-[14px] py-[6px] font-medium text-accent-on text-xs hover:bg-accent-hover focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

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
					className="font-medium text-accent-blue text-xs hover:text-accent-active"
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
				<h2 className="font-display font-semibold text-[22px] text-fg">
					Đã giao bài tập
				</h2>
				<p className="text-muted-fg text-sm">
					“{lastAssigned.promptTitle}” đã giao cho lớp {classGroup.name}. Học
					viên thấy đề và hạn nộp. Chưa có bài nộp.
				</p>

				<ul className="flex flex-col gap-2.5 border-border-soft border-y py-4">
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">Lớp</span>
						<strong className="font-semibold text-fg text-sm">
							{classGroup.name}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">Đề</span>
						<strong className="font-semibold text-fg text-sm">
							{lastAssigned.promptTitle}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">Hạn nộp</span>
						<strong className="font-mono text-fg text-sm">
							{fmtDue(lastAssigned.due)}
						</strong>
					</li>
					<li className="flex items-center justify-between gap-4">
						<span className="text-muted-fg text-sm">Đã nộp</span>
						<strong className="font-mono text-fg text-sm">
							0/{lastAssigned.studentIds.length}
						</strong>
					</li>
				</ul>

				<div className="flex flex-col gap-2">
					<span className="font-mono text-[11px] text-muted-fg uppercase tracking-wider">
						Học viên ({lastAssigned.studentIds.length})
					</span>
					<div className="flex flex-col gap-2">
						{lastAssigned.studentIds.map((sid) => {
							const s = studentById(sid);
							return (
								<div
									key={sid}
									className="flex items-center justify-between rounded-lg border border-border-soft bg-surface/40 p-2.5"
								>
									<div className="flex items-center gap-2.5">
										<Avatar text={s?.avatar ?? "??"} size="sm" />
										<span className="font-medium text-fg text-sm">
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
								className="font-medium text-muted-fg text-xs hover:text-fg"
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
							<div className="rounded-lg border border-border-soft bg-surface/50 p-6 text-center text-muted-fg text-sm">
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
													? "border-fg bg-surface shadow-xs ring-1 ring-fg"
													: "border-line bg-bg hover:border-fg/60 hover:bg-surface/50",
											)}
										>
											<div className="flex items-start justify-between gap-2">
												<strong className="font-display font-semibold text-fg text-sm">
													{p.title}
												</strong>
												<span className="shrink-0 font-mono text-meta text-xs">
													{part.label} · Band {p.band}
												</span>
											</div>
											<div className="flex flex-wrap items-center gap-2 text-xs">
												<Tag>{skill.name}</Tag>
												{isAlreadyAssigned ? (
													<StatusTag tone="used">Đã giao lớp này</StatusTag>
												) : (
													<StatusTag tone="ok">Sẵn sàng</StatusTag>
												)}
												{p.source.trim() && (
													<span className="truncate text-meta">
														{p.source.trim()}
													</span>
												)}
											</div>
										</button>
									);
								})}
							</div>
						)}

						<p className="text-[11px] text-muted-fg">
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
								<h2 className="mt-1 font-display font-semibold text-[20px] text-fg">
									Hạn nộp và học viên
								</h2>
							</div>

							{/* Due Date */}
							<div className="flex flex-col gap-1.5">
								<label
									htmlFor="assignment-due-input"
									className="font-medium text-fg text-xs"
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
									className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg text-sm focus:border-fg focus:outline-none"
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
									className="font-medium text-muted-fg text-xs"
								>
									Nhắn học viên (không bắt buộc)
								</label>
								<textarea
									id="assignment-note-input"
									rows={2}
									value={note}
									onChange={(e) => setNote(e.target.value)}
									placeholder="Ví dụ: nộp trước buổi T5, lập dàn ý 4 đoạn."
									className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg text-sm placeholder:text-muted-fg focus:border-fg focus:outline-none"
								/>
							</div>

							{/* Student Checklist */}
							<div className="flex flex-col gap-2">
								<div className="flex items-center justify-between gap-2">
									<SectionLabel>Học viên trong lớp</SectionLabel>
									<button
										type="button"
										onClick={handleToggleAllStudents}
										className="font-medium text-muted-fg text-xs hover:text-fg"
									>
										{selectedStudentIds.length === enrolledStudents.length
											? "Bỏ chọn tất cả"
											: "Chọn tất cả"}
									</button>
								</div>

								{enrolledStudents.length === 0 ? (
									<p className="text-muted-fg text-xs">
										Lớp chưa có học viên nào.
									</p>
								) : (
									<div className="flex flex-col divide-y divide-border-soft rounded-lg border border-border-soft">
										{enrolledStudents.map((s) => {
											const isChecked = selectedStudentIds.includes(s.id);
											return (
												<label
													key={s.id}
													className="flex cursor-pointer items-center justify-between p-3 hover:bg-surface/50"
												>
													<div className="flex items-center gap-3">
														<input
															type="checkbox"
															checked={isChecked}
															onChange={(e) =>
																handleStudentToggle(s.id, e.target.checked)
															}
															className="h-4 w-4 rounded-sm border-line text-accent focus:ring-accent"
														/>
														<Avatar text={s.avatar} size="sm" />
														<span className="font-medium text-fg text-sm">
															{s.name}
														</span>
													</div>
													<span className="font-mono text-meta text-xs">
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
								<div className="rounded-md border border-warn/40 bg-warn-soft p-3 text-fg-2 text-xs leading-relaxed">
									Đề này đã giao lớp này, hạn {fmtDue(previousAssignment.due)}.
									Giao lại sẽ thêm lượt mới cho học viên đã chọn.
								</div>
							)}
						</Card>

						{/* Live Preview Paper */}
						<div className="rounded-lg border border-line bg-surface-warm p-5">
							<p className="font-mono text-[11px] text-muted-fg uppercase tracking-[0.08em]">
								Xem trước phía học viên
							</p>
							<p className="mt-1 font-display font-semibold text-[17px] text-fg">
								{selectedPrompt ? selectedPrompt.title : "Chọn một đề"}
							</p>
							<p className="mt-1.5 font-mono text-meta text-xs">
								{selectedPrompt && previewPart
									? `${previewPart.spec} · hạn ${fmtDue(due)}`
									: `hạn ${fmtDue(due)}`}
							</p>
							{selectedPrompt ? (
								// This surface showed the raw string with pre-wrap —
								// legacy plain rows keep that exact whitespace behavior.
								<RichTextBody
									text={
										selectedPrompt.skill === "reading"
											? (selectedPrompt.passage ?? selectedPrompt.prompt)
											: selectedPrompt.prompt
									}
									legacyWhitespace="pre-wrap"
									className="mt-3 text-fg text-sm leading-[1.55]"
								/>
							) : (
								<p className="mt-3 text-fg text-sm leading-[1.55]">
									Đề sẽ hiện khi bạn chọn từ ngân hàng.
								</p>
							)}
							{selectedPrompt && previewType && (
								<div className="mt-3 flex flex-wrap gap-2">
									{previewSkill && <Tag>{previewSkill.name}</Tag>}
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
				<div className="fixed inset-x-0 bottom-0 z-20 border-line border-t bg-bg/95 p-4 shadow-lg backdrop-blur-sm">
					<div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
						{/* Left: Action copy */}
						<div className="flex flex-col">
							<strong className="font-display font-semibold text-fg text-sm">
								{actionState.title}
							</strong>
							<span className="text-muted-fg text-xs">{actionState.sub}</span>
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
		<div className="flex flex-col gap-4">
			{/* Section Header */}
			<div className="flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<SectionLabel>Bài đã giao lớp này</SectionLabel>
					<span id="assign-summary" className="font-mono text-meta text-xs">
						{summaryText}
					</span>
				</div>
				<Button
					id="list-assign-btn"
					variant="ghost"
					size="sm"
					onClick={() => onViewChange("assign")}
				>
					Giao thêm đề
				</Button>
			</div>

			{/* Empty or List */}
			{classAssignments.length === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<p className="text-muted-fg text-sm">
						Chưa giao bài nào cho lớp này.
					</p>
					<div className="mt-4 flex justify-center">
						<Button onClick={() => onViewChange("assign")}>Giao bài tập</Button>
					</div>
				</Card>
			) : (
				<div id="assigned-list" className="flex flex-col gap-3">
					{classAssignments.map((ca) => {
						const rollup = rollupStatus(ca, todayVN);
						const doneCount = ca.targets.filter(
							(t) => t.submittedAt !== null,
						).length;
						const skill =
							data.assignmentPrompts?.find((p) => p.id === ca.promptId)
								?.skill ?? "";
						const gradable = isGradableSkill(skill);

						return (
							<article
								key={ca.id}
								aria-label={`${doneCount} trên ${ca.targets.length} đã nộp`}
								className="assign-item rounded-xl border border-line bg-card p-5"
							>
								{/* Item Header */}
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="flex flex-col gap-1">
										<h3 className="assign-item-title font-display font-semibold text-[16px] text-fg">
											{ca.title}
										</h3>
										<p className="font-mono text-meta text-xs">
											Hạn {fmtDue(ca.due)} · {doneCount}/{ca.targets.length} đã
											nộp
										</p>
									</div>
									<StatusTag tone={rollup.tone}>{rollup.label}</StatusTag>
								</div>

								{/* Sub-rows for each student target */}
								<div className="sub-list mt-4 flex flex-col divide-y divide-border-soft border-border-soft border-t">
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
												className="sub-row flex items-center justify-between py-2.5"
											>
												<div className="flex items-center gap-2.5">
													<Avatar text={s?.avatar ?? "??"} size="sm" />
													<strong className="font-medium text-fg text-sm">
														{s?.name ?? target.studentId}
													</strong>
												</div>
												<div className="flex items-center gap-3">
													<span className="font-mono text-meta text-xs">
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
							</article>
						);
					})}
				</div>
			)}
		</div>
	);
}
