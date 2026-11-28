import {
	ASSIGNMENT_BANDS,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_SKILLS,
	type AssignmentBand,
	type AssignmentPromptCreate,
	type AssignmentQuestion,
	type AssignmentSkill,
	type AssignmentWritingSection,
	answerKindByType,
	assignmentPromptCreateSchema,
	assignmentWritingSectionSchema,
	DEFAULT_ASSIGNMENT_BAND,
	effectiveAnswerChoices,
	extendedAnswerChoices,
	isAllowedStudyPackAudioUrl,
	isAssignmentImageUrl,
	mcqOptionsIssue,
	optionBankKindFor,
} from "@teacher-os/api/contracts";
import { isEmptyRichText } from "@teacher-os/api/rich-text";
import type { AssignmentPrompt, ClassAssignment } from "@/lib/mock-data";
import {
	isAutoSkill,
	SKILLS,
	type SkillId,
	selectedTypeOf,
	skillOf,
} from "./assignment-presets";
import { fmtDueDisplay, rollupStatus } from "./assignment-status";

export type AssignmentStatusFilter = "all" | "ready" | "used" | "draft";
export type AssignmentSortKey = "new" | "used" | "bandDesc" | "bandAsc" | "az";

export interface AssignmentsSearchParams {
	q?: string;
	skill?: string;
	part?: string;
	status?: string;
	sort?: string;
}

export interface AssignmentBankFilters {
	q: string;
	skill: "all" | SkillId;
	part: string;
	status: AssignmentStatusFilter;
	sort: AssignmentSortKey;
}

export interface BankStats {
	all: number;
	used: number;
	ready: number;
	draft: number;
}

export interface HistoryItemView {
	assignment: ClassAssignment;
	className: string;
	submittedCount: number;
	totalCount: number;
	pct: number;
	badgeKey: "open" | "closed" | "late";
	badgeLabel: string;
	dueDisplay: string;
}

const VALID_STATUS_FILTERS = new Set<string>(["ready", "used", "draft"]);
const VALID_SORT_KEYS = new Set<string>(["used", "bandDesc", "bandAsc", "az"]);
const DUPLICATE_SUFFIX = " (bản sao)";
const MAX_PROMPT_TITLE = 200;

/** Loại bỏ ký tự điều khiển và ký tự điều hướng Bidi trong chuỗi tìm kiếm URL. */
export function stripUnsafeSearchChars(value: string): string {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: strip ASCII control characters from URL search input
	return value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "");
}

/** Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không phân biệt dấu và chữ đ/Đ. */
export function normalizeViSearch(value: string): string {
	return String(value ?? "")
		.toLowerCase()
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/đ/g, "d");
}

function findSkillForPart(partId: string): SkillId | null {
	for (const s of SKILLS) {
		if (s.parts.some((p) => p.id === partId)) return s.id;
	}
	return null;
}

export function validateAssignmentsSearch(input: {
	q?: unknown;
	skill?: unknown;
	part?: unknown;
	status?: unknown;
	sort?: unknown;
}): AssignmentsSearchParams {
	const rawQ =
		typeof input.q === "string" ? stripUnsafeSearchChars(input.q).trim() : "";
	const rawSkill =
		typeof input.skill === "string" && SKILLS.some((s) => s.id === input.skill)
			? input.skill
			: undefined;

	let rawPart: string | undefined;
	if (typeof input.part === "string") {
		const validParts = rawSkill
			? skillOf(rawSkill).parts
			: SKILLS.flatMap((s) => s.parts);
		if (validParts.some((p) => p.id === input.part)) {
			rawPart = input.part;
		}
	}

	const rawStatus =
		typeof input.status === "string" && VALID_STATUS_FILTERS.has(input.status)
			? input.status
			: undefined;
	const rawSort =
		typeof input.sort === "string" && VALID_SORT_KEYS.has(input.sort)
			? input.sort
			: undefined;

	return {
		q: rawQ ? rawQ : undefined,
		skill: rawSkill,
		part: rawPart,
		status: rawStatus,
		sort: rawSort,
	};
}

