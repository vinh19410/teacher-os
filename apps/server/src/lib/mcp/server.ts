import { type CallToolResult, McpServer } from "@modelcontextprotocol/server";
import {
	ASSIGNMENT_BANDS,
	ASSIGNMENT_OPTION_BANK_MAX,
	ASSIGNMENT_SKILLS,
	assignmentPromptCreateSchema,
	assignmentPromptUpdateSchema,
	assignmentTestCreateSchema,
	assignmentTestPartsSetSchema,
	assignmentTestUpdateSchema,
	DEFAULT_ASSIGNMENT_BAND,
	isImageBasedType,
	PRACTICE_SKILLS,
} from "@teacher-os/api/contracts";
import * as z from "zod/v4";
import type { Db } from "../../app";
import {
	createAssignmentPrompt,
	createAssignmentTest,
	getAssignmentPromptDetail,
	getAssignmentTestDetail,
	listAssignmentPrompts,
	listAssignmentTests,
	setAssignmentTestParts,
	updateAssignmentPrompt,
	updateAssignmentTest,
} from "../assignments/assignment-service";
import { buildAssignmentCatalog } from "./catalog";
import type { McpPrincipal } from "./token-service";

const CHARACTER_LIMIT = 25_000;

export interface TeacherMcpDeps {
	getDb(): Db;
	appOrigin?: string;
	now?: () => Date;
}

function buildTeacherUrls(appOrigin: string | undefined) {
	const base = (appOrigin ?? "").trim().replace(/\/+$/, "") || "/teacher";
	return {
		previewPrompt: (id: string) =>
			`${base}/assignments/preview?id=${encodeURIComponent(id)}`,
		editPrompt: (id: string) =>
			`${base}/assignments/new?promptId=${encodeURIComponent(id)}`,
		bankList: `${base}/assignments`,
		testBuilder: (id: string) =>
			`${base}/assignments/tests/${encodeURIComponent(id)}`,
	};
}

function jsonToolResult<T extends Record<string, unknown>>(
	output: T,
): CallToolResult {
	return {
		content: [{ type: "text", text: JSON.stringify(output) }],
		structuredContent: output,
	};
}

function toolError(message: string): CallToolResult {
	return {
		content: [{ type: "text", text: message }],
		isError: true,
	};
}

function formatZodIssues(issues: readonly z.core.$ZodIssue[]): string {
	return issues
		.map((issue) => {
			const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
			return `${path}: ${issue.message}`;
		})
		.join("; ");
}

function formatPromptServiceError(
	error: string,
	code?: string,
	question?: number,
): string {
	if (code === "PROMPT_CONTENT_LOCKED") {
		return "Error (PROMPT_CONTENT_LOCKED): This prompt already has student quiz attempts, so content fields (type, prompt, passage, questions, optionBank, writing) are locked. You can still update metadata (title, band, level, source, status) or create a new prompt.";
	}
	if (code === "WRITING_SECTION_LOCKED") {
		return "Error (WRITING_SECTION_LOCKED): The hybrid writing section cannot be modified or removed because this prompt is already assigned to a class, test, or study pack.";
	}
	if (question !== undefined) {
		return `Validation error at questions[${question}]: ${error}. Call get_assignment_catalog to inspect valid question types and answer choices.`;
	}
	return `Error: ${error}.`;
}

function formatTestServiceError(error: string, code?: string): string {
	if (code === "TEST_PARTS_LOCKED") {
		return "Error (TEST_PARTS_LOCKED): This full test already has student quiz attempts, so its parts cannot be changed or removed. Create a new test or update only test metadata.";
	}
	return `Error: ${error}.`;
}

function shrinkPageToLimit<T>(
	items: T[],
	buildPage: (slice: T[]) => Record<string, unknown>,
): Record<string, unknown> {
	let current = items;
	while (
		current.length > 1 &&
		JSON.stringify(buildPage(current)).length > CHARACTER_LIMIT
	) {
		current = current.slice(0, Math.floor(current.length / 2));
	}
	return buildPage(current);
}

