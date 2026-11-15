import { PLACEMENT_AI_ERROR_CODES } from "@teacher-os/api/placement-test-contracts";
import { describe, expect, test } from "vitest";
import { PlacementAiGradingError } from "./grader";
import {
	createOpenAiPlacementGrader,
	createPlacementAiGrader,
	DEFAULT_OPENAI_GRADING_MODEL,
	DEFAULT_OPENAI_TRANSCRIBE_MODEL,
} from "./openai-grader";

const ESSAY = "Hi Ben, I lives in District 9. On weekend I go cycling.";

function chatResponse(content: unknown): Response {
	return Response.json({
		choices: [
			{
				message: {
					content:
						typeof content === "string" ? content : JSON.stringify(content),
				},
			},
		],
	});
}

function recordingFetch(respond: (url: string, init: RequestInit) => Response) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init: init ?? {} });
		return respond(url, init ?? {});
	}) as typeof fetch;
	return { calls, fetchImpl };
}

async function expectCode(promise: Promise<unknown>, code: string) {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	expect(error).toBeInstanceOf(PlacementAiGradingError);
	expect((error as PlacementAiGradingError).code).toBe(code);
}

describe("createPlacementAiGrader gate (#730)", () => {
	test("key rỗng → undefined; có key → grader", () => {
		expect(createPlacementAiGrader({})).toBeUndefined();
		expect(createPlacementAiGrader({ OPENAI_API_KEY: "  " })).toBeUndefined();
		expect(
			createPlacementAiGrader({ OPENAI_API_KEY: "sk-test" }),
		).toBeDefined();
	});
});

