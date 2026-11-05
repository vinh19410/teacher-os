import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const submitFixture = {
	saving: false,
	error: undefined as string | undefined,
	notice: undefined,
	submitBlocked: false,
	run: vi.fn(),
	reconcile: vi.fn(),
	reset: vi.fn(),
};

const searchFixture = {
	current: {} as { classId?: string; promptId?: string },
};
vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => searchFixture.current,
	}),
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));
vi.mock("@/lib/use-kernel-form-submit", () => ({
	useKernelFormSubmit: () => submitFixture,
}));
const draftFixture: { value: PreviewDraft | null } = { value: null };
vi.mock("@/lib/assignment-preview-draft", () => ({
	takePreviewDraft: () => draftFixture.value,
	savePreviewDraft: vi.fn(),
}));
const dataFixture = {
	data: {
		assignmentPrompts: [] as unknown[],
		classAssignments: [] as unknown[],
		classes: [] as {
			id: string;
			name: string;
			level: string;
			type: string;
		}[],
	},
};
vi.mock("@/lib/data-store", () => ({
	useData: () => dataFixture,
}));

import type { ComposerValue } from "@/components/assignments/prompt-composer";
import type { PreviewDraft } from "@/lib/assignment-preview-draft";
import {
	actionCopyFor,
	missingRequirementsFor,
	NewAssignmentPage,
	NewAssignmentRoute,
	previewDraftFrom,
	Route,
} from "./new";