const catalogOutputSchema = z.object({
	skills: z.array(z.unknown()),
	bands: z.array(z.string()),
	fullTestSkills: z.array(z.string()),
	optionBankMaxItems: z.number().int(),
	rules: z.object({
		defaultStatus: z.literal("draft"),
		gapBlankMarker: z.string(),
		richTextFields: z.array(z.string()),
		plainTextFields: z.array(z.string()),
		imageUrlPattern: z.string(),
		mediaNotice: z.string(),
	}),
});

const promptSummarySchema = z.object({
	id: z.string(),
	title: z.string(),
	skill: z.string(),
	part: z.string(),
	type: z.string(),
	band: z.string(),
	level: z.string(),
	source: z.string(),
	status: z.string(),
	questionCount: z.number().int(),
	hasWritingSection: z.boolean(),
	hasAudio: z.boolean(),
	hasImage: z.boolean(),
	createdAt: z.string(),
	previewUrl: z.string(),
	editUrl: z.string(),
});

const listPromptsOutputSchema = z.object({
	prompts: z.array(promptSummarySchema),
	total: z.number().int(),
	has_more: z.boolean(),
	next_offset: z.number().int().optional(),
});

const mcpQuestionInputSchema = z
	.object({
		stem: z
			.string()
			.trim()
			.max(500)
			.describe(
				"Question text or statement. For gap-fill ('gap'), include exactly one '____' blank.",
			),
		opts: z
			.array(z.string().max(500))
			.max(8)
			.nullish()
			.describe(
				"Answer choices for MCQ types (3 items for mcq1/mcq3, 4 items for mcq).",
			),
		answer: z
			.string()
			.trim()
			.max(200)
			.describe(
				"Correct answer key (e.g. 'TRUE', 'A', 'i', or exact completion word/phrase).",
			),
		alts: z
			.string()
			.max(500)
			.default("")
			.describe(
				"Optional alternative accepted answers separated by '|', e.g. 'colour|color'.",
			),
		type: z
			.string()
			.trim()
			.min(1)
			.max(20)
			.nullish()
			.describe(
				"Optional per-question type override for mixed-type prompts (must belong to the part catalog).",
			),
		pin: z
			.object({
				x: z.number().min(0).max(100),
				y: z.number().min(0).max(100),
			})
			.strict()
			.nullish()
			.describe("Pin coordinates (0-100%) for diagram/map image questions."),
		explanation: z
			.string()
			.trim()
			.max(5000)
			.optional()
			.describe(
				"Optional feedback/explanation shown to the student after submission.",
			),
		answerSet: z
			.string()
			.trim()
			.min(1)
			.max(20)
			.nullish()
			.describe(
				"Optional unordered answer-set key (e.g. 'set1') for 'Choose TWO' questions.",
			),
	})
	.strict();

const mcpWritingInputSchema = z
	.object({
		part: z.string().trim().min(1).max(20),
		type: z.string().trim().min(1).max(20),
		prompt: z.string(),
	})
	.strict();

