import {
	createFileRoute,
	useNavigate,
	useSearch,
} from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
	// Bộ lọc sống trong URL (?q= &skill= &part=) để reload/back/share giữ
	// nguyên trạng thái; giá trị lạ rơi về mặc định khi đọc lại.
	// Annotate input tùy chọn để Link/navigate tới /assignments không bị
	// bắt buộc truyền search (TanRouter suy input type từ tham số đầu).
	validateSearch: (input: {
		q?: string;
		skill?: string;
		part?: string;
	}): { q?: string; skill?: string; part?: string } => ({
		q: typeof input.q === "string" ? input.q : undefined,
		skill: typeof input.skill === "string" ? input.skill : undefined,
		part: typeof input.part === "string" ? input.part : undefined,
	}),
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

function promptMatchesQuery(prompt: AssignmentPrompt, q: string) {
	const { skill, part, type } = promptSkillPartType(prompt);
	const t = typeOf(skill, part, type);
	return (
		prompt.title.toLowerCase().includes(q) ||
		prompt.source.toLowerCase().includes(q) ||
		t.label.toLowerCase().includes(q)
	);
}

// Giá trị mặc định ("all"/rỗng) không lên URL — link chia sẻ chỉ mang filter thật.
function filtersToSearch(q: string, skill: "all" | SkillId, part: string) {
	return {
		...(q ? { q } : {}),
		...(skill !== "all" ? { skill } : {}),
		...(part !== "all" ? { part } : {}),
	};
}