describe("NewAssignmentRoute (#218 v5)", () => {
	it("renders design v5 structure with 4 skills and a blank form", () => {
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Writing");
		expect(html).toContain("Reading");
		expect(html).toContain("Listening");
		expect(html).toContain("Speaking");
		expect(html).toContain("Task 2 · 250 từ");
		expect(html).toContain("Discuss both views");
		expect(html).toContain("Đặt tên đề rồi lưu vào ngân hàng.");
		expect(html).toContain("Trạng thái");
		expect(html).toContain("Bản nháp");
		expect(html).toContain("Sẵn sàng giao");
		expect(html).toContain("Xem trước");
		// Form khởi tạo trắng: không còn nội dung mẫu hardcode.
		expect(html).not.toContain("Some people think");
		expect(html).not.toContain("Cambridge");
		// Khung phải (card "Ngân hàng" + preview) đã bị bỏ — form chiếm toàn bộ chiều rộng.
		expect(html).not.toContain("Xem trước phía học viên");
		expect(html).not.toContain("Đề Writing đã có");

		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).toBeDefined();
		expect(submit?.[0]).not.toMatch(/\sdisabled=/);
	});

	it("surfaces the server error from the submit hook", () => {
		submitFixture.error =
			"Không lưu được — dữ liệu chưa được ghi lên máy chủ. Vui lòng kiểm tra và thử lại.";
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Không lưu được");
		submitFixture.error = undefined;
	});

	describe("actionCopyFor priority states", () => {
		const baseValue = {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title: "Discuss both views",
			band: "7.0",
			source: "Cambridge 10",
			prompt: "Some prompt",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			note: "",
			items: [],
		};

		it("1. Missing title", () => {
			const res = actionCopyFor({ ...baseValue, title: "   " }, "ready");
			expect(res.title).toBe("Đặt tên đề rồi lưu vào ngân hàng.");
			expect(res.sub).toBe("Chưa giao lớp.");
		});

		it("2. Listening ready missing audio", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "listening",
					part: "s1",
					type: "form",
					audioName: "",
					items: [{ stem: "Q1", answer: "A", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu file nghe");
			expect(res.sub).toContain("Đính file nghe trước khi lưu");
		});

		it("3. Reading/Listening ready missing answers", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "tfng",
					passage: "Some passage",
					items: [
						{ stem: "Q1", answer: "TRUE", opts: null, alts: "" },
						{ stem: "Q2", answer: "", opts: null, alts: "" },
					],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu đáp án chấm tự động");
			expect(res.sub).toContain("Khóa đáp án đúng");
		});

		it("4. Missing core content", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					prompt: "   ",
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu nội dung đề");
			expect(res.sub).toContain("Soạn xong rồi lưu vào ngân hàng");
		});

		it("5. Draft mode", () => {
			const res = actionCopyFor(baseValue, "draft");
			expect(res.title).toBe("Lưu bản nháp");
			expect(res.sub).toContain("Bản nháp chưa hiện");
		});

		it("6. Ready mode", () => {
			const res = actionCopyFor(baseValue, "ready");
			expect(res.title).toBe("Sẵn sàng lưu vào ngân hàng");
			expect(res.sub).toContain("Chưa giao lớp");
		});

		it("6b. Rich text: tag-only prompt counts as missing content (rich text plan)", () => {
			const empty = actionCopyFor({ ...baseValue, prompt: "<p></p>" }, "ready");
			expect(empty.title).toBe("Thiếu nội dung đề");

			const brOnly = actionCopyFor(
				{ ...baseValue, prompt: "<p><br></p>" },
				"ready",
			);
			expect(brOnly.title).toBe("Thiếu nội dung đề");

			const real = actionCopyFor(
				{ ...baseValue, prompt: "<p>Some prompt</p>" },
				"ready",
			);
			expect(real.title).toBe("Sẵn sàng lưu vào ngân hàng");
		});

		it("7. Reading diagram ready missing image (#269, phase-04 copy)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "diagram",
					passage: "Some passage",
					imageUrl: "",
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Thiếu ảnh hoặc ghim nhãn");
			expect(res.sub).toContain("Dán link ảnh");
			// The pin half of the gate names the missing pin per question.
			const withImage = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "diagram",
					passage: "Some passage",
					imageUrl: "https://example.com/d.png",
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(withImage.sub).toContain("chưa đặt ghim");
		});

		it("8. Reading image URL not https (#269)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					imageUrl: "http://example.com/diagram.png",
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Link ảnh chưa hợp lệ");
			expect(res.sub).toContain("https");
		});

		it("9. Reading image URL over 500 chars blocks save (#269)", () => {
			// Mirrors the server .max(500) — presigned CDN URLs blow past it.
			const longUrl = `https://example.com/${"a".repeat(490)}.png`;
			expect(longUrl.length).toBeGreaterThan(500);
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					imageUrl: longUrl,
					items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Link ảnh chưa hợp lệ");
			expect(res.sub).toContain("500 ký tự");
		});

		it("9b. Missing type in ready mode blocks save (#577)", () => {
			const res = actionCopyFor({ ...baseValue, type: "" }, "ready");
			expect(res.title).toBe("Chưa chọn dạng đề");
			expect(res.sub).toContain("Chọn dạng đề trước khi lưu");
		});

		it("9c. Missing type in draft mode is allowed (#577)", () => {
			const res = actionCopyFor({ ...baseValue, type: "" }, "draft");
			expect(res.title).toBe("Lưu bản nháp");
		});

		it("10. Bankable ready without a bank blocks save with the panel message (phase-02)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p3",
					type: "features",
					passage: "Some passage",
					optionBank: [],
					items: [{ stem: "Q27", answer: "A", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Ngân hàng lựa chọn chưa đạt");
			expect(res.sub).toContain("tối thiểu 2");
		});

		it("11. Bankable with a blank bank row blocks save even as draft (phase-02)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p3",
					type: "features",
					passage: "Some passage",
					optionBank: ["Ada", "  "],
					items: [{ stem: "Q27", answer: "", opts: null, alts: "" }],
				},
				"draft",
			);
			expect(res.title).toBe("Ngân hàng lựa chọn chưa đạt");
			expect(res.sub).toContain("điền nội dung cho mọi mục");
		});

		it("12. A stem with two markers blocks save with the row message (phase-03 FR7)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					items: [{ stem: "____ and ____", answer: "x", opts: null, alts: "" }],
				},
				"ready",
			);
			expect(res.title).toBe("Câu hỏi chưa hợp lệ");
			expect(res.sub).toContain("một chỗ trống");
		});

		it("13. One marker and zero markers save fine (phase-03 FR7 backward compat)", () => {
			const res = actionCopyFor(
				{
					...baseValue,
					skill: "reading",
					part: "p1",
					type: "summary",
					passage: "Some passage",
					items: [
						{ stem: "one ____ only", answer: "x", opts: null, alts: "" },
						{ stem: "[table] r1 c1: A / B", answer: "y", opts: null, alts: "" },
					],
				},
				"ready",
			);
			expect(res.title).toBe("Sẵn sàng lưu vào ngân hàng");
		});
	});

	it("blocks save for a restored diagram-ready draft missing its image (#269)", () => {
		draftFixture.value = {
			task: "p1",
			genre: "diagram",
			title: "Diagram draft",
			band: "7.0",
			source: "",
			prompt: "",
			note: "",
			status: "ready",
			skill: "reading",
			part: "p1",
			type: "diagram",
			passage: "Passage",
			intro: "",
			audioName: "",
			imageUrl: "",
			items: [{ stem: "Q1", answer: "steam", opts: null, alts: "" }],
		};
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thiếu ảnh hoặc ghim nhãn");
		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).not.toMatch(/\sdisabled=/);
		draftFixture.value = null;
	});
	it("blocks save for a restored draft missing type when in ready status (#577)", () => {
		draftFixture.value = {
			task: "task2",
			genre: "",
			skill: "writing",
			part: "task2",
			type: "",
			title: "Writing Essay without Type",
			band: "7.0",
			source: "Cam 18",
			prompt: "<p>Prompt content</p>",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			items: [],
			note: "",
			status: "ready",
		};
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Chưa chọn dạng đề");
		expect(html).toContain("Chọn dạng đề trước khi lưu sẵn sàng giao.");
		const submit = html.match(
			/<button[^>]*type="submit"[^>]*>[^<]*Lưu vào ngân hàng/,
		);
		expect(submit?.[0]).not.toMatch(/\sdisabled=/);
		draftFixture.value = null;
	});

	describe("missingRequirementsFor (#581)", () => {
		const blankWritingReady: ComposerValue = {
			skill: "writing",
			part: "task2",
			type: "",
			title: "",
			band: "7.0",
			source: "",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			items: [],
			note: "",
		};

		it("returns type, title, prompt in DOM order for blank writing in ready status", () => {
			const missing = missingRequirementsFor(blankWritingReady, "ready");
			expect(missing.map((m) => m.id)).toEqual(["type", "title", "prompt"]);
			expect(missing[0].fieldId).toBe("assignment-field-type");
			expect(missing[1].fieldId).toBe("assignment-field-title");
			expect(missing[2].fieldId).toBe("assignment-field-prompt");
		});

		it("does not require type when status is draft", () => {
			const missing = missingRequirementsFor(blankWritingReady, "draft");
			expect(missing.map((m) => m.id)).toEqual(["title", "prompt"]);
		});

		it("requires passage and items for reading", () => {
			const readingDraft: ComposerValue = {
				...blankWritingReady,
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Test",
			};
			const missing = missingRequirementsFor(readingDraft, "draft");
			expect(missing.map((m) => m.id)).toEqual([
				"passage",
				"reading-questions",
			]);
			expect(missing[0].fieldId).toBe("assignment-field-passage");
			expect(missing[1].fieldId).toBe("assignment-field-questions");
		});

		it("detects invalid imageUrl in reading even for draft", () => {
			const readingWithBadImg: ComposerValue = {
				...blankWritingReady,
				skill: "reading",
				part: "p1",
				type: "diagram",
				title: "Reading Test",
				passage: "<p>Passage</p>",
				imageUrl: "http://insecure.com/test.png",
				items: [{ stem: "Q1", answer: "", opts: null, alts: "" }],
			};
			const missing = missingRequirementsFor(readingWithBadImg, "draft");
			expect(missing.map((m) => m.id)).toEqual(["imageUrl"]);
			expect(missing[0].fieldId).toBe("assignment-field-image");
		});

		it("ignores stale imageUrl on non-image types to avoid dead-end validation (#581)", () => {
			const readingTfngWithStaleImg: ComposerValue = {
				...blankWritingReady,
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Test",
				passage: "<p>Passage</p>",
				imageUrl: "http://insecure.com/old.png",
				items: [{ stem: "Q1", answer: "", opts: null, alts: "" }],
			};
			const missing = missingRequirementsFor(readingTfngWithStaleImg, "draft");
			expect(missing.some((m) => m.id === "imageUrl")).toBe(false);
		});

		it("requires audio file for listening in ready status", () => {
			const listeningReady: ComposerValue = {
				...blankWritingReady,
				skill: "listening",
				part: "s1",
				type: "form",
				title: "Listening Test",
				items: [{ stem: "Q1", answer: "A", opts: null, alts: "" }],
			};
			const missing = missingRequirementsFor(listeningReady, "ready");
			expect(missing.map((m) => m.id)).toEqual(["audioName"]);
			expect(missing[0].fieldId).toBe("assignment-field-audio");
		});

		it("requires answer keys for all items in auto skills when ready", () => {
			const readingReady: ComposerValue = {
				...blankWritingReady,
				skill: "reading",
				part: "p1",
				type: "tfng",
				title: "Reading Test",
				passage: "<p>Passage text</p>",
				items: [
					{ stem: "Q1", answer: "TRUE", opts: null, alts: "" },
					{ stem: "Q2", answer: "", opts: null, alts: "" },
				],
			};
			const missing = missingRequirementsFor(readingReady, "ready");
			expect(missing.map((m) => m.id)).toEqual(["answers"]);
			expect(missing[0].fieldId).toBe("assignment-field-questions");
		});

		it("requires cueTopic for speaking part 2", () => {
			const speakingPart2: ComposerValue = {
				...blankWritingReady,
				skill: "speaking",
				part: "part2",
				type: "cue",
				title: "Speaking Test",
				cueTopic: "",
			};
			const missing = missingRequirementsFor(speakingPart2, "draft");
			expect(missing.map((m) => m.id)).toEqual(["cueTopic"]);
			expect(missing[0].fieldId).toBe("assignment-field-cueTopic");
		});

		it("returns empty list when all requirements are met", () => {
			const completeWriting: ComposerValue = {
				...blankWritingReady,
				type: "discuss",
				title: "Complete Essay",
				prompt: "<p>Some prompt</p>",
			};
			const missing = missingRequirementsFor(completeWriting, "ready");
			expect(missing).toEqual([]);
		});

		it("validates parity across multiple skills and drafts", () => {
			const testCases: Array<{
				desc: string;
				value: ComposerValue;
				status: "draft" | "ready";
				expectedValid: boolean;
			}> = [
				{
					desc: "valid speaking part 1 ready",
					value: {
						...blankWritingReady,
						skill: "speaking",
						part: "part1",
						type: "interview",
						title: "Part 1 Interview",
						prompt: "Speak about hobbies",
					},
					status: "ready",
					expectedValid: true,
				},
				{
					desc: "speaking part 2 missing cueTopic is invalid",
					value: {
						...blankWritingReady,
						skill: "speaking",
						part: "part2",
						type: "cue",
						title: "Part 2 Cue",
						cueTopic: "",
					},
					status: "ready",
					expectedValid: false,
				},
				{
					desc: "valid listening ready with audio and keys",
					value: {
						...blankWritingReady,
						skill: "listening",
						part: "s1",
						type: "form",
						title: "Listening Section 1",
						audioName: "section1.mp3",
						items: [{ stem: "Q1", answer: "A", opts: null, alts: "" }],
					},
					status: "ready",
					expectedValid: true,
				},
				{
					desc: "listening ready missing audio is invalid",
					value: {
						...blankWritingReady,
						skill: "listening",
						part: "s1",
						type: "form",
						title: "Listening Section 1",
						audioName: "",
						items: [{ stem: "Q1", answer: "A", opts: null, alts: "" }],
					},
					status: "ready",
					expectedValid: false,
				},
				{
					desc: "listening draft missing audio is valid",
					value: {
						...blankWritingReady,
						skill: "listening",
						part: "s1",
						type: "form",
						title: "Listening Draft",
						audioName: "",
						items: [{ stem: "Q1", answer: "", opts: null, alts: "" }],
					},
					status: "draft",
					expectedValid: true,
				},
			];

			for (const tc of testCases) {
				const missing = missingRequirementsFor(tc.value, tc.status);
				expect(
					missing.length === 0,
					`Failed parity for: ${tc.desc} (${tc.status}) - missing: ${JSON.stringify(missing)}`,
				).toBe(tc.expectedValid);
			}
		});
	});
});