export function resolveAssignmentFilters(
	searchParams: AssignmentsSearchParams,
): AssignmentBankFilters {
	const q = stripUnsafeSearchChars(searchParams.q ?? "");
	let skill: "all" | SkillId =
		searchParams.skill && SKILLS.some((s) => s.id === searchParams.skill)
			? (searchParams.skill as SkillId)
			: "all";

	let part = "all";
	if (searchParams.part) {
		if (skill === "all") {
			const inferredSkill = findSkillForPart(searchParams.part);
			if (inferredSkill) {
				skill = inferredSkill;
				part = searchParams.part;
			}
		} else if (skillOf(skill).parts.some((p) => p.id === searchParams.part)) {
			part = searchParams.part;
		}
	}

	const status: AssignmentStatusFilter =
		searchParams.status && VALID_STATUS_FILTERS.has(searchParams.status)
			? (searchParams.status as AssignmentStatusFilter)
			: "all";

	const sort: AssignmentSortKey =
		searchParams.sort && VALID_SORT_KEYS.has(searchParams.sort)
			? (searchParams.sort as AssignmentSortKey)
			: "new";

	return { q, skill, part, status, sort };
}

export function filtersToSearch(
	filters: AssignmentBankFilters,
): AssignmentsSearchParams {
	const cleanedQ = stripUnsafeSearchChars(filters.q).trim();
	return {
		...(cleanedQ ? { q: cleanedQ } : {}),
		...(filters.skill !== "all" ? { skill: filters.skill } : {}),
		...(filters.part !== "all" ? { part: filters.part } : {}),
		...(filters.status !== "all" ? { status: filters.status } : {}),
		...(filters.sort !== "new" ? { sort: filters.sort } : {}),
	};
}

export function promptSkillPartType(prompt: AssignmentPrompt): {
	skill: SkillId;
	part: string;
	type: string;
} {
	const rawSkill = prompt.skill ?? "writing";
	const skill = (
		SKILLS.some((s) => s.id === rawSkill) ? rawSkill : "writing"
	) as SkillId;
	return {
		skill,
		part: prompt.part ?? prompt.task ?? skillOf(skill).parts[0]?.id ?? "",
		type: prompt.type ?? prompt.genre ?? "",
	};
}

export function promptEffectiveStatusKey(
	prompt: AssignmentPrompt,
	usedClassesCount: number,
): "draft" | "used" | "ready" {
	if (prompt.status === "draft") return "draft";
	return usedClassesCount > 0 ? "used" : "ready";
}

export function computeBankStats(
	prompts: readonly AssignmentPrompt[],
	usedClassesByPromptId: ReadonlyMap<string, ReadonlySet<string>>,
): BankStats {
	const stats: BankStats = {
		all: prompts.length,
		used: 0,
		ready: 0,
		draft: 0,
	};
	for (const p of prompts) {
		const usedCount = usedClassesByPromptId.get(p.id)?.size ?? 0;
		const key = promptEffectiveStatusKey(p, usedCount);
		stats[key] += 1;
	}
	return stats;
}

export function fmtBandDisplay(
	band: string | number | null | undefined,
): string {
	if (band === null || band === undefined) return "—";
	const trimmed = typeof band === "string" ? band.trim() : band;
	if (trimmed === "") return "—";
	const num = Number(trimmed);
	return Number.isFinite(num) ? num.toFixed(1) : "—";
}

export function promptMatchesQuery(
	prompt: AssignmentPrompt,
	query: string,
): boolean {
	const needle = normalizeViSearch(stripUnsafeSearchChars(query).trim());
	if (!needle) return true;
	const { skill, part, type } = promptSkillPartType(prompt);
	const typeLabel = selectedTypeOf(skill, part, type)?.label ?? "";
	const skillName = skillOf(skill).name;
	return [prompt.title, typeLabel, prompt.source, skillName].some((field) =>
		normalizeViSearch(field).includes(needle),
	);
}

export function computeFilterCounts(
	prompts: readonly AssignmentPrompt[],
	query: string,
	statusFilter: AssignmentStatusFilter,
	usedClassesByPromptId: ReadonlyMap<string, ReadonlySet<string>>,
): {
	all: number;
	bySkill: Map<string, number>;
	byPart: Map<string, number>;
} {
	const bySkill = new Map<string, number>();
	const byPart = new Map<string, number>();
	let all = 0;

	for (const p of prompts) {
		if (!promptMatchesQuery(p, query)) continue;
		const usedCount = usedClassesByPromptId.get(p.id)?.size ?? 0;
		if (
			statusFilter !== "all" &&
			promptEffectiveStatusKey(p, usedCount) !== statusFilter
		) {
			continue;
		}
		all += 1;
		const { skill, part } = promptSkillPartType(p);
		bySkill.set(skill, (bySkill.get(skill) ?? 0) + 1);
		const partKey = `${skill}:${part}`;
		byPart.set(partKey, (byPart.get(partKey) ?? 0) + 1);
	}
	return { all, bySkill, byPart };
}

