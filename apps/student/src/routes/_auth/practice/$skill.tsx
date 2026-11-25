import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import type { PracticeCatalogItem } from "@teacher-os/api/contracts";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import { HistoryButton } from "@/components/practice/history-button";
import {
	type PracticeSearchParams,
	parsePracticeSearch,
} from "@/components/practice/practice-filters";
import {
	PRACTICE_SKILL_LABELS,
	type PracticeFilterState,
	SkillCatalog,
} from "@/components/practice/skill-catalog";
import { useHistoryList } from "@/lib/repos/student";

export { parsePracticeSearch };

const SKILL_SLUGS = ["reading", "listening", "writing", "speaking"] as const;
type SkillSlug = (typeof SKILL_SLUGS)[number];

function parseSkill(raw: string | undefined): SkillSlug | null {
	return (SKILL_SLUGS as readonly string[]).includes(raw ?? "")
		? (raw as SkillSlug)
		: null;
}

export const Route = createFileRoute("/_auth/practice/$skill")({
	validateSearch: (search: Record<string, unknown>): PracticeSearchParams =>
		parsePracticeSearch(search),
	beforeLoad: ({ params }) => {
		if (parseSkill(params.skill) === null) {
			throw redirect({
				to: "/practice/$skill",
				params: { skill: "reading" },
				search: {},
				replace: true,
			});
		}
	},
	component: PracticeSkillPage,
});

/** Nhãn + kicker mô tả ngắn theo skill (design-v2, tiếng Việt). */
const SKILL_LABELS: Record<SkillSlug, string> = PRACTICE_SKILL_LABELS;
const SKILL_KICKERS: Record<SkillSlug, string> = {
	reading: "Bài đọc Academic trong bố cục thi thật trên máy",
	listening: "Băng nghe Section 1–4 · phát một lần như phòng thi",
	writing: "Task 1 + Task 2 · chấm theo 4 tiêu chí IELTS",
	speaking: "Part 1/2/3 · ghi âm, nghe lại và xem nhận xét",
};

function PracticeSkillPage() {
	const { skill: rawSkill } = Route.useParams();
	const skill = parseSkill(rawSkill) as SkillSlug;
	const search = Route.useSearch();
	const navigate = useNavigate();

	// HistoryButton (phase 11): đếm thật từ total của list lọc skill.
	const historyCount = useHistoryList(
		{
			skill,
			page: 1,
		},
		true,
	);

	const handleFilterChange = (
		next: PracticeFilterState,
		options?: { replace?: boolean },
	) => {
		void navigate({
			to: "/practice/$skill",
			params: { skill },
			search: {
				collection: next.collection || undefined,
				part: next.part || undefined,
				type: next.type || undefined,
				band: next.band || undefined,
				q: next.q || undefined,
				page: next.page > 1 ? next.page : undefined,
			},
			replace: options?.replace,
		});
	};

	const handleOpen = (item: PracticeCatalogItem) => {
		void navigate({
			to: "/learn/quizzes/practice/$testId",
			params: { testId: item.testId },
		});
	};

	return (
		<StudentPageGate>
			{() => (
				<div data-testid="student-practice-page" className="space-y-6">
					<header className="flex flex-wrap items-end justify-between gap-3">
						<div>
							<p className="font-mono text-[11px] text-primary uppercase tracking-[0.2em]">
								{SKILL_KICKERS[skill]}
							</p>
							<h1 className="mt-2 font-extrabold text-3xl text-foreground leading-[0.95] tracking-[-0.045em]">
								{SKILL_LABELS[skill]}
							</h1>
						</div>
						<HistoryButton
							count={historyCount.data?.total ?? 0}
							onClick={() =>
								void navigate({
									to: "/history",
									search: { skill },
								})
							}
						/>
					</header>

					<SkillCatalog
						skill={skill}
						collection={search.collection ?? ""}
						part={search.part ?? ""}
						type={search.type ?? ""}
						band={search.band ?? ""}
						q={search.q ?? ""}
						page={search.page ?? 1}
						onFilterChange={handleFilterChange}
						onOpen={handleOpen}
					/>
				</div>
			)}
		</StudentPageGate>
	);
}