function stubLocalStorage(initial: Record<string, string> = {}) {
	const map = new Map(Object.entries(initial));
	vi.stubGlobal("window", {
		sessionStorage: {
			getItem: () => null,
			setItem: () => {},
			removeItem: () => {},
		},
		localStorage: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k),
		},
	});
	return map;
}

function autosaveDraftJson(
	title: string,
	overrides: Record<string, unknown> = {},
) {
	return JSON.stringify({
		schemaVersion: 1,
		savedAt: Date.now(),
		status: "ready",
		value: {
			skill: "writing",
			part: "task2",
			type: "discuss",
			title,
			band: "7.0",
			source: "",
			prompt: "Autosaved prompt text…",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			note: "",
			items: [],
		},
		...overrides,
	});
}

describe("NewAssignmentRoute — autosave draft restore precedence (phase-01 FR6)", () => {
	it("shows no restore banner when localStorage has no draft", () => {
		stubLocalStorage();
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Thêm đề vào ngân hàng");
		expect(html).not.toContain("Đã phục hồi bản nháp");
	});

	it("restores the autosave draft with a Hủy/Tiếp tục banner (non-destructive read)", () => {
		const map = stubLocalStorage({
			"assignment-draft": autosaveDraftJson("Autosave QC"),
		});
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Đã phục hồi bản nháp");
		expect(html).toContain("Tiếp tục");
		expect(html).toContain("Hủy");
		expect(html).toContain('value="Autosave QC"');
		// Non-destructive: the stored draft survives the restore render.
		expect(map.get("assignment-draft")).toContain("Autosave QC");
	});

	it("preview draft wins: no banner when a preview draft was just consumed", () => {
		stubLocalStorage({
			"assignment-draft": autosaveDraftJson("Autosave Loses"),
		});
		draftFixture.value = {
			task: "task2",
			genre: "discuss",
			title: "Preview Wins",
			band: "7.0",
			source: "",
			prompt: "Preview prompt…",
			note: "",
			status: "ready",
		};
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain('value="Preview Wins"');
		expect(html).not.toContain("Đã phục hồi bản nháp");
		expect(html).not.toContain('value="Autosave Loses"');
		draftFixture.value = null;
	});

	it("ignores an autosave draft whose schemaVersion is foreign", () => {
		stubLocalStorage({
			"assignment-draft": autosaveDraftJson("Version Mismatch", {
				schemaVersion: 999,
			}),
		});
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).not.toContain("Đã phục hồi bản nháp");
		expect(html).not.toContain("Version Mismatch");
	});

	it("ignores an expired autosave draft (TTL 7 days)", () => {
		stubLocalStorage({
			"assignment-draft": autosaveDraftJson("Expired QC", {
				savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
			}),
		});
		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).not.toContain("Đã phục hồi bản nháp");
		expect(html).not.toContain("Expired QC");
	});
});