function parseBandNumber(band: string): number | null {
	const trimmed = band.trim();
	if (!trimmed) return null;
	const num = Number(trimmed);
	return Number.isFinite(num) ? num : null;
}

export function filterAndSortPrompts(
	prompts: readonly AssignmentPrompt[],
	filters: Pick<
		AssignmentBankFilters,
		"q" | "skill" | "part" | "status" | "sort"
	>,
	usedClassesByPromptId: ReadonlyMap<string, ReadonlySet<string>>,
): AssignmentPrompt[] {
	const list = prompts.filter((p) => {
		if (!promptMatchesQuery(p, filters.q)) return false;
		const usedCount = usedClassesByPromptId.get(p.id)?.size ?? 0;
		if (
			filters.status !== "all" &&
			promptEffectiveStatusKey(p, usedCount) !== filters.status
		) {
			return false;
		}
		const { skill, part } = promptSkillPartType(p);
		if (filters.skill !== "all" && skill !== filters.skill) return false;
		if (filters.part !== "all" && part !== filters.part) return false;
		return true;
	});

	return [...list].sort((a, b) => {
		switch (filters.sort) {
			case "used": {
				const diff =
					(usedClassesByPromptId.get(b.id)?.size ?? 0) -
					(usedClassesByPromptId.get(a.id)?.size ?? 0);
				return diff !== 0 ? diff : b.createdAt.localeCompare(a.createdAt);
			}
			case "bandDesc":
			case "bandAsc": {
				const ba = parseBandNumber(a.band);
				const bb = parseBandNumber(b.band);
				if (ba === null && bb === null) {
					return a.title.localeCompare(b.title, "vi");
				}
				if (ba === null) return 1;
				if (bb === null) return -1;
				const diff = filters.sort === "bandDesc" ? bb - ba : ba - bb;
				return diff !== 0 ? diff : a.title.localeCompare(b.title, "vi");
			}
			case "az":
				return a.title.localeCompare(b.title, "vi");
			case "new":
			default:
				return b.createdAt.localeCompare(a.createdAt);
		}
	});
}

export function buildHistoryItemView(
	ca: ClassAssignment,
	className: string,
	todayVN: string,
	nowMs?: number,
): HistoryItemView {
	const submittedCount = ca.targets.filter(
		(t) => t.submittedAt !== null || t.attemptId != null,
	).length;
	const totalCount = ca.targets.length;
	const pct =
		totalCount > 0 ? Math.round((submittedCount / totalCount) * 100) : 0;
	const rollup = rollupStatus(ca, todayVN, nowMs);
	const badgeKey: HistoryItemView["badgeKey"] =
		rollup.label === "Đã nộp hết"
			? "closed"
			: rollup.label === "Quá hạn"
				? "late"
				: "open";
	const missing = Math.max(0, totalCount - submittedCount);
	const badgeLabel =
		rollup.label === "Quá hạn" ? `Quá hạn · thiếu ${missing}` : rollup.label;

	return {
		assignment: ca,
		className,
		submittedCount,
		totalCount,
		pct,
		badgeKey,
		badgeLabel,
		dueDisplay: fmtDueDisplay(ca.due, ca.dueAt),
	};
}

function clampDuplicateTitle(rawTitle: string): string {
	const base = rawTitle.trim() || "Đề chưa đặt tên";
	const maxBaseLen = MAX_PROMPT_TITLE - DUPLICATE_SUFFIX.length;
	const clipped = base.slice(0, maxBaseLen).trimEnd();
	return `${clipped || "Đề chưa đặt tên"}${DUPLICATE_SUFFIX}`;
}

