import { Link } from "@tanstack/react-router";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import { vietnamTodayISO } from "@teacher-os/api/vietnam-date";
import { Copy, Pencil, Send, Trash2, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type {
	AssignmentPrompt,
	ClassAssignment,
	ClassGroup,
} from "@/lib/mock-data";
import {
	buildHistoryItemView,
	fmtBandDisplay,
	promptSkillPartType,
} from "./assignment-bank-helpers";
import {
	isAutoSkill,
	partOf,
	selectedTypeOf,
	skillOf,
} from "./assignment-presets";
import { fmtDayMonth, promptStatus } from "./assignment-status";
import {
	PromptStatusBadge,
	type PromptStatusBadgeTone,
} from "./prompt-status-badge";
import { PromptStudentPaper } from "./prompt-student-paper";

const DRAWER_FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type PreviewTabKey = "prompt" | "history";

export interface PromptPreviewPanelProps {
	prompt: AssignmentPrompt | null;
	classAssignments: readonly ClassAssignment[];
	classes: readonly ClassGroup[];
	activeTab: PreviewTabKey;
	onTabChange: (tab: PreviewTabKey) => void;
	isWide: boolean;
	drawerOpen: boolean;
	onCloseDrawer: () => void;
	canManage: boolean;
	duplicating: boolean;
	onAssign: (prompt: AssignmentPrompt) => void;
	onEdit: (prompt: AssignmentPrompt) => void;
	onPreviewFull: (prompt: AssignmentPrompt) => void;
	onDuplicate: (prompt: AssignmentPrompt) => void;
	onDeleteDraft: (prompt: AssignmentPrompt) => void;
}

export function PromptPreviewPanel({
	prompt,
	classAssignments,
	classes,
	activeTab,
	onTabChange,
	isWide,
	drawerOpen,
	onCloseDrawer,
	canManage,
	duplicating,
	onAssign,
	onEdit,
	onPreviewFull,
	onDuplicate,
	onDeleteDraft,
}: PromptPreviewPanelProps) {
	const tabPromptId = useId();
	const tabHistoryId = useId();
	const panelId = useId();
	const drawerRef = useRef<HTMLDivElement>(null);
	const closeBtnRef = useRef<HTMLButtonElement>(null);
	const tabPromptRef = useRef<HTMLButtonElement>(null);
	const tabHistoryRef = useRef<HTMLButtonElement>(null);
	const wasDrawerOpenRef = useRef(false);
	const [snapshotNowMs, setSnapshotNowMs] = useState(() => Date.now());
	const selectedPromptId = prompt?.id ?? null;

	useEffect(() => {
		if (!selectedPromptId && activeTab !== "history") return;
		setSnapshotNowMs(Date.now());
	}, [selectedPromptId, activeTab]);

	useEffect(() => {
		if (!isWide && drawerOpen && !wasDrawerOpenRef.current) {
			const timer = setTimeout(() => closeBtnRef.current?.focus(), 60);
			wasDrawerOpenRef.current = true;
			return () => clearTimeout(timer);
		}
		if (!drawerOpen) {
			wasDrawerOpenRef.current = false;
		}
		return undefined;
	}, [isWide, drawerOpen]);

	useEffect(() => {
		if (isWide || !drawerOpen) return;
		const onKeyDown = (ev: KeyboardEvent) => {
			if (ev.defaultPrevented) return;
			if (
				document.querySelector('[role="dialog"]:not([data-preview-drawer])')
			) {
				return;
			}
			if (ev.key === "Escape") {
				ev.stopPropagation();
				onCloseDrawer();
				return;
			}
			if (ev.key !== "Tab") return;
			const container = drawerRef.current;
			if (!container) return;
			const items = Array.from(
				container.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE),
			).filter((el) => el.offsetParent !== null);
			if (items.length === 0) {
				ev.preventDefault();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			if (!first || !last) return;
			const activeEl = document.activeElement as HTMLElement | null;
			if (!activeEl || !container.contains(activeEl)) {
				ev.preventDefault();
				(ev.shiftKey ? last : first).focus();
				return;
			}
			if (ev.shiftKey && activeEl === first) {
				ev.preventDefault();
				last.focus();
			} else if (!ev.shiftKey && activeEl === last) {
				ev.preventDefault();
				first.focus();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [isWide, drawerOpen, onCloseDrawer]);

	const classNameById = useMemo(
		() => new Map(classes.map((c) => [c.id, c.name])),
		[classes],
	);

	const promptAssignments = useMemo(() => {
		if (!prompt) return [];
		return classAssignments
			.filter((ca) => ca.promptId === prompt.id)
			.sort((a, b) => b.due.localeCompare(a.due));
	}, [classAssignments, prompt]);

	const usedClassCount = useMemo(
		() => new Set(promptAssignments.map((ca) => ca.classId)).size,
		[promptAssignments],
	);

	const historyItems = useMemo(() => {
		const todayVN = vietnamTodayISO(new Date(snapshotNowMs));
		return promptAssignments.map((ca) =>
			buildHistoryItemView(
				ca,
				classNameById.get(ca.classId) ?? "Lớp học",
				todayVN,
				snapshotNowMs,
			),
		);
	}, [promptAssignments, classNameById, snapshotNowMs]);

	if (!prompt) return null;
	if (!isWide && !drawerOpen) return null;

	const {
		skill: skillId,
		part: partId,
		type: typeId,
	} = promptSkillPartType(prompt);
	const skill = skillOf(skillId);
	const part = partOf(skillId, partId);
	const type = selectedTypeOf(skillId, partId, typeId);
	const statusInfo = promptStatus(prompt.status, usedClassCount);
	const badgeTone: PromptStatusBadgeTone =
		statusInfo.tone === "ok"
			? "ready"
			: statusInfo.tone === "used"
				? "used"
				: "draft";
	const isDraft = prompt.status === "draft";
	const isAuto = isAutoSkill(skillId);
	const bandDisplay = fmtBandDisplay(prompt.band);
	const createdLabel = fmtDayMonth(prompt.createdAt);

	function handleTabKeyDown(ev: React.KeyboardEvent<HTMLButtonElement>) {
		if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
		ev.preventDefault();
		const next: PreviewTabKey = activeTab === "prompt" ? "history" : "prompt";
		onTabChange(next);
		if (next === "prompt") {
			tabPromptRef.current?.focus();
		} else {
			tabHistoryRef.current?.focus();
		}
	}

	const panelBody = (
		<>
			{/* Header (teacher chrome above tabs) */}
			<div className="grid gap-2 border-border border-b px-5 pt-5 pb-4">
				<div className="flex items-center justify-between gap-2">
					<span className="text-muted-foreground text-xs">
						{skill.name} · {part.label} · {type?.label ?? "Chưa chọn dạng"}
					</span>
					{!isWide && (
						<button
							ref={closeBtnRef}
							type="button"
							onClick={onCloseDrawer}
							aria-label="Đóng xem trước"
							className="inline-grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							<X aria-hidden="true" className="size-4" />
						</button>
					)}
				</div>

				<p className="font-semibold text-foreground text-lg leading-snug tracking-tight">
					{prompt.title.trim() || "Chưa đặt tên đề"}
				</p>

				<div className="flex flex-wrap items-center gap-1.5">
					<PromptStatusBadge tone={badgeTone} label={statusInfo.label} />
					<Tag>
						<span className="font-mono tabular-nums">Band {bandDisplay}</span>
					</Tag>
					{prompt.level?.trim() && <Tag>{prompt.level.trim()}</Tag>}
					{isAuto && <Tag>Chấm tự động</Tag>}
					{isAuto && prompt.writing != null && <Tag>Kèm Writing</Tag>}
					{!isEmptyRichText(prompt.note ?? "") && <Tag>Có hướng dẫn thêm</Tag>}
				</div>

				<p className="text-muted-foreground text-xs">
					{[
						prompt.source.trim() || "Tự soạn",
						createdLabel ? `thêm ${createdLabel}` : null,
					]
						.filter(Boolean)
						.join(" · ")}
				</p>
			</div>

			{/* Tablist */}
			<div
				role="tablist"
				aria-label="Nội dung xem trước"
				className="mx-5 mt-4 flex gap-1 rounded-md bg-muted p-1"
			>
				<button
					ref={tabPromptRef}
					type="button"
					role="tab"
					id={tabPromptId}
					aria-controls={panelId}
					aria-selected={activeTab === "prompt"}
					tabIndex={activeTab === "prompt" ? 0 : -1}
					onClick={() => onTabChange("prompt")}
					onKeyDown={handleTabKeyDown}
					className={cn(
						"min-h-8 flex-1 rounded-sm px-2.5 font-medium text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
						activeTab === "prompt"
							? "bg-background text-foreground shadow-xs ring-1 ring-border"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Đề phía học viên
				</button>
				<button
					ref={tabHistoryRef}
					type="button"
					role="tab"
					id={tabHistoryId}
					aria-controls={panelId}
					aria-selected={activeTab === "history"}
					tabIndex={activeTab === "history" ? 0 : -1}
					onClick={() => onTabChange("history")}
					onKeyDown={handleTabKeyDown}
					className={cn(
						"min-h-8 flex-1 rounded-sm px-2.5 font-medium text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
						activeTab === "history"
							? "bg-background text-foreground shadow-xs ring-1 ring-border"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					Lịch sử giao
					<span
						aria-hidden="true"
						className="ml-1 font-mono text-xs tabular-nums"
					>
						({historyItems.length})
					</span>
				</button>
			</div>

			{/* Tabpanel body */}
			<div
				id={panelId}
				role="tabpanel"
				aria-labelledby={activeTab === "prompt" ? tabPromptId : tabHistoryId}
				className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5"
			>
				{activeTab === "prompt" ? (
					<PromptStudentPaper prompt={prompt} showDraftNote={isDraft} />
				) : historyItems.length === 0 ? (
					<div className="grid justify-items-center gap-2 px-2 py-8 text-center">
						<Send
							aria-hidden="true"
							className="mb-1 size-8 text-muted-foreground"
						/>
						<p className="font-semibold text-base text-foreground">
							Chưa giao cho lớp nào
						</p>
						<p className="max-w-xs text-muted-foreground text-sm">
							{isDraft
								? "Hoàn thiện bản nháp rồi giao cho lớp từ đây."
								: "Bấm “Giao cho lớp” bên dưới để chọn lớp và hạn nộp."}
						</p>
					</div>
				) : (
					<ul className="grid gap-3">
						{historyItems.map((item) => (
							<li
								key={item.assignment.id}
								className="grid gap-2 rounded-md border border-border p-3.5"
							>
								<div className="flex items-center justify-between gap-2">
									<Link
										to="/classes/$classId"
										params={{ classId: item.assignment.classId }}
										search={{ tab: "assignments" }}
										className="min-w-0 truncate rounded-xs font-semibold text-foreground text-sm underline-offset-3 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
									>
										{item.className}
									</Link>
									<PromptStatusBadge
										tone={item.badgeKey}
										label={item.badgeLabel}
									/>
								</div>
								<div
									role="img"
									aria-label={`Đã nộp ${item.submittedCount} trên ${item.totalCount}`}
									className="h-1.5 overflow-hidden rounded-full bg-muted"
								>
									<span
										className="block h-full rounded-full bg-foreground"
										style={{ width: `${item.pct}%` }}
									/>
								</div>
								<div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
									<span className="font-mono tabular-nums">
										Đã nộp {item.submittedCount}/{item.totalCount}
									</span>
									<span className="whitespace-nowrap font-mono tabular-nums">
										Hạn {item.dueDisplay}
									</span>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>

			{/* Footer */}
			<div className="grid gap-2 border-border border-t px-5 py-4">
				{isDraft ? (
					<>
						<Button
							type="button"
							className="w-full"
							onClick={() => onEdit(prompt)}
						>
							<Pencil aria-hidden="true" className="size-4" />
							Hoàn thiện bản nháp
						</Button>
						<p className="text-muted-foreground text-xs">
							Đề cần ở trạng thái “Sẵn sàng” mới giao được cho lớp.
						</p>
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => onPreviewFull(prompt)}
							>
								Xem trước
							</Button>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								disabled={duplicating}
								onClick={() => onDuplicate(prompt)}
							>
								<Copy aria-hidden="true" className="size-4" />
								Nhân bản
							</Button>
							{canManage && (
								<Button
									type="button"
									variant="ghost"
									className="text-destructive hover:bg-destructive/10 hover:text-destructive"
									onClick={() => onDeleteDraft(prompt)}
								>
									<Trash2 aria-hidden="true" className="size-4" />
									Xóa nháp
								</Button>
							)}
						</div>
					</>
				) : (
					<>
						{canManage && (
							<Button
								type="button"
								className="w-full"
								onClick={() => onAssign(prompt)}
							>
								<Send aria-hidden="true" className="size-4" />
								Giao cho lớp
							</Button>
						)}
						<div className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => onPreviewFull(prompt)}
							>
								Xem trước
							</Button>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								onClick={() => onEdit(prompt)}
							>
								<Pencil aria-hidden="true" className="size-4" />
								Sửa
							</Button>
							<Button
								type="button"
								variant="outline"
								className="flex-1"
								disabled={duplicating}
								onClick={() => onDuplicate(prompt)}
							>
								<Copy aria-hidden="true" className="size-4" />
								Nhân bản
							</Button>
						</div>
					</>
				)}
			</div>
		</>
	);

	if (isWide) {
		return (
			<aside
				aria-label="Xem trước đề"
				className="sticky top-6 flex max-h-[calc(100vh-48px)] min-h-0 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-sm"
			>
				{panelBody}
			</aside>
		);
	}

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop scrim closes drawer on mouse click; Escape is handled at document level */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close uses Escape listener above */}
			<div className="fixed inset-0 z-40 bg-black/50" onClick={onCloseDrawer} />
			<div
				ref={drawerRef}
				role="dialog"
				aria-modal="true"
				data-preview-drawer="true"
				aria-label="Xem trước đề"
				className="fixed inset-y-0 right-0 z-50 flex min-h-0 w-[min(440px,100vw)] flex-col border-border border-l bg-card text-card-foreground shadow-lg"
			>
				{panelBody}
			</div>
		</>
	);
}