describe("previewDraftFrom — preview payload parity (phase-01 FR6 bug fix)", () => {
	const full: ComposerValue = {
		skill: "listening",
		part: "s1",
		type: "form",
		title: "QC Listening",
		band: "6.5",
		source: "Cam 15",
		prompt: "",
		passage: "",
		intro: "Complete the form",
		transcript: "W: Good morning…",
		cueTopic: "",
		cuePoints: "",
		audioName: "sec1.mp3",
		imageUrl: "",
		optionBank: [],
		note: "",
		items: [{ stem: "Name:", answer: "Clarke", opts: null, alts: "" }],
	};

	it("carries transcript so the preview round trip cannot drop it", () => {
		const draft = previewDraftFrom(full, "draft");
		expect(draft.transcript).toBe("W: Good morning…");
	});

	it("carries the option bank so the preview round trip cannot drop it (phase-02 FR7)", () => {
		const banked = {
			...full,
			skill: "reading",
			part: "p3",
			type: "features",
			optionBank: ["Brunel", "Darwin"],
		} as ComposerValue;
		const draft = previewDraftFrom(banked, "ready");
		expect(draft.optionBank).toEqual(["Brunel", "Darwin"]);
	});

	it("carries every composer field plus legacy task/genre aliases", () => {
		const draft = previewDraftFrom(full, "ready");
		expect(draft).toMatchObject({
			task: "s1",
			genre: "form",
			skill: "listening",
			part: "s1",
			type: "form",
			title: "QC Listening",
			band: "6.5",
			source: "Cam 15",
			intro: "Complete the form",
			cueTopic: "",
			cuePoints: "",
			audioName: "sec1.mp3",
			imageUrl: "",
			items: [{ stem: "Name:", answer: "Clarke", opts: null, alts: "" }],
			note: "",
			status: "ready",
		});
	});

	it("keeps empty items arrays for prompt-only skills", () => {
		const draft = previewDraftFrom(
			{ ...full, skill: "speaking", items: [] },
			"ready",
		);
		expect(draft.items).toEqual([]);
	});
});