describe("OpenAI placement grader (#730)", () => {
	test("gradeWriting gửi json_schema strict + model mặc định, kẹp rubric, gán id, định vị lỗi", async () => {
		const { calls, fetchImpl } = recordingFetch(() =>
			chatResponse({
				rubric: { ct: 7, or: 2.6, lg: -1 },
				feedback: "  Bài viết tốt.  ",
				errors: [
					{
						category: "grammar",
						quote: "I lives",
						correction: "I live",
						explanation: "Chủ ngữ I dùng động từ nguyên mẫu.",
					},
					{
						category: "unknown",
						quote: "weekend",
						correction: "",
						explanation: "",
					},
					{
						category: "vocabulary",
						quote: "On weekend",
						correction: "At the weekend",
						explanation: "Cụm cố định.",
					},
					{
						category: "spelling",
						quote: "not in the essay",
						correction: "",
						explanation: "",
					},
				],
			}),
		);
		const grader = createOpenAiPlacementGrader({
			apiKey: "sk-secret",
			fetch: fetchImpl,
		});
		const draft = await grader.gradeWriting({
			prompt: "Write an email.",
			text: ESSAY,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-secret");
		expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
		const body = JSON.parse(String(calls[0]?.init.body));
		expect(body.model).toBe(DEFAULT_OPENAI_GRADING_MODEL);
		expect(body.response_format.type).toBe("json_schema");
		expect(body.response_format.json_schema.strict).toBe(true);
		expect(
			body.response_format.json_schema.schema.properties.rubric.required,
		).toEqual(["ct", "or", "lg"]);

		expect(draft.rubric).toEqual({ ct: 5, or: 3, lg: 0 });
		expect(draft.feedback).toBe("Bài viết tốt.");
		expect(draft.errors.map((e) => e.id)).toEqual(["w1", "w2", "w3"]);
		const lives = draft.errors.find((e) => e.quote === "I lives");
		expect(lives?.start).toBe(ESSAY.indexOf("I lives"));
		expect(lives?.end).toBe(ESSAY.indexOf("I lives") + "I lives".length);
		const missing = draft.errors.find((e) => e.quote === "not in the essay");
		expect(missing?.start).toBeNull();
		// Lỗi không định vị được xếp cuối.
		expect(draft.errors.at(-1)?.quote).toBe("not in the essay");
	});

	test("cắt tối đa 25 lỗi và cắt độ dài quote/explanation", async () => {
		const errors = Array.from({ length: 40 }, () => ({
			category: "grammar",
			quote: "x".repeat(500),
			correction: "",
			explanation: "y".repeat(900),
		}));
		const { fetchImpl } = recordingFetch(() =>
			chatResponse({ rubric: { ct: 1, or: 1, lg: 1 }, feedback: "", errors }),
		);
		const draft = await createOpenAiPlacementGrader({
			apiKey: "k",
			fetch: fetchImpl,
		}).gradeWriting({ prompt: "", text: "abc" });
		expect(draft.errors).toHaveLength(25);
		expect(draft.errors[0]?.quote.length).toBe(300);
		expect(draft.errors[0]?.explanation.length).toBe(600);
	});

	test("HTTP lỗi → AI_GRADING_FAILED và không lộ body/key trong message", async () => {
		const { fetchImpl } = recordingFetch(
			() => new Response("echo: I lives in District 9", { status: 500 }),
		);
		const grader = createOpenAiPlacementGrader({
			apiKey: "sk-secret",
			fetch: fetchImpl,
		});
		const error = (await grader.gradeWriting({ prompt: "", text: ESSAY }).then(
			() => null,
			(e: unknown) => e,
		)) as PlacementAiGradingError;
		expect(error).toBeInstanceOf(PlacementAiGradingError);
		expect(error.code).toBe(PLACEMENT_AI_ERROR_CODES.FAILED);
		expect(error.message).toContain("500");
		expect(error.message).not.toContain("sk-secret");
		expect(error.message).not.toContain("District");
	});

	test("content không phải JSON → FAILED; rubric thiếu key → FAILED", async () => {
		const broken = recordingFetch(() => chatResponse("not json {"));
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: broken.fetchImpl,
			}).gradeWriting({ prompt: "", text: ESSAY }),
			PLACEMENT_AI_ERROR_CODES.FAILED,
		);
		const partial = recordingFetch(() =>
			chatResponse({ rubric: { ct: 3 }, feedback: "", errors: [] }),
		);
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: partial.fetchImpl,
			}).gradeWriting({ prompt: "", text: ESSAY }),
			PLACEMENT_AI_ERROR_CODES.FAILED,
		);
	});

	test("timeout mỗi lượt → AI_GRADING_TIMEOUT", async () => {
		const hanging = (async (_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(init.signal?.reason),
				);
			})) as typeof fetch;
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: hanging,
				timeoutMs: 20,
			}).gradeWriting({ prompt: "", text: ESSAY }),
			PLACEMENT_AI_ERROR_CODES.TIMEOUT,
		);
	});

	test("transcribe gửi multipart (model mặc định, language en) và trả text đã trim", async () => {
		const { calls, fetchImpl } = recordingFetch(() =>
			Response.json({ text: "  I like the beach.  " }),
		);
		const text = await createOpenAiPlacementGrader({
			apiKey: "k",
			fetch: fetchImpl,
		}).transcribe({
			bytes: new Uint8Array([1, 2, 3]),
			mime: "audio/webm",
			filename: "speaking.webm",
		});
		expect(text).toBe("I like the beach.");
		expect(calls[0]?.url).toBe(
			"https://api.openai.com/v1/audio/transcriptions",
		);
		const form = calls[0]?.init.body as FormData;
		expect(form.get("model")).toBe(DEFAULT_OPENAI_TRANSCRIBE_MODEL);
		expect(form.get("language")).toBe("en");
		const file = form.get("file") as File;
		expect(file.name).toBe("speaking.webm");
		expect(file.size).toBe(3);
	});

	test("gradeSpeaking dùng model env, prefix id s và định vị trên transcript", async () => {
		const transcript = "I go to school yesterday.";
		const { calls, fetchImpl } = recordingFetch(() =>
			chatResponse({
				rubric: { gv: 2, dm: 3, pr: 4, ic: 5 },
				feedback: "Phát âm chỉ đánh giá qua transcript.",
				errors: [
					{
						category: "grammar",
						quote: "go",
						correction: "went",
						explanation: "Quá khứ.",
					},
				],
			}),
		);
		const draft = await createOpenAiPlacementGrader({
			apiKey: "k",
			gradingModel: "custom-model",
			fetch: fetchImpl,
		}).gradeSpeaking({ prompts: ["What did you do?"], transcript });
		expect(JSON.parse(String(calls[0]?.init.body)).model).toBe("custom-model");
		expect(draft.rubric).toEqual({ gv: 2, dm: 3, pr: 4, ic: 5 });
		expect(draft.errors[0]).toMatchObject({ id: "s1", start: 2, end: 4 });
	});
});
