import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	genreOf,
	TASK_PRESETS,
	taskOf,
} from "@/components/assignments/assignment-presets";
import {
	fmtDate,
	promptStatus,
} from "@/components/assignments/assignment-status";
import { BankPreviewAside } from "@/components/assignments/bank-preview-aside";
import { StatusTag } from "@/components/assignments/status-tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/assignments/bank")({
	component: AssignmentBankPage,
});

const TASK_OPTIONS = ["Tất cả", "Task 1 · 150 từ", "Task 2 · 250 từ"];

export function AssignmentBankPage() {
	const navigate = useNavigate();
	const { data } = useData();

	const [taskFilter, setTaskFilter] = useState<"all" | "task1" | "task2">(
		"all",
	);
	const [genreFilter, setGenreFilter] = useState<string>("all");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Calculate distinct class count for each prompt
	const usedByPromptId = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const ca of data.classAssignments ?? []) {
			const set = map.get(ca.promptId) ?? new Set<string>();
			set.add(ca.classId);
			map.set(ca.promptId, set);
		}
		const counts = new Map<string, number>();
		for (const [promptId, classSet] of map.entries()) {
			counts.set(promptId, classSet.size);
		}
		return counts;
	}, [data.classAssignments]);

	// Dynamic genres based on selected task
	const genrePresets = useMemo(() => {
		if (taskFilter === "task1") {
			return TASK_PRESETS.find((t) => t.id === "task1")?.genres ?? [];
		}
		if (taskFilter === "task2") {
			return TASK_PRESETS.find((t) => t.id === "task2")?.genres ?? [];
		}
		return [...TASK_PRESETS[0].genres, ...TASK_PRESETS[1].genres];
	}, [taskFilter]);

	const genreOptions = useMemo(() => {
		return ["Tất cả dạng", ...genrePresets.map((g) => g.label)];
	}, [genrePresets]);

	function handleTaskChange(label: string) {
		const nextTask: "all" | "task1" | "task2" = label.startsWith("Task 1")
			? "task1"
			: label.startsWith("Task 2")
				? "task2"
				: "all";
		setTaskFilter(nextTask);

		// If current genre is not valid under new task, reset to "all"
		if (nextTask !== "all") {
			const validGenreIds =
				TASK_PRESETS.find((t) => t.id === nextTask)?.genres.map((g) => g.id) ??
				[];
			if (genreFilter !== "all" && !validGenreIds.includes(genreFilter)) {
				setGenreFilter("all");
			}
		}
	}

	function handleGenreChange(label: string) {
		if (label === "Tất cả dạng") {
			setGenreFilter("all");
			return;
		}
		const found = genrePresets.find((g) => g.label === label);
		setGenreFilter(found?.id ?? "all");
	}

	const selectedGenreLabel = useMemo(() => {
		if (genreFilter === "all") return "Tất cả dạng";
		return (
			genrePresets.find((g) => g.id === genreFilter)?.label ?? "Tất cả dạng"
		);
	}, [genreFilter, genrePresets]);

	const selectedTaskLabel = useMemo(() => {
		if (taskFilter === "task1") return "Task 1 · 150 từ";
		if (taskFilter === "task2") return "Task 2 · 250 từ";
		return "Tất cả";
	}, [taskFilter]);

	// Filter & sort prompts
	const filteredPrompts = useMemo(() => {
		const q = query.trim().toLowerCase();
		return data.assignmentPrompts
			.filter((p) => {
				if (taskFilter !== "all" && p.task !== taskFilter) return false;
				if (genreFilter !== "all" && p.genre !== genreFilter) return false;
				if (q) {
					const g = genreOf(p.task, p.genre);
					const matchTitle = p.title.toLowerCase().includes(q);
					const matchSource = p.source.toLowerCase().includes(q);
					const matchGenre = g.label.toLowerCase().includes(q);
					if (!matchTitle && !matchSource && !matchGenre) return false;
				}
				return true;
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [data.assignmentPrompts, taskFilter, genreFilter, query]);

	const totalPrompts = data.assignmentPrompts.length;
	const hasActiveFilter =
		taskFilter !== "all" || genreFilter !== "all" || query.trim() !== "";

	// Active selection (defaults to first item in filtered list)
	const activePrompt = useMemo(() => {
		if (filteredPrompts.length === 0) return null;
		return (
			filteredPrompts.find((p) => p.id === selectedId) ??
			filteredPrompts[0] ??
			null
		);
	}, [filteredPrompts, selectedId]);

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
				<span>Ngân hàng</span>
			</nav>

			<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<PageHead
					title="Ngân hàng bài tập"
					lead="Đề đã lưu sau khi soạn. Lọc theo dạng bài rồi giao cho lớp ở trang Lớp học."
				/>
				<Button onClick={() => navigate({ to: "/assignments/new" })}>
					Tạo đề mới
				</Button>
			</div>

			{totalPrompts === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<h2 className="font-display font-semibold text-fg text-lg">
						Chưa có đề nào trong ngân hàng
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Tạo đề đầu tiên để lưu vào ngân hàng và giao cho các lớp học.
					</p>
					<div className="mt-6 flex justify-center">
						<Button onClick={() => navigate({ to: "/assignments/new" })}>
							Tạo đề mới
						</Button>
					</div>
				</Card>
			) : (
				<div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr] lg:items-start">
					{/* Left column: Filters + List */}
					<div className="flex flex-col gap-4">
						{/* Filter Card */}
						<Card variant="white" className="flex flex-col gap-4 p-5">
							{/* In-page search input */}
							<div>
								<input
									type="text"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									placeholder="Tìm đề theo tiêu đề hoặc nguồn"
									aria-label="Tìm đề theo tiêu đề hoặc nguồn"
									className="w-full rounded-md border border-line bg-surface px-3 py-2 text-fg text-sm placeholder:text-muted-fg focus:border-fg focus:outline-none"
								/>
							</div>

							{/* Task Filter */}
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-fg text-xs">
									Dạng bài
								</span>
								<ChipFilter
									options={TASK_OPTIONS}
									value={selectedTaskLabel}
									onChange={handleTaskChange}
								/>
							</div>

							{/* Genre Filter */}
							<div id="genre-block" className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-fg text-xs">
									Dạng đề
								</span>
								<ChipFilter
									options={genreOptions}
									value={selectedGenreLabel}
									onChange={handleGenreChange}
								/>
							</div>

							{/* Card Footer: Count + Clear */}
							<div className="flex items-center justify-between border-border-soft border-t pt-3">
								<p
									id="result-count"
									aria-live="polite"
									className="font-mono text-meta text-xs"
								>
									Đang hiện{" "}
									<strong className="font-semibold text-fg">
										{filteredPrompts.length}
									</strong>{" "}
									/ {totalPrompts} đề
								</p>
								{hasActiveFilter && (
									<button
										type="button"
										onClick={() => {
											setTaskFilter("all");
											setGenreFilter("all");
											setQuery("");
										}}
										className="font-medium text-muted-fg text-xs hover:text-fg"
									>
										Xóa bộ lọc
									</button>
								)}
							</div>
						</Card>

						{/* Prompt List or Filter-Empty Card */}
						{filteredPrompts.length === 0 ? (
							<Card variant="white" className="p-10 text-center">
								<h2 className="font-display font-semibold text-[17px] text-fg">
									Không có đề khớp bộ lọc
								</h2>
								<p className="mt-1 text-muted-fg text-sm">
									Thử dạng bài khác, hoặc xóa bộ lọc để xem toàn bộ ngân hàng.
								</p>
							</Card>
						) : (
							<div
								role="listbox"
								aria-label="Đề trong ngân hàng"
								className="flex flex-col gap-2"
							>
								{filteredPrompts.map((prompt) => {
									const isSelected = activePrompt?.id === prompt.id;
									const g = genreOf(prompt.task, prompt.genre);
									const t = taskOf(prompt.task);
									const used = usedByPromptId.get(prompt.id) ?? 0;
									const statusInfo = promptStatus(prompt.status, used);

									return (
										<button
											type="button"
											key={prompt.id}
											aria-pressed={isSelected}
											onClick={() => setSelectedId(prompt.id)}
											className={cn(
												"grid min-h-[72px] w-full grid-cols-[1fr_auto] items-center gap-4 rounded-xl border p-4 text-left transition-all duration-150",
												isSelected
													? "border-fg bg-surface shadow-xs ring-1 ring-fg"
													: "border-line bg-bg hover:border-fg/60 hover:bg-surface/50",
											)}
										>
											{/* Left: Title + meta */}
											<div className="flex flex-col gap-1.5 overflow-hidden">
												<h3 className="truncate font-display font-semibold text-[15px] text-fg">
													{prompt.title}
												</h3>
												<div className="flex flex-wrap items-center gap-2 text-xs">
													<Tag>{g.label}</Tag>
													{prompt.source.trim() && (
														<span className="truncate text-meta">
															{prompt.source.trim()}
														</span>
													)}
													<span className="font-mono text-[11px] text-meta">
														Thêm {fmtDate(prompt.createdAt)}
													</span>
												</div>
											</div>

											{/* Right: Status Tag + Task/Band meta */}
											<div className="flex shrink-0 flex-col items-end gap-1.5">
												<StatusTag tone={statusInfo.tone}>
													{statusInfo.label}
												</StatusTag>
												<span className="font-mono text-meta text-xs">
													{t.label} · Band {prompt.band}
												</span>
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>

					{/* Right column: Sticky Preview */}
					{activePrompt && (
						<div className="lg:block">
							<BankPreviewAside prompt={activePrompt} />
						</div>
					)}
				</div>
			)}
		</div>
	);
}