describe("hybrid writing section validation & preview handoff (#574)", () => {
	it("blocks save with clear copy when writing section is enabled with empty prompt, and preserves writing in previewDraftFrom", () => {
		const hybridIncomplete: ComposerValue = {
			skill: "grammar",
			part: "tenses",
			type: "mcq",
			title: "Grammar + Writing",
			band: "6.5",
			source: "",
			prompt: "",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			note: "",
			items: [
				{ stem: "She ___ home.", answer: "B", opts: ["go", "goes"], alts: "" },
			],
			writing: { part: "task2", type: "discuss", prompt: "<p>   </p>" },
		};
		expect(actionCopyFor(hybridIncomplete, "ready").title).toBe(
			"Thiếu đề phần Writing",
		);
		expect(actionCopyFor(hybridIncomplete, "draft").title).toBe(
			"Thiếu đề phần Writing",
		);

		const hybridComplete: ComposerValue = {
			...hybridIncomplete,
			writing: {
				part: "task2",
				type: "discuss",
				prompt: "<p>Write 250 words about cities.</p>",
			},
		};
		expect(actionCopyFor(hybridComplete, "ready").title).toBe(
			"Sẵn sàng lưu vào ngân hàng",
		);
		expect(previewDraftFrom(hybridComplete, "ready").writing).toEqual({
			part: "task2",
			type: "discuss",
			prompt: "<p>Write 250 words about cities.</p>",
		});
	});
});