export function buildDuplicatePromptPayload(
	prompt: AssignmentPrompt,
):
	| { ok: true; payload: AssignmentPromptCreate }
	| { ok: false; error: string } {
	const rawSkill = prompt.skill ?? "writing";
	const skill: AssignmentSkill = (
		ASSIGNMENT_SKILLS as readonly string[]
	).includes(rawSkill)
		? (rawSkill as AssignmentSkill)
		: "writing";

	const skillConfig = ASSIGNMENT_PART_TYPES[skill];
	const rawPart = prompt.part ?? prompt.task ?? "";
	const part = skillConfig.parts.includes(rawPart)
		? rawPart
		: (skillConfig.parts[0] ?? "");

	const partTypes = skillConfig.types[part] ?? [];
	const rawType = prompt.type ?? prompt.genre ?? "";
	const type = partTypes.includes(rawType)
		? rawType
		: skill === "writing"
			? ""
			: (partTypes[0] ?? "");

	const band: AssignmentBand = (ASSIGNMENT_BANDS as readonly string[]).includes(
		prompt.band,
	)
		? (prompt.band as AssignmentBand)
		: DEFAULT_ASSIGNMENT_BAND;

	const level = (prompt.level ?? "").trim().slice(0, 100);
	const imageUrlRaw = (prompt.imageUrl ?? "").trim();
	const imageUrl =
		imageUrlRaw && isAssignmentImageUrl(imageUrlRaw) ? imageUrlRaw : "";

	const audioUrlRaw = (prompt.audioUrl ?? "").trim();
	const audioUrl =
		skill === "listening" &&
		audioUrlRaw &&
		isAllowedStudyPackAudioUrl(audioUrlRaw)
			? audioUrlRaw
			: undefined;

	const auto = isAutoSkill(skill);

	let questions: AssignmentQuestion[] = [];
	if (auto) {
		questions = (prompt.questions ?? []).slice(0, 40).map((q) => {
			const qType = q.type && partTypes.includes(q.type) ? q.type : null;
			const kind = answerKindByType[qType ?? type] ?? null;

			let opts: string[] | null = Array.isArray(q.opts)
				? q.opts.slice(0, 8).map((o) => String(o).slice(0, 500))
				: null;
			if (kind && mcqOptionsIssue(kind, opts)) {
				opts = null;
			}

			let answer = (q.answer ?? "").trim().slice(0, 200);
			if (kind && answer) {
				const allowed =
					kind === "mcq4" || kind === "mcq3"
						? effectiveAnswerChoices(kind, opts)
						: extendedAnswerChoices(kind);
				if (!allowed.includes(answer)) {
					answer = "";
				}
			}

			const pin =
				q.pin &&
				typeof q.pin.x === "number" &&
				typeof q.pin.y === "number" &&
				q.pin.x >= 0 &&
				q.pin.x <= 100 &&
				q.pin.y >= 0 &&
				q.pin.y <= 100
					? { x: q.pin.x, y: q.pin.y }
					: null;

			return {
				stem: (q.stem ?? "").trim().slice(0, 500),
				opts,
				answer,
				alts: (q.alts ?? "").slice(0, 500),
				...(qType ? { type: qType } : {}),
				...(pin ? { pin } : {}),
				...(typeof q.explanation === "string" && !isEmptyRichText(q.explanation)
					? { explanation: q.explanation.trim().slice(0, 2000) }
					: {}),
				...(typeof q.answerSet === "string" && q.answerSet.trim()
					? { answerSet: q.answerSet.trim().slice(0, 20) }
					: {}),
			};
		});
	}

	const bankKind = auto
		? optionBankKindFor(
				skill,
				type,
				questions.map((q) => q.type),
			)
		: undefined;
	const optionBank = bankKind
		? (prompt.optionBank ?? [])
				.map((item) => item.trim().slice(0, 200))
				.filter((item) => item.length > 0)
				.slice(0, ASSIGNMENT_OPTION_BANK_MAX)
		: [];

	let writing: AssignmentWritingSection | undefined;
	if (auto && prompt.writing != null) {
		const parsedWriting = assignmentWritingSectionSchema.safeParse({
			part: prompt.writing.part,
			type: prompt.writing.type,
			prompt: prompt.writing.prompt,
		});
		if (parsedWriting.success) {
			writing = parsedWriting.data;
		}
	}

	const candidate: AssignmentPromptCreate = {
		skill,
		part,
		type,
		title: clampDuplicateTitle(prompt.title),
		band,
		...(level ? { level } : {}),
		source: (prompt.source ?? "").trim().slice(0, 200),
		prompt: (prompt.prompt ?? "").trim(),
		passage: (prompt.passage ?? "").trim(),
		intro: prompt.intro ?? "",
		transcript: prompt.transcript ?? "",
		cueTopic: (prompt.cueTopic ?? "").trim().slice(0, 500),
		cuePoints: (prompt.cuePoints ?? "").slice(0, 2000),
		audioName: (prompt.audioName ?? "").trim().slice(0, 200),
		...(audioUrl ? { audioUrl } : {}),
		imageUrl,
		questions,
		optionBank,
		note: (prompt.note ?? "").trim(),
		status: "draft",
		...(writing ? { writing } : {}),
	};

	const parsed = assignmentPromptCreateSchema.safeParse(candidate);
	if (!parsed.success) {
		return {
			ok: false,
			error:
				"Đề này chưa đủ nội dung hợp lệ để nhân bản. Hãy mở sửa rồi lưu lại trước.",
		};
	}
	return { ok: true, payload: parsed.data };
}
