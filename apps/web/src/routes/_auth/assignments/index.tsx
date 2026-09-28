import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
	partOf,
	SKILLS,
	type SkillId,
	typeOf,
} from "@/components/assignments/assignment-presets";
import {
	fmtDate,
	promptStatus,
} from "@/components/assignments/assignment-status";
import { PromptPreviewAside } from "@/components/assignments/prompt-preview-aside";
import { StatusTag } from "@/components/assignments/status-tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChipFilter } from "@/components/ui/chip-filter";
import { PageHead } from "@/components/ui/page-head";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { useData } from "@/lib/data-store";
import type { AssignmentPrompt } from "@/lib/mock-data";

export const Route = createFileRoute("/_auth/assignments/")({
	component: AssignmentsRoute,
});

const SKILL_FILTERS: ReadonlyArray<{ label: string; id: "all" | SkillId }> = [
	{ label: "Tất cả", id: "all" },
	{ label: "Writing", id: "writing" },
	{ label: "Reading", id: "reading" },
	{ label: "Listening", id: "listening" },
	{ label: "Speaking", id: "speaking" },
];
const SKILL_OPTIONS = SKILL_FILTERS.map((filter) => filter.label);

// Legacy rows store skill/part/type under `task`/`genre` fallbacks.
function promptSkillPartType(prompt: AssignmentPrompt) {
	return {
		skill: (prompt.skill ?? "writing") as SkillId,
		part: prompt.part ?? prompt.task,
		type: prompt.type ?? prompt.genre,
	};
}

export function AssignmentsRoute() {
	const navigate = useNavigate();
	const { data } = useData();

	const [skillFilter, setSkillFilter] = useState<"all" | SkillId>("all");
	const [partFilter, setPartFilter] = useState<string>("all");
	const [query, setQuery] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Distinct classes that used each prompt
	const usedClassesByPromptId = useMemo(() => {
		const map = new Map<string, Set<string>>();
		for (const ca of data.classAssignments ?? []) {
			const set = map.get(ca.promptId) ?? new Set<string>();
			set.add(ca.classId);
			map.set(ca.promptId, set);
		}
		return map;
	}, [data.classAssignments]);

	// Dynamic parts based on selected skill
	const partPresets = useMemo(() => {
		if (skillFilter !== "all") {
			return SKILLS.find((s) => s.id === skillFilter)?.parts ?? [];
		}
		return SKILLS.flatMap((s) => s.parts);
	}, [skillFilter]);

	const partOptions = ["Tất cả phần", ...partPresets.map((p) => p.label)];

	function handleSkillChange(label: string) {
		setSkillFilter(SKILL_FILTERS.find((f) => f.label === label)?.id ?? "all");
		setPartFilter("all");
	}

	function handlePartChange(label: string) {
		if (label === "Tất cả phần") {
			setPartFilter("all");
			return;
		}
		const found = partPresets.find((p) => p.label === label);
		setPartFilter(found?.id ?? "all");
	}

	const selectedSkillLabel =
		SKILL_FILTERS.find((f) => f.id === skillFilter)?.label ?? "Tất cả";

	const selectedPartLabel =
		partFilter === "all"
			? "Tất cả phần"
			: (partPresets.find((p) => p.id === partFilter)?.label ?? "Tất cả phần");

	// Filter & sort prompts
	const filteredPrompts = useMemo(() => {
		const q = query.trim().toLowerCase();
		return data.assignmentPrompts
			.filter((p) => {
				const { skill, part, type } = promptSkillPartType(p);
				if (skillFilter !== "all" && skill !== skillFilter) return false;
				if (partFilter !== "all" && part !== partFilter) return false;
				if (q) {
					const t = typeOf(skill, part, type);
					const matchTitle = p.title.toLowerCase().includes(q);
					const matchSource = p.source.toLowerCase().includes(q);
					const matchType = t.label.toLowerCase().includes(q);
					if (!matchTitle && !matchSource && !matchType) return false;
				}
				return true;
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [data.assignmentPrompts, skillFilter, partFilter, query]);

	const totalPrompts = data.assignmentPrompts.length;
	const hasActiveFilter =
		skillFilter !== "all" || partFilter !== "all" || query.trim() !== "";

	// Active selection (defaults to first item in filtered list)
	const activePrompt = useMemo(() => {
		if (filteredPrompts.length === 0) return null;
		return (
			filteredPrompts.find((p) => p.id === selectedId) ?? filteredPrompts[0]
		);
	}, [filteredPrompts, selectedId]);

	return (
		<div>
			<div className="mb-6 flex flex-wrap items-start justify-between gap-4">
				<PageHead
					title="Bài tập"
					lead="Danh sách bài tập đã tạo. Lọc theo kỹ năng rồi giao cho lớp ở trang Lớp học."
				/>
				<Button onClick={() => navigate({ to: "/assignments/new" })}>
					+ Tạo bài tập
				</Button>
			</div>

			{totalPrompts === 0 ? (
				<Card variant="white" className="p-8 text-center">
					<h2 className="font-display font-semibold text-fg text-lg">
						Chưa có bài tập nào
					</h2>
					<p className="mx-auto mt-2 max-w-md text-muted-fg text-sm">
						Tạo bài tập đầu tiên để lưu vào danh sách và giao cho các lớp học.
					</p>
					<div className="mt-6 flex justify-center">
						<Button onClick={() => navigate({ to: "/assignments/new" })}>
							Tạo bài tập đầu tiên
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

							{/* Skill Filter */}
							<div className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-fg text-xs">
									Kỹ năng
								</span>
								<ChipFilter
									options={SKILL_OPTIONS}
									value={selectedSkillLabel}
									onChange={handleSkillChange}
								/>
							</div>

							{/* Part Filter */}
							<div id="part-block" className="flex flex-col gap-1.5">
								<span className="font-medium text-muted-fg text-xs">
									Phần thi
								</span>
								<ChipFilter
									options={partOptions}
									value={selectedPartLabel}
									onChange={handlePartChange}
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
											setSkillFilter("all");
											setPartFilter("all");
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
									Thử kỹ năng hoặc phần thi khác, hoặc xóa bộ lọc để xem toàn bộ
									danh sách.
								</p>
							</Card>
						) : (
							<div
								role="listbox"
								aria-label="Đề trong danh sách"
								className="flex flex-col gap-2"
							>
								{filteredPrompts.map((prompt) => {
									const isSelected = activePrompt?.id === prompt.id;
									const {
										skill: pSkill,
										part: pPart,
										type: pType,
									} = promptSkillPartType(prompt);
									const t = typeOf(pSkill, pPart, pType);
									const part = partOf(pSkill, pPart);
									const used = usedClassesByPromptId.get(prompt.id)?.size ?? 0;
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
													<Tag>{t.label}</Tag>
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

											{/* Right: Status Tag + Part/Band meta */}
											<div className="flex shrink-0 flex-col items-end gap-1.5">
												<StatusTag tone={statusInfo.tone}>
													{statusInfo.label}
												</StatusTag>
												<span className="font-mono text-meta text-xs">
													{part.label} · Band {prompt.band}
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
							<PromptPreviewAside prompt={activePrompt} />
						</div>
					)}
				</div>
			)}
		</div>
	);
}