describe("NewAssignmentRoute — class-based default band (#585)", () => {
	it("validates search param classId correctly via Route.validateSearch", () => {
		const routeOptions: unknown = Route;
		expect(
			routeOptions &&
				typeof routeOptions === "object" &&
				"validateSearch" in routeOptions &&
				typeof routeOptions.validateSearch === "function",
		).toBe(true);
		if (
			routeOptions &&
			typeof routeOptions === "object" &&
			"validateSearch" in routeOptions &&
			typeof routeOptions.validateSearch === "function"
		) {
			const validate = routeOptions.validateSearch;
			expect(validate({ classId: "cls-55" })).toEqual({ classId: "cls-55" });
			expect(validate({ classId: 12345 })).toEqual({ classId: undefined });
			expect(validate({})).toEqual({ classId: undefined });
			expect(validate({ other: "param" })).toEqual({ classId: undefined });
		}
	});

	it("defaults band to 5.5 when classId references an IELTS Band 5.5 class", () => {
		dataFixture.data.classes = [
			{
				id: "cls-55",
				name: "IELTS Foundation 5.5",
				level: "Band 5.5",
				type: "ielts",
			},
		];
		searchFixture.current = { classId: "cls-55" };

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>5\.5<\/button>/);
		expect(html).toMatch(
			/<button[^>]*aria-pressed="false"[^>]*>7\.0<\/button>/,
		);
	});

	it("defaults band to 6.0 when class has range 'IELTS 5.0–6.0'", () => {
		dataFixture.data.classes = [
			{
				id: "cls-range",
				name: "IELTS Prep",
				level: "IELTS 5.0–6.0",
				type: "ielts",
			},
		];
		searchFixture.current = { classId: "cls-range" };

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>6\.0<\/button>/);
	});

	it("falls back to 7.0 when class is a TOEIC class (e.g. TOEIC 550)", () => {
		dataFixture.data.classes = [
			{
				id: "cls-toeic",
				name: "TOEIC 550 Căn Bản",
				level: "TOEIC 550",
				type: "communication",
			},
		];
		searchFixture.current = { classId: "cls-toeic" };

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>7\.0<\/button>/);
	});

	it("falls back to 7.0 when classId is unknown or omitted", () => {
		dataFixture.data.classes = [
			{ id: "cls-55", name: "IELTS 5.5", level: "Band 5.5", type: "ielts" },
		];
		searchFixture.current = { classId: "nonexistent" };
		const htmlUnknown = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(htmlUnknown).toMatch(
			/<button[^>]*aria-pressed="true"[^>]*>7\.0<\/button>/,
		);

		searchFixture.current = {};
		const htmlNoClass = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(htmlNoClass).toMatch(
			/<button[^>]*aria-pressed="true"[^>]*>7\.0<\/button>/,
		);
	});

	it("restored preview draft with band 6.5 takes precedence over class band 5.5", () => {
		dataFixture.data.classes = [
			{ id: "cls-55", name: "IELTS 5.5", level: "Band 5.5", type: "ielts" },
		];
		searchFixture.current = { classId: "cls-55" };
		draftFixture.value = {
			task: "task2",
			genre: "discuss",
			title: "Restored Draft",
			status: "ready",
			skill: "writing",
			part: "task2",
			type: "discuss",
			band: "6.5",
			source: "Cam 15",
			prompt: "<p>Prompt</p>",
			passage: "",
			intro: "",
			transcript: "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
			note: "",
			items: [],
			writing: null,
		};

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>6\.5<\/button>/);
		expect(html).toMatch(
			/<button[^>]*aria-pressed="false"[^>]*>5\.5<\/button>/,
		);
		draftFixture.value = null;
		searchFixture.current = {};
		dataFixture.data.classes = [];
	});
});

