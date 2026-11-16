import { PLACEMENT_AI_ERROR_CODES } from "@teacher-os/api/placement-test-contracts";
import { describe, expect, test } from "vitest";
import { PlacementAiGradingError, type PlacementAiPollResult } from "./grader";
import {
	createOpenAiPlacementGrader,
	createPlacementAiGrader,
	DEFAULT_OPENAI_GRADING_MODEL,
	DEFAULT_OPENAI_TRANSCRIBE_MODEL,
	OPENAI_CALL_TIMEOUT_MS,
} from "./openai-grader";

const ESSAY = "Hi Ben, I lives in District 9. On weekend I go cycling.";

/** Body `GET /v1/responses/{id}` đã xong với một output_text. */
function completedResponse(content: unknown): Response {
	return Response.json({
		id: "resp_1",
		status: "completed",
		output: [
			{ type: "reasoning", summary: [] },
			{
				type: "message",
				role: "assistant",
				content: [
					{
						type: "output_text",
						text:
							typeof content === "string" ? content : JSON.stringify(content),
					},
				],
			},
		],
	});
}

function draftOf(result: PlacementAiPollResult) {
	if (result.state !== "draft") {
		throw new Error(`expected draft, got ${JSON.stringify(result)}`);
	}
	return result.draft;
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

const hangingFetch = (async (_input: RequestInfo | URL, init?: RequestInit) =>
	new Promise<Response>((_resolve, reject) => {
		init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
	})) as typeof fetch;

function pollWith(fetchImpl: typeof fetch, timeoutMs?: number) {
	return createOpenAiPlacementGrader({
		apiKey: "k",
		fetch: fetchImpl,
		...(timeoutMs ? { timeoutMs } : {}),
	}).poll("r", "writing", ESSAY);
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
	test("startWriting tạo job Responses background (json_schema strict, model mặc định) và trả id", async () => {
		const { calls, fetchImpl } = recordingFetch(() =>
			Response.json({ id: "resp_abc", status: "queued" }),
		);
		const id = await createOpenAiPlacementGrader({
			apiKey: "sk-secret",
			fetch: fetchImpl,
		}).startWriting({ prompt: "Write an email.", text: ESSAY });
		expect(id).toBe("resp_abc");
		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses");
		expect(calls[0]?.init.method).toBe("POST");
		const headers = calls[0]?.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-secret");
		expect(headers["Content-Type"]).toBe("application/json");
		expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
		const body = JSON.parse(String(calls[0]?.init.body));
		expect(body.model).toBe(DEFAULT_OPENAI_GRADING_MODEL);
		expect(body.background).toBe(true);
		expect(body.store).toBe(true);
		expect(body.input[0].role).toBe("system");
		expect(body.input[1].content).toContain(ESSAY);
		expect(body.text.format.type).toBe("json_schema");
		expect(body.text.format.name).toBe("placement_writing_grade");
		expect(body.text.format.strict).toBe(true);
		expect(body.text.format.schema.properties.rubric.required).toEqual([
			"ct",
			"or",
			"lg",
		]);
	});

	test("timeout mỗi lượt HTTP mặc định 25 giây", () => {
		expect(OPENAI_CALL_TIMEOUT_MS).toBe(25_000);
	});

	test("startWriting thiếu id → FAILED", async () => {
		const { fetchImpl } = recordingFetch(() => Response.json({}));
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: fetchImpl,
			}).startWriting({ prompt: "", text: ESSAY }),
			PLACEMENT_AI_ERROR_CODES.FAILED,
		);
	});

	test("poll completed: GET /responses/{id}, kẹp rubric, gán id, định vị lỗi", async () => {
		const { calls, fetchImpl } = recordingFetch(() =>
			completedResponse({
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
		const result = await createOpenAiPlacementGrader({
			apiKey: "sk-secret",
			fetch: fetchImpl,
		}).poll("resp_abc", "writing", ESSAY);
		expect(calls[0]?.url).toBe("https://api.openai.com/v1/responses/resp_abc");
		expect(calls[0]?.init.method).toBe("GET");
		expect(calls[0]?.init.body).toBeUndefined();
		const draft = draftOf(result);
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

	test("poll cắt tối đa 25 lỗi và cắt độ dài quote/explanation", async () => {
		const errors = Array.from({ length: 40 }, () => ({
			category: "grammar",
			quote: "x".repeat(500),
			correction: "",
			explanation: "y".repeat(900),
		}));
		const { fetchImpl } = recordingFetch(() =>
			completedResponse({
				rubric: { ct: 1, or: 1, lg: 1 },
				feedback: "",
				errors,
			}),
		);
		const draft = draftOf(
			await createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: fetchImpl,
			}).poll("resp_1", "writing", "abc"),
		);
		expect(draft.errors).toHaveLength(25);
		expect(draft.errors[0]?.quote.length).toBe(300);
		expect(draft.errors[0]?.explanation.length).toBe(600);
	});

	test("poll queued/in_progress → pending; failed/cancelled/incomplete → error FAILED", async () => {
		for (const status of ["queued", "in_progress"]) {
			const { fetchImpl } = recordingFetch(() =>
				Response.json({ id: "r", status }),
			);
			expect(await pollWith(fetchImpl)).toEqual({ state: "pending" });
		}
		for (const status of ["failed", "cancelled", "incomplete"]) {
			const { fetchImpl } = recordingFetch(() =>
				Response.json({ id: "r", status }),
			);
			expect(await pollWith(fetchImpl)).toEqual({
				state: "error",
				code: PLACEMENT_AI_ERROR_CODES.FAILED,
			});
		}
	});

	test("poll completed nhưng output không phải JSON / thiếu output_text / rubric thiếu key → error FAILED", async () => {
		const responses = [
			() => completedResponse("not json {"),
			() =>
				Response.json({
					status: "completed",
					output: [
						{ type: "message", content: [{ type: "refusal", refusal: "no" }] },
					],
				}),
			() => completedResponse({ rubric: { ct: 3 }, feedback: "", errors: [] }),
		];
		for (const respond of responses) {
			const { fetchImpl } = recordingFetch(respond);
			expect(await pollWith(fetchImpl)).toEqual({
				state: "error",
				code: PLACEMENT_AI_ERROR_CODES.FAILED,
			});
		}
	});

	test("poll lỗi mạng / timeout / 5xx / 429 → pending tạm thời; 404 → error FAILED", async () => {
		const transient = { state: "pending", transient: true };
		const networkDown = (async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof fetch;
		expect(await pollWith(networkDown)).toEqual(transient);
		expect(await pollWith(hangingFetch, 20)).toEqual(transient);
		for (const status of [500, 503, 429]) {
			const { fetchImpl } = recordingFetch(
				() => new Response("busy", { status }),
			);
			expect(await pollWith(fetchImpl)).toEqual(transient);
		}
		const { fetchImpl } = recordingFetch(
			() => new Response("gone", { status: 404 }),
		);
		expect(await pollWith(fetchImpl)).toEqual({
			state: "error",
			code: PLACEMENT_AI_ERROR_CODES.FAILED,
		});
	});

	test("HTTP lỗi khi tạo job → AI_GRADING_FAILED và không lộ body/key trong message", async () => {
		const { fetchImpl } = recordingFetch(
			() => new Response("echo: I lives in District 9", { status: 500 }),
		);
		const grader = createOpenAiPlacementGrader({
			apiKey: "sk-secret",
			fetch: fetchImpl,
		});
		const error = (await grader.startWriting({ prompt: "", text: ESSAY }).then(
			() => null,
			(e: unknown) => e,
		)) as PlacementAiGradingError;
		expect(error).toBeInstanceOf(PlacementAiGradingError);
		expect(error.code).toBe(PLACEMENT_AI_ERROR_CODES.FAILED);
		expect(error.message).toContain("500");
		expect(error.message).not.toContain("sk-secret");
		expect(error.message).not.toContain("District");
	});

	test("timeout khi tạo job → AI_GRADING_TIMEOUT", async () => {
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: hangingFetch,
				timeoutMs: 20,
			}).startWriting({ prompt: "", text: ESSAY }),
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

	test("transcribe quá timeout → AI_GRADING_TIMEOUT", async () => {
		await expectCode(
			createOpenAiPlacementGrader({
				apiKey: "k",
				fetch: hangingFetch,
				timeoutMs: 20,
			}).transcribe({
				bytes: new Uint8Array([1]),
				mime: "audio/webm",
				filename: "speaking.webm",
			}),
			PLACEMENT_AI_ERROR_CODES.TIMEOUT,
		);
	});

	test("startSpeaking dùng model env; poll speaking prefix id s và định vị trên transcript", async () => {
		const transcript = "I go to school yesterday.";
		const { calls, fetchImpl } = recordingFetch((url) =>
			url.endsWith("/responses")
				? Response.json({ id: "resp_s", status: "queued" })
				: completedResponse({
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
		const grader = createOpenAiPlacementGrader({
			apiKey: "k",
			gradingModel: "custom-model",
			fetch: fetchImpl,
		});
		const id = await grader.startSpeaking({
			prompts: ["What did you do?"],
			transcript,
		});
		const body = JSON.parse(String(calls[0]?.init.body));
		expect(body.model).toBe("custom-model");
		expect(body.text.format.name).toBe("placement_speaking_grade");
		const draft = draftOf(await grader.poll(id, "speaking", transcript));
		expect(calls[1]?.url).toBe("https://api.openai.com/v1/responses/resp_s");
		expect(draft.rubric).toEqual({ gv: 2, dm: 3, pr: 4, ic: 5 });
		expect(draft.errors[0]).toMatchObject({ id: "s1", start: 2, end: 4 });
	});
});