const createPromptInputSchema = z
	.object({
		skill: z
			.enum(ASSIGNMENT_SKILLS)
			.describe(
				"IELTS skill: writing, reading, listening, speaking, grammar, or vocabulary.",
			),
		part: z
			.string()
			.trim()
			.min(1)
			.max(20)
			.describe(
				"Part/slot id from get_assignment_catalog (e.g. p1, task2, s1, part2, g1, v1).",
			),
		type: z
			.string()
			.trim()
			.max(20)
			.default("")
			.describe(
				"Question/task type id from get_assignment_catalog (e.g. tfng, discuss, form, mcq).",
			),
		title: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe("Prompt title shown in the bank."),
		band: z
			.enum(ASSIGNMENT_BANDS)
			.default(DEFAULT_ASSIGNMENT_BAND)
			.describe("Target IELTS band (5.0 to 8.0, step 0.5)."),
		level: z.string().trim().max(100).optional(),
		source: z
			.string()
			.trim()
			.max(200)
			.default("")
			.describe("Source label, e.g. 'Cambridge 18 Test 2'."),
		prompt: z
			.string()
			.default("")
			.describe(
				"Main prompt / instructions HTML or text (required for writing and speaking part1/part3).",
			),
		passage: z
			.string()
			.default("")
			.describe("Reading passage HTML or text (required for reading)."),
		intro: z
			.string()
			.default("")
			.describe("Optional introductory context HTML or text."),
		transcript: z
			.string()
			.default("")
			.describe("Optional listening transcript HTML or text."),
		cueTopic: z
			.string()
			.trim()
			.max(500)
			.default("")
			.describe(
				"Speaking Part 2 cue card topic (required for speaking part2).",
			),
		cuePoints: z
			.string()
			.max(2000)
			.default("")
			.describe("Speaking Part 2 bullet points, one per line."),
		audioName: z.string().trim().max(200).default(""),
		audioUrl: z.string().trim().max(500).optional(),
		imageUrl: z.string().trim().max(500).default(""),
		questions: z
			.array(mcpQuestionInputSchema)
			.max(40)
			.default([])
			.describe("Questions array for reading/listening/grammar/vocabulary."),
		optionBank: z
			.array(z.string().trim().min(1).max(200))
			.max(ASSIGNMENT_OPTION_BANK_MAX)
			.default([])
			.describe(
				"Shared option bank (2-8 items) for matching/headings/map types.",
			),
		note: z.string().default("").describe("Teacher-only note."),
		status: z
			.enum(["draft", "ready"])
			.default("draft")
			.describe(
				"Use 'draft' by default; set 'ready' only when explicitly requested and complete.",
			),
		writing: mcpWritingInputSchema
			.nullable()
			.optional()
			.describe(
				"Optional hybrid Writing section attached to auto-gradable skills.",
			),
	})
	.strict();

const updatePromptInputSchema = z
	.object({
		prompt_id: z
			.string()
			.trim()
			.min(1)
			.describe("ID of the assignment prompt to update."),
		type: z.string().trim().max(20).optional(),
		title: z.string().trim().min(1).max(200).optional(),
		band: z.enum(ASSIGNMENT_BANDS).optional(),
		level: z.string().trim().max(100).optional(),
		source: z.string().trim().max(200).optional(),
		prompt: z.string().optional(),
		passage: z.string().optional(),
		intro: z.string().optional(),
		transcript: z.string().optional(),
		cueTopic: z.string().trim().max(500).optional(),
		cuePoints: z.string().max(2000).optional(),
		audioName: z.string().trim().max(200).optional(),
		audioUrl: z.string().trim().max(500).optional(),
		imageUrl: z.string().trim().max(500).optional(),
		questions: z.array(mcpQuestionInputSchema).max(40).optional(),
		optionBank: z
			.array(z.string().trim().min(1).max(200))
			.max(ASSIGNMENT_OPTION_BANK_MAX)
			.optional(),
		note: z.string().optional(),
		status: z.enum(["draft", "ready"]).optional(),
		writing: mcpWritingInputSchema.nullable().optional(),
	})
	.strict();

const testPartInputSchema = z
	.object({
		part: z.string().trim().min(1).max(20),
		promptId: z.string().trim().min(1).max(100),
		qStartOverride: z.number().int().gt(0).optional(),
	})
	.strict();

function missingMediaForReady(input: {
	skill: string;
	type: string;
	audioName: string;
	audioUrl?: string;
	imageUrl: string;
	questions: ReadonlyArray<{ pin?: unknown }>;
}): string | null {
	if (
		input.skill === "listening" &&
		!input.audioName.trim() &&
		!(input.audioUrl ?? "").trim()
	) {
		return "Đề Listening chưa có file âm thanh (audio), nên hệ thống đã lưu ở trạng thái nháp (draft). Giáo viên vui lòng mở link chỉnh sửa trên web để tải audio rồi chuyển sang Sẵn sàng.";
	}
	if (isImageBasedType(input.skill, input.type)) {
		const missingImage = !input.imageUrl.trim();
		const missingPin = input.questions.some((q) => !q.pin);
		if (missingImage || missingPin) {
			return "Đề dạng hình ảnh (Diagram/Map) cần ảnh minh họa và tọa độ pin trên web trước khi đánh dấu Sẵn sàng, nên hệ thống đã lưu ở trạng thái nháp (draft).";
		}
	}
	return null;
}