describe("NewAssignmentRoute — edit mode via promptId (#614)", () => {
	const samplePrompt = {
		id: "prompt-writing-1",
		skill: "writing",
		part: "task2",
		type: "discuss",
		task: "task2",
		genre: "discuss",
		title: "Essay Discuss Both Views",
		band: "7.5",
		source: "Cambridge 17",
		prompt:
			"<p>Some people think that universities should provide graduates with the knowledge and skills needed in the workplace.</p>",
		passage: "",
		intro: "",
		transcript: "",
		cueTopic: "",
		cuePoints: "",
		audioName: "",
		imageUrl: "",
		optionBank: [],
		questions: [],
		note: "Remember 250 words minimum.",
		status: "ready",
		createdAt: "2026-11-01T00:00:00.000Z",
	};

	it("renders edit mode with prompt data, locked skill/part, and Save Changes button", () => {
		dataFixture.data.assignmentPrompts = [samplePrompt];
		searchFixture.current = { promptId: "prompt-writing-1" };

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Chỉnh sửa đề bài");
		expect(html).toContain("Chỉnh sửa");
		expect(html).toContain("Essay Discuss Both Views");
		expect(html).toContain("Cambridge 17");
		expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>7\.5<\/button>/);
		expect(html).toContain("Lưu thay đổi");
		expect(html).not.toContain("Thêm đề vào ngân hàng");

		// Skill & part are static chips, not interactive ChipFilter options
		expect(html).toContain("Writing Academic");
		expect(html).toContain("Task 2 · 250 từ");

		// Clean up
		searchFixture.current = {};
		dataFixture.data.assignmentPrompts = [];
	});

	it("renders not found card when promptId is not in the store", () => {
		dataFixture.data.assignmentPrompts = [];
		searchFixture.current = { promptId: "non-existent-id" };

		const html = renderToStaticMarkup(<NewAssignmentRoute />);
		expect(html).toContain("Không tìm thấy đề này.");
		expect(html).toContain("Quay lại danh sách");
		expect(html).not.toContain("Lưu vào ngân hàng");
		expect(html).not.toContain("Lưu thay đổi");

		// Clean up
		searchFixture.current = {};
	});

	it("NewAssignmentPage remounts Route with promptId as key", () => {
		dataFixture.data.assignmentPrompts = [samplePrompt];
		searchFixture.current = { promptId: "prompt-writing-1" };

		const html = renderToStaticMarkup(<NewAssignmentPage />);
		expect(html).toContain("Chỉnh sửa đề bài");
		expect(html).toContain("Essay Discuss Both Views");

		searchFixture.current = {};
		dataFixture.data.assignmentPrompts = [];
	});
});
