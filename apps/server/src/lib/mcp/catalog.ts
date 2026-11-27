import {
	ASSIGNMENT_ANSWER_CHOICES,
	ASSIGNMENT_BANDS,
	ASSIGNMENT_IMAGE_BASED_TYPES,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_OPTION_BANK_TYPES,
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_SKILLS,
	ASSIGNMENT_TEST_PRESETS,
	type AssignmentSkill,
	answerKindByType,
	PRACTICE_SKILLS,
	QUIZ_TYPE_DISPLAY,
} from "@teacher-os/api/contracts";

export interface McpCatalogTypeInfo {
	id: string;
	label: string;
	instruction: string;
	answerKind: string | null;
	answerChoices: readonly string[] | null;
	requiresOptionBank: boolean;
	requiresImageAndPins: boolean;
	requiresBlankMarker: boolean;
}

export interface McpCatalogPartInfo {
	part: string;
	label: string;
	types: McpCatalogTypeInfo[];
}

export interface McpSkillCatalog {
	skill: AssignmentSkill;
	supportsQuestions: boolean;
	supportsWritingSection: boolean;
	supportsFullTest: boolean;
	requiresAudioWhenReady: boolean;
	parts: McpCatalogPartInfo[];
}

export interface McpAssignmentCatalog {
	skills: McpSkillCatalog[];
	bands: readonly string[];
	fullTestSkills: readonly string[];
	optionBankMaxItems: number;
	rules: {
		defaultStatus: "draft";
		gapBlankMarker: "____ (exact 1 per gap stem)";
		richTextFields: readonly string[];
		plainTextFields: readonly string[];
		imageUrlPattern: "https://... (max 500 chars)";
		mediaNotice: string;
	};
}

function buildSkillCatalog(skill: AssignmentSkill): McpSkillCatalog {
	const config = ASSIGNMENT_PART_TYPES[skill];
	const preset = ASSIGNMENT_TEST_PRESETS[skill];
	const labelByPart = new Map(
		preset.slots.map((slot) => [slot.part, slot.label]),
	);
	const optionBankTypes = new Set(ASSIGNMENT_OPTION_BANK_TYPES[skill] ?? []);
	const imageBasedTypes = new Set(ASSIGNMENT_IMAGE_BASED_TYPES[skill] ?? []);

	const parts: McpCatalogPartInfo[] = config.parts.map((part) => {
		const typeIds = config.types[part] ?? [];
		return {
			part,
			label: labelByPart.get(part) ?? part,
			types: typeIds.map((typeId) => {
				const kind = answerKindByType[typeId] ?? null;
				const display = QUIZ_TYPE_DISPLAY[typeId] ?? {
					label: typeId,
					instruction: "",
				};
				return {
					id: typeId,
					label: display.label,
					instruction: display.instruction,
					answerKind: kind,
					answerChoices: kind ? ASSIGNMENT_ANSWER_CHOICES[kind] : null,
					requiresOptionBank: optionBankTypes.has(typeId),
					requiresImageAndPins: imageBasedTypes.has(typeId),
					requiresBlankMarker: typeId === "gap",
				};
			}),
		};
	});

	const supportsQuestions =
		skill === "reading" ||
		skill === "listening" ||
		skill === "grammar" ||
		skill === "vocabulary";

	return {
		skill,
		supportsQuestions,
		supportsWritingSection: supportsQuestions,
		supportsFullTest: (PRACTICE_SKILLS as readonly string[]).includes(skill),
		requiresAudioWhenReady: skill === "listening",
		parts,
	};
}

export function buildAssignmentCatalog(
	skillFilter?: AssignmentSkill,
): McpAssignmentCatalog {
	const skills = (skillFilter ? [skillFilter] : [...ASSIGNMENT_SKILLS]).map(
		buildSkillCatalog,
	);
	return {
		skills,
		bands: ASSIGNMENT_BANDS,
		fullTestSkills: PRACTICE_SKILLS,
		optionBankMaxItems: ASSIGNMENT_OPTION_BANK_MAX,
		rules: {
			defaultStatus: "draft",
			gapBlankMarker: "____ (exact 1 per gap stem)",
			richTextFields: ["prompt", "passage", "intro", "transcript", "note"],
			plainTextFields: ["cueTopic", "cuePoints", "stem", "answer", "alts"],
			imageUrlPattern: "https://... (max 500 chars)",
			mediaNotice:
				"Listening audio files and Diagram/Map images + pin coordinates cannot be uploaded via MCP; prompts created without required media stay in draft so teachers can upload media on the web.",
		},
	};
}