export function AssignmentsRoute() {
	const navigate = useNavigate();
	const { data } = useData();
	const searchParams = useSearch({ from: "/_auth/assignments/" });

	const skillFilter: "all" | SkillId = SKILL_FILTERS.some(
		(f) => f.id === searchParams.skill,
	)
		? (searchParams.skill as "all" | SkillId)
		: "all";
	const partPresets = useMemo(() => {
		if (skillFilter !== "all") {
			return SKILLS.find((s) => s.id === skillFilter)?.parts ?? [];
		}
		return SKILLS.flatMap((s) => s.parts);
	}, [skillFilter]);
	const partFilter = partPresets.some((p) => p.id === searchParams.part)
		? (searchParams.part as string)
		: "all";
	// Query giữ state local rồi debounce lên URL 300ms — điều hướng mỗi phím
	// gõ làm input (controlled bởi URL) rớt ký tự khi navigate commit trễ.
	const [query, setQuery] = useState(() => searchParams.q ?? "");
	const lastEmittedQuery = useRef(query);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const activeFilterCount =
		(skillFilter !== "all" ? 1 : 0) +
		(partFilter !== "all" ? 1 : 0) +
		(query.trim() !== "" ? 1 : 0);
	const hasActiveFilter = activeFilterCount > 0;

	// <lg: gộp card bộ lọc để danh sách đề lên trước; desktop luôn mở.
	const [filtersOpen, setFiltersOpen] = useState(
		() =>
			typeof window === "undefined" ||
			window.innerWidth >= 1024 ||
			hasActiveFilter,
	);

	function setFilters(next: {
		q: string;
		skill: "all" | SkillId;
		part: string;
	}) {
		lastEmittedQuery.current = next.q;
		navigate({
			to: "/assignments",
			search: filtersToSearch(next.q, next.skill, next.part),
			replace: true,
		});
	}

	// q đổi từ phía URL (back/forward, link chia sẻ) → synced xuống state.
	useEffect(() => {
		const urlQ = searchParams.q ?? "";
		if (urlQ !== lastEmittedQuery.current) {
			lastEmittedQuery.current = urlQ;
			setQuery(urlQ);
		}
	}, [searchParams.q]);

	// Ngừng gõ 300ms → đẩy q lên URL (reload/share giữ được từ khóa).
	useEffect(() => {
		const timer = setTimeout(() => {
			if (query === lastEmittedQuery.current) return;
			lastEmittedQuery.current = query;
			navigate({
				to: "/assignments",
				search: filtersToSearch(query, skillFilter, partFilter),
				replace: true,
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [query, skillFilter, partFilter, navigate]);

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

	// Số đề mỗi chip theo query hiện tại — giáo viên thấy trước kết quả
	// trước khi bấm. Chip skill đếm không phụ thuộc part (bấm skill reset
	// part), chip part đếm trong nhóm skill của nó. Một pass cho cả hai.
	const matchCounts = useMemo(() => {
		const q = query.trim().toLowerCase();
		const bySkill = new Map<string, number>();
		const byPart = new Map<string, number>();
		for (const p of data.assignmentPrompts) {
			if (q && !promptMatchesQuery(p, q)) continue;
			const { skill, part } = promptSkillPartType(p);
			bySkill.set(skill, (bySkill.get(skill) ?? 0) + 1);
			const key = `${skill}:${part}`;
			byPart.set(key, (byPart.get(key) ?? 0) + 1);
		}
		return { bySkill, byPart };
	}, [data.assignmentPrompts, query]);

	// Chip đếm theo label cho ChipFilter.counts.
	const skillChipCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const filter of SKILL_FILTERS) {
			if (filter.id !== "all") {
				counts[filter.label] = matchCounts.bySkill.get(filter.id) ?? 0;
			}
		}
		return counts;
	}, [matchCounts]);

	const partChipCountsBySkill = useMemo(() => {
		const bySkill: Record<string, Record<string, number>> = {};
		for (const skill of SKILLS) {
			const counts: Record<string, number> = {};
			for (const part of skill.parts) {
				counts[part.label] =
					matchCounts.byPart.get(`${skill.id}:${part.id}`) ?? 0;
			}
			bySkill[skill.id] = counts;
		}
		return bySkill;
	}, [matchCounts]);

	function handleSkillChange(label: string) {
		const next = SKILL_FILTERS.find((f) => f.label === label)?.id ?? "all";
		// Đổi skill luôn reset part — part cũ thuộc skill khác sẽ ngõ cụt.
		setFilters({ q: query, skill: next, part: "all" });
	}

	function handlePartChange(label: string) {
		if (label === "Tất cả phần") {
			setFilters({ q: query, skill: skillFilter, part: "all" });
			return;
		}
		const found = partPresets.find((p) => p.label === label);
		setFilters({ q: query, skill: skillFilter, part: found?.id ?? "all" });
	}

	function handleQueryChange(value: string) {
		// Chỉ set state — effect debounce sẽ đẩy q lên URL.
		setQuery(value);
	}
	function clearFilters() {
		setQuery("");
		setFilters({ q: "", skill: "all", part: "all" });
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
				const { skill, part } = promptSkillPartType(p);
				if (skillFilter !== "all" && skill !== skillFilter) return false;
				if (partFilter !== "all" && part !== partFilter) return false;
				if (q && !promptMatchesQuery(p, q)) return false;
				return true;
			})
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}, [data.assignmentPrompts, skillFilter, partFilter, query]);

	const totalPrompts = data.assignmentPrompts.length;

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
							{/* Mobile: gập bộ lọc để danh sách đề lên trước (desktop ẩn) */}
							<div className="flex items-center justify-between border-border-soft border-b pb-3 lg:hidden">
								<button
									type="button"
									onClick={() => setFiltersOpen((v) => !v)}
									aria-expanded={filtersOpen}
									aria-controls="assignment-filters-body"
									className="flex items-center gap-1.5 font-medium text-fg text-sm"
								>
									Bộ lọc
									{activeFilterCount > 0 && (
										<span className="rounded-full bg-fg px-1.5 font-mono text-[10px] text-bg leading-4">
											{activeFilterCount}
										</span>
									)}
									<ChevronDown
										aria-hidden="true"
										className={cn(
											"size-4 text-meta motion-safe:transition-transform motion-safe:duration-150",
											filtersOpen && "rotate-180",
										)}
									/>
								</button>
								<p aria-hidden="true" className="font-mono text-meta text-xs">
									{filteredPrompts.length}/{totalPrompts} đề
								</p>
							</div>
							<div
								id="assignment-filters-body"
								className={cn(
									"flex flex-col gap-4",
									!filtersOpen && "hidden lg:flex",
								)}
							>
								{/* In-page search input */}
								<div>
									<input
										type="text"
										value={query}
										onChange={(e) => handleQueryChange(e.target.value)}
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
										ariaLabel="Kỹ năng"
										counts={skillChipCounts}
									/>
								</div>

								{/* Part Filter — khi xem "Tất cả", nhóm chip theo kỹ năng
								    thay vì một bức tường 12 phần thi trộn 4 kỹ năng */}
								<div id="part-block" className="flex flex-col gap-1.5">
									<span className="font-medium text-muted-fg text-xs">
										Phần thi
									</span>
									<ChipFilter
										options={
											skillFilter === "all"
												? ["Tất cả phần"]
												: ["Tất cả phần", ...partPresets.map((p) => p.label)]
										}
										value={selectedPartLabel}
										onChange={handlePartChange}
										ariaLabel="Phần thi"
										counts={
											skillFilter === "all"
												? undefined
												: partChipCountsBySkill[skillFilter]
										}
									/>
									{skillFilter === "all" &&
										SKILLS.map((skill) => {
											const selectedLabel =
												skill.parts.find((p) => p.id === partFilter)?.label ??
												"";
											return (
												<div
													key={skill.id}
													className="flex flex-wrap items-center gap-x-3 gap-y-2"
												>
													<span className="shrink-0 font-mono text-[10px] text-meta uppercase tracking-[0.08em]">
														{skill.name}
													</span>
													<ChipFilter
														options={skill.parts.map((p) => p.label)}
														value={selectedLabel}
														onChange={handlePartChange}
														ariaLabel={`Phần thi ${skill.name}`}
														counts={partChipCountsBySkill[skill.id]}
													/>
												</div>
											);
										})}
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
											onClick={clearFilters}
											className="font-medium text-muted-fg text-xs hover:text-fg"
										>
											Xóa bộ lọc
										</button>
									)}
								</div>
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