export function buildTeacherMcpServer(
	principal: McpPrincipal,
	deps: TeacherMcpDeps,
): McpServer {
	const server = new McpServer({
		name: "teacher-os-mcp",
		version: "1.0.0",
	});
	const urls = buildTeacherUrls(deps.appOrigin);

	server.registerResource(
		"assignment-catalog",
		"teacheros://catalog/assignments",
		{
			title: "Teacher OS Assignment Catalog",
			description:
				"Complete IELTS assignment skills, parts, types, answer choices, option bank rules, and full test slots.",
			mimeType: "application/json",
		},
		async () => ({
			contents: [
				{
					uri: "teacheros://catalog/assignments",
					mimeType: "application/json",
					text: JSON.stringify(buildAssignmentCatalog(), null, 2),
				},
			],
		}),
	);

	server.registerPrompt(
		"create_ielts_prompt",
		{
			title: "Soạn đề bài tập IELTS",
			description:
				"Hướng dẫn Claude soạn một đề bài tập chuẩn Teacher OS (6 kỹ năng) bằng MCP tools.",
			argsSchema: z.object({
				skill: z
					.enum(ASSIGNMENT_SKILLS)
					.describe(
						"Kỹ năng cần soạn: reading, writing, listening, speaking, grammar, vocabulary",
					),
				topic: z.string().min(1).describe("Chủ đề hoặc nội dung bài tập"),
				band: z
					.enum(ASSIGNMENT_BANDS)
					.default(DEFAULT_ASSIGNMENT_BAND)
					.describe("Mức band mục tiêu"),
			}),
		},
		async ({ skill, topic, band }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							`Hãy tạo 1 đề bài tập IELTS kỹ năng ${skill}, band ${band}, chủ đề "${topic}" trong Teacher OS.\n` +
							"Quy trình bắt buộc:\n" +
							`1. Gọi tool get_assignment_catalog với skill="${skill}" để lấy đúng part, type, quy tắc đáp án và optionBank.\n` +
							"2. Soạn nội dung học thuật chất lượng cao, đầy đủ giải thích đáp án (explanation) cho từng câu hỏi trắc nghiệm/điền từ.\n" +
							'3. Gọi tool create_assignment_prompt với status="draft" (trừ khi giáo viên yêu cầu rõ "ready" và đủ media).\n' +
							"4. Trả lại cho giáo viên tóm tắt đề vừa tạo kèm previewUrl và editUrl.",
					},
				},
			],
		}),
	);

	server.registerPrompt(
		"create_ielts_full_test",
		{
			title: "Soạn bộ đề Full Test IELTS",
			description:
				"Hướng dẫn Claude soạn các part còn thiếu và ghép thành một Full Test hoàn chỉnh.",
			argsSchema: z.object({
				skill: z
					.enum(PRACTICE_SKILLS)
					.describe("Kỹ năng Full Test: reading, listening, writing, speaking"),
				title: z.string().min(1).describe("Tên bộ đề Full Test"),
				topic: z.string().min(1).describe("Chủ đề xuyên suốt hoặc mô tả bộ đề"),
			}),
		},
		async ({ skill, title, topic }) => ({
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text:
							`Hãy tạo một bộ đề Full Test kỹ năng ${skill} có tiêu đề "${title}" về "${topic}".\n` +
							"Quy trình bắt buộc:\n" +
							`1. Gọi get_assignment_catalog(skill="${skill}") để xem đủ các slot part cần thiết của Full Test.\n` +
							"2. Tạo từng prompt theo đúng từng slot part bằng create_assignment_prompt (không gắn hybrid writing cho prompt dùng trong Full Test).\n" +
							"3. Gọi create_assignment_test kèm mảng parts để tạo và ghép toàn bộ slot trong một bước.\n" +
							"4. Trả lại tóm tắt các part đã tạo, ID Full Test và đường dẫn xem trên web.",
					},
				},
			],
		}),
	);

	server.registerTool(
		"get_assignment_catalog",
		{
			title: "Get assignment catalog",
			description:
				"Get valid Teacher OS IELTS skills, parts, question types, answer choices, optionBank rules, image/pin rules, and full test slots. Call this before create_assignment_prompt or create_assignment_test.",
			inputSchema: z
				.object({
					skill: z
						.enum(ASSIGNMENT_SKILLS)
						.optional()
						.describe("Optional skill filter to keep the response compact."),
				})
				.strict(),
			outputSchema: catalogOutputSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ skill }) => {
			return jsonToolResult(
				buildAssignmentCatalog(skill) as unknown as Record<string, unknown>,
			);
		},
	);

	server.registerTool(
		"list_assignment_prompts",
		{
			title: "List assignment prompts",
			description:
				"List assignment prompts in the teacher's bank with optional filters and pagination. Use get_assignment_prompt to inspect full passage/questions.",
			inputSchema: z
				.object({
					skill: z.enum(ASSIGNMENT_SKILLS).optional(),
					part: z.string().trim().min(1).max(20).optional(),
					status: z.enum(["draft", "ready"]).optional(),
					query: z.string().trim().max(100).optional(),
					limit: z.number().int().min(1).max(50).default(20),
					offset: z.number().int().min(0).default(0),
				})
				.strict(),
			outputSchema: listPromptsOutputSchema,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ skill, part, status, query, limit, offset }) => {
			const page = await listAssignmentPrompts(deps.getDb(), principal.orgId, {
				skill,
				part,
				status,
				query,
				limit,
				offset,
			});
			const mapped = page.items.map((item) => ({
				...item,
				previewUrl: urls.previewPrompt(item.id),
				editUrl: urls.editPrompt(item.id),
			}));
			const bounded = shrinkPageToLimit(mapped, (slice) => {
				const more = offset + slice.length < page.total;
				return {
					prompts: slice,
					total: page.total,
					has_more: more,
					...(more ? { next_offset: offset + slice.length } : {}),
				};
			});
			return jsonToolResult(bounded);
		},
	);

	server.registerTool(
		"get_assignment_prompt",
		{
			title: "Get assignment prompt",
			description:
				"Fetch full details of a single assignment prompt including passage, prompt HTML, questions, optionBank, writing section, lock flags, and web links.",
			inputSchema: z
				.object({
					prompt_id: z.string().trim().min(1),
				})
				.strict(),
			outputSchema: z.object({
				prompt: z.record(z.string(), z.unknown()),
				previewUrl: z.string(),
				editUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ prompt_id }) => {
			const detail = await getAssignmentPromptDetail(
				deps.getDb(),
				principal.orgId,
				prompt_id,
			);
			if (!detail) {
				return toolError(
					`Assignment prompt '${prompt_id}' was not found in your organization. Call list_assignment_prompts to find valid prompt IDs.`,
				);
			}
			return jsonToolResult({
				prompt: detail as unknown as Record<string, unknown>,
				previewUrl: urls.previewPrompt(detail.id),
				editUrl: urls.editPrompt(detail.id),
			});
		},
	);

	server.registerTool(
		"create_assignment_prompt",
		{
			title: "Create assignment prompt",
			description:
				"Create a new IELTS assignment prompt in the teacher's bank (supports writing, reading, listening, speaking, grammar, vocabulary). Defaults to 'draft'. Listening prompts without audio or diagram/map prompts without image/pins automatically stay in 'draft' with a mediaNotice.",
			inputSchema: createPromptInputSchema,
			outputSchema: z.object({
				id: z.string(),
				title: z.string(),
				skill: z.string(),
				part: z.string(),
				type: z.string(),
				status: z.enum(["draft", "ready"]),
				questionCount: z.number().int(),
				downgradedToDraft: z.boolean(),
				mediaNotice: z.string().nullable(),
				previewUrl: z.string(),
				editUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async (rawInput) => {
			let effectiveStatus = rawInput.status;
			let downgradedToDraft = false;
			let mediaNotice: string | null = null;

			if (effectiveStatus === "ready") {
				const reason = missingMediaForReady({
					skill: rawInput.skill,
					type: rawInput.type,
					audioName: rawInput.audioName,
					audioUrl: rawInput.audioUrl,
					imageUrl: rawInput.imageUrl,
					questions: rawInput.questions,
				});
				if (reason) {
					effectiveStatus = "draft";
					downgradedToDraft = true;
					mediaNotice = reason;
				}
			}

			const parsed = assignmentPromptCreateSchema.safeParse({
				...rawInput,
				status: effectiveStatus,
			});
			if (!parsed.success) {
				return toolError(
					`Invalid assignment prompt payload: ${formatZodIssues(parsed.error.issues)}. Call get_assignment_catalog to verify valid part, type, answer choices, and optionBank rules.`,
				);
			}

			const created = await createAssignmentPrompt(
				deps.getDb(),
				principal.orgId,
				parsed.data,
			);
			if (!created.ok) {
				return toolError(
					formatPromptServiceError(
						created.error,
						created.code,
						created.question,
					),
				);
			}

			return jsonToolResult({
				id: created.data.id,
				title: parsed.data.title,
				skill: parsed.data.skill,
				part: parsed.data.part,
				type: parsed.data.type,
				status: parsed.data.status,
				questionCount: parsed.data.questions.length,
				downgradedToDraft,
				mediaNotice,
				previewUrl: urls.previewPrompt(created.data.id),
				editUrl: urls.editPrompt(created.data.id),
			});
		},
	);

	server.registerTool(
		"update_assignment_prompt",
		{
			title: "Update assignment prompt",
			description:
				"Update metadata or content of an existing assignment prompt. Respects PROMPT_CONTENT_LOCKED and WRITING_SECTION_LOCKED when students have already attempted the prompt. Cannot change skill or part.",
			inputSchema: updatePromptInputSchema,
			outputSchema: z.object({
				id: z.string(),
				status: z.string(),
				previewUrl: z.string(),
				editUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ prompt_id, ...patch }) => {
			const parsed = assignmentPromptUpdateSchema.safeParse(patch);
			if (!parsed.success) {
				return toolError(
					`Invalid update payload: ${formatZodIssues(parsed.error.issues)}.`,
				);
			}

			const existing = await getAssignmentPromptDetail(
				deps.getDb(),
				principal.orgId,
				prompt_id,
			);
			if (!existing) {
				return toolError(
					`Assignment prompt '${prompt_id}' was not found in your organization.`,
				);
			}

			const effectiveStatus = parsed.data.status ?? existing.status;
			if (effectiveStatus === "ready") {
				const effectiveQuestions = parsed.data.questions ?? existing.questions;
				const effectiveAudioName = parsed.data.audioName ?? existing.audioName;
				const effectiveAudioUrl =
					parsed.data.audioUrl ?? (existing.audioUrl || undefined);
				const effectiveImageUrl = parsed.data.imageUrl ?? existing.imageUrl;
				const effectiveType = parsed.data.type ?? existing.type;

				const reason = missingMediaForReady({
					skill: existing.skill,
					type: effectiveType,
					audioName: effectiveAudioName,
					audioUrl: effectiveAudioUrl,
					imageUrl: effectiveImageUrl,
					questions: effectiveQuestions,
				});
				if (reason) {
					return toolError(
						`Cannot mark prompt '${prompt_id}' as ready: ${reason} Edit link: ${urls.editPrompt(prompt_id)}`,
					);
				}

				if (!existing.hasLibraryRef) {
					const mergedCandidate = {
						skill: existing.skill,
						part: existing.part,
						type: effectiveType,
						title: parsed.data.title ?? existing.title,
						band: parsed.data.band ?? existing.band,
						level: parsed.data.level ?? existing.level,
						source: parsed.data.source ?? existing.source,
						prompt: parsed.data.prompt ?? existing.prompt,
						passage: parsed.data.passage ?? existing.passage,
						intro: parsed.data.intro ?? existing.intro,
						transcript: parsed.data.transcript ?? existing.transcript,
						cueTopic: parsed.data.cueTopic ?? existing.cueTopic,
						cuePoints: parsed.data.cuePoints ?? existing.cuePoints,
						audioName: effectiveAudioName,
						...(effectiveAudioUrl ? { audioUrl: effectiveAudioUrl } : {}),
						imageUrl: effectiveImageUrl,
						questions: effectiveQuestions,
						optionBank: parsed.data.optionBank ?? existing.optionBank,
						note: parsed.data.note ?? existing.note,
						status: "ready" as const,
						writing:
							parsed.data.writing !== undefined
								? parsed.data.writing
								: existing.writing,
					};
					const readyCheck =
						assignmentPromptCreateSchema.safeParse(mergedCandidate);
					if (!readyCheck.success) {
						return toolError(
							`Cannot mark prompt '${prompt_id}' as ready because required content is incomplete or invalid: ${formatZodIssues(readyCheck.error.issues)}.`,
						);
					}
				}
			}

			const updated = await updateAssignmentPrompt(
				deps.getDb(),
				principal.orgId,
				prompt_id,
				parsed.data,
			);
			if (!updated.ok) {
				return toolError(
					formatPromptServiceError(
						updated.error,
						updated.code,
						updated.question,
					),
				);
			}

			return jsonToolResult({
				id: updated.data.id,
				status: effectiveStatus,
				previewUrl: urls.previewPrompt(updated.data.id),
				editUrl: urls.editPrompt(updated.data.id),
			});
		},
	);

	server.registerTool(
		"list_assignment_tests",
		{
			title: "List full tests",
			description:
				"List full-skill IELTS tests (assignment_test) in the teacher's bank with slot progress.",
			inputSchema: z
				.object({
					skill: z.enum(PRACTICE_SKILLS).optional(),
					status: z.enum(["draft", "ready"]).optional(),
					query: z.string().trim().max(100).optional(),
					limit: z.number().int().min(1).max(50).default(20),
					offset: z.number().int().min(0).default(0),
				})
				.strict(),
			outputSchema: z.object({
				tests: z.array(z.record(z.string(), z.unknown())),
				total: z.number().int(),
				has_more: z.boolean(),
				next_offset: z.number().int().optional(),
			}),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ skill, status, query, limit, offset }) => {
			const page = await listAssignmentTests(deps.getDb(), principal.orgId, {
				skill,
				status,
				query,
				limit,
				offset,
			});
			const mapped = page.items.map((item) => ({
				...item,
				testUrl: urls.testBuilder(item.id),
			}));
			const bounded = shrinkPageToLimit(mapped, (slice) => {
				const more = offset + slice.length < page.total;
				return {
					tests: slice,
					total: page.total,
					has_more: more,
					...(more ? { next_offset: offset + slice.length } : {}),
				};
			});
			return jsonToolResult(bounded);
		},
	);

	server.registerTool(
		"get_assignment_test",
		{
			title: "Get full test details",
			description:
				"Fetch details of a single full test including all attached slot parts and lock state.",
			inputSchema: z
				.object({
					test_id: z.string().trim().min(1),
				})
				.strict(),
			outputSchema: z.object({
				test: z.record(z.string(), z.unknown()),
				testUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ test_id }) => {
			const detail = await getAssignmentTestDetail(
				deps.getDb(),
				principal.orgId,
				test_id,
			);
			if (!detail) {
				return toolError(
					`Full test '${test_id}' was not found in your organization. Call list_assignment_tests to find valid test IDs.`,
				);
			}
			return jsonToolResult({
				test: detail as unknown as Record<string, unknown>,
				testUrl: urls.testBuilder(detail.id),
			});
		},
	);

	server.registerTool(
		"create_assignment_test",
		{
			title: "Create full test",
			description:
				"Create a new full-skill IELTS test (always starts as 'draft'). Optionally attach slot parts atomically in the same call.",
			inputSchema: z
				.object({
					title: z.string().trim().min(1).max(200),
					skill: z.enum(PRACTICE_SKILLS),
					timeLimitSeconds: z
						.number()
						.int()
						.gt(0)
						.max(3 * 3600)
						.nullable()
						.default(null),
					description: z.string().optional(),
					collection: z.string().trim().max(200).optional(),
					testGroup: z.string().trim().max(100).optional(),
					parts: z
						.array(testPartInputSchema)
						.max(4)
						.optional()
						.describe("Optional initial slot parts to attach atomically."),
				})
				.strict(),
			outputSchema: z.object({
				id: z.string(),
				title: z.string(),
				skill: z.string(),
				status: z.literal("draft"),
				partCount: z.number().int(),
				testUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		async ({ parts, ...testInput }) => {
			const parsedTest = assignmentTestCreateSchema.safeParse(testInput);
			if (!parsedTest.success) {
				return toolError(
					`Invalid full test payload: ${formatZodIssues(parsedTest.error.issues)}.`,
				);
			}
			let parsedParts: z.infer<typeof assignmentTestPartsSetSchema> | undefined;
			if (parts !== undefined) {
				const checkedParts = assignmentTestPartsSetSchema.safeParse(parts);
				if (!checkedParts.success) {
					return toolError(
						`Invalid test parts payload: ${formatZodIssues(checkedParts.error.issues)}.`,
					);
				}
				parsedParts = checkedParts.data;
			}
			const created = await createAssignmentTest(
				deps.getDb(),
				principal.orgId,
				parsedTest.data,
				parsedParts,
			);
			if (!created.ok) {
				return toolError(formatTestServiceError(created.error, created.code));
			}
			return jsonToolResult({
				id: created.data.id,
				title: parsedTest.data.title,
				skill: parsedTest.data.skill,
				status: "draft" as const,
				partCount: parsedParts?.length ?? 0,
				testUrl: urls.testBuilder(created.data.id),
			});
		},
	);

	server.registerTool(
		"update_assignment_test",
		{
			title: "Update full test",
			description:
				"Update full test metadata (title, description, timeLimitSeconds, collection, testGroup) or status ('draft' | 'ready'). Skill is immutable.",
			inputSchema: z
				.object({
					test_id: z.string().trim().min(1),
					title: z.string().trim().min(1).max(200).optional(),
					description: z.string().optional(),
					timeLimitSeconds: z
						.number()
						.int()
						.gt(0)
						.max(3 * 3600)
						.nullable()
						.optional(),
					collection: z.string().trim().max(200).optional(),
					testGroup: z.string().trim().max(100).optional(),
					status: z.enum(["draft", "ready"]).optional(),
				})
				.strict(),
			outputSchema: z.object({
				id: z.string(),
				testUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ test_id, ...patch }) => {
			const parsed = assignmentTestUpdateSchema.safeParse(patch);
			if (!parsed.success) {
				return toolError(
					`Invalid full test update payload: ${formatZodIssues(parsed.error.issues)}.`,
				);
			}
			const updated = await updateAssignmentTest(
				deps.getDb(),
				principal.orgId,
				test_id,
				parsed.data,
			);
			if (!updated.ok) {
				return toolError(formatTestServiceError(updated.error, updated.code));
			}
			return jsonToolResult({
				id: updated.data.id,
				testUrl: urls.testBuilder(updated.data.id),
			});
		},
	);

	server.registerTool(
		"set_assignment_test_parts",
		{
			title: "Set full test parts",
			description:
				"Replace all part slots of a full test with matching prompts from your organization's bank. Respects TEST_PARTS_LOCKED when students have already attempted the test.",
			inputSchema: z
				.object({
					test_id: z.string().trim().min(1),
					parts: z.array(testPartInputSchema).max(4),
				})
				.strict(),
			outputSchema: z.object({
				id: z.string(),
				partCount: z.number().int(),
				testUrl: z.string(),
			}),
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async ({ test_id, parts }) => {
			const parsed = assignmentTestPartsSetSchema.safeParse(parts);
			if (!parsed.success) {
				return toolError(
					`Invalid test parts payload: ${formatZodIssues(parsed.error.issues)}.`,
				);
			}
			const result = await setAssignmentTestParts(
				deps.getDb(),
				principal.orgId,
				test_id,
				parsed.data,
			);
			if (!result.ok) {
				return toolError(formatTestServiceError(result.error, result.code));
			}
			return jsonToolResult({
				id: result.data.id,
				partCount: parsed.data.length,
				testUrl: urls.testBuilder(result.data.id),
			});
		},
	);

	return server;
}
