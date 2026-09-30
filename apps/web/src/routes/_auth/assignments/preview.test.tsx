import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_DRAFT_KEY } from "@/lib/assignment-preview-draft";
import type { AssignmentPrompt } from "@/lib/mock-data";

let mockSearch: { id?: string } = {};

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useSearch: () => mockSearch,
	}),
	useNavigate: () => vi.fn(),
	useSearch: () => mockSearch,
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
}));

const bankPromptFixture: AssignmentPrompt[] = [
	{
		id: "p-bank-1",
		skill: "reading",
		part: "p3",
		type: "features",
		task: "p3",
		genre: "features",
		title: "QC-282 Bank Features",
		band: "7.0",
		source: "Cambridge 12",
		prompt: "",
		intro: "Questions 27–30 · Match each feature with the correct person.",
		passage: "The canal builders changed the landscape forever.",
		optionBank: ["Isambard Kingdom Brunel", "Charles Darwin"],
		questions: [
			{ stem: "27 The first boat", opts: null, answer: "A", alts: "" },
		],
		note: "",
		status: "ready",
		createdAt: "2026-09-28T00:00:00.000Z",
	},
];

vi.mock("@/lib/data-store", () => ({
	useData: () => ({ data: { assignmentPrompts: bankPromptFixture } }),
}));

import { PreviewAssignmentRoute } from "./preview";

function stubStorageWith(json: string) {
	const map = new Map<string, string>([[PREVIEW_DRAFT_KEY, json]]);
	vi.stubGlobal("window", {
		sessionStorage: {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v),
			removeItem: (k: string) => void map.delete(k),
		},
	});
}

const draft = {
	task: "task2",
	genre: "discuss",
	title: "QC Preview Essay",
	band: "7.0",
	source: "Cambridge 10, Test 2",
	prompt: "Some people think that all university students…",
	note: "",
	status: "ready",
};

afterEach(() => {
	vi.unstubAllGlobals();
	mockSearch = {};
});

describe("PreviewAssignmentRoute (#213)", () => {
	it("renders the paper + simulated answer sheet from a valid snapshot", () => {
		stubStorageWith(JSON.stringify(draft));
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("Xem trước bài tập");
		expect(html).toContain("QC Preview Essay");
		expect(html).toContain("Academic · 250 từ · 40 phút · Band 7.0");
		expect(html).toContain("Bài làm của học viên (mô phỏng)");
		expect(html).toContain("Học viên sẽ viết bài ở đây…");
		expect(html).toContain("Bản xem trước — bài làm không được lưu.");
		expect(html).toContain("Quay lại soạn đề");
	});

	it("shows the honest empty state without a snapshot", () => {
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("Chưa có bản nháp nào để xem trước.");
		expect(html).toContain("Mở trang tạo bài tập");
		expect(html).not.toContain("Bài làm của học viên");
	});

	it("shows the empty state for malformed JSON too", () => {
		stubStorageWith("{oops");
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("Chưa có bản nháp nào để xem trước.");
		expect(html).not.toContain("Bài làm của học viên");
	});

	it("renders a reading paper with passage, intro bank, questions and diagram image (#269)", () => {
		stubStorageWith(
			JSON.stringify({
				task: "p1",
				genre: "diagram",
				title: "QC-269 Diagram paper",
				band: "7.0",
				source: "",
				prompt: "",
				note: "",
				status: "ready",
				skill: "reading",
				part: "p1",
				type: "diagram",
				passage: "Stepwells are underground reservoirs.",
				intro:
					"Complete the diagram. ONE WORD ONLY from the passage.\nA reservoir  B tunnel  C channel",
				audioName: "",
				imageUrl: "https://example.com/qc-269.png",
				items: [
					{
						stem: "Label 4 of the diagram.",
						answer: "SECRET_QC_269",
						opts: null,
						alts: "",
					},
				],
			}),
		);
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		// Passage + intro (word limit + option bank) + stems all visible.
		expect(html).toContain("Stepwells are underground reservoirs.");
		expect(html).toContain("ONE WORD ONLY");
		expect(html).toContain("A reservoir");
		expect(html).toContain("Label 4 of the diagram.");
		// Diagram image gated to the diagram type with a safe https URL.
		expect(html).toContain('src="https://example.com/qc-269.png"');
		expect(html).toContain('alt="Ảnh biểu đồ đề Reading"');
		// Leak-check: the answer key never reaches the student preview.
		expect(html).not.toContain("SECRET_QC_269");
		expect(html).not.toContain("Đáp án đúng");
	});

	it("never renders the diagram image for non-diagram types (#269)", () => {
		stubStorageWith(
			JSON.stringify({
				task: "p2",
				genre: "tablecomp",
				title: "QC-269 Table paper",
				band: "7.0",
				source: "",
				prompt: "",
				note: "",
				status: "draft",
				skill: "reading",
				part: "p2",
				type: "tablecomp",
				passage: "Passage text.",
				intro: "",
				imageUrl: "https://example.com/leftover.png",
				items: [
					{ stem: "Year of the flood.", answer: "1834", opts: null, alts: "" },
				],
			}),
		);
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("Passage text.");
		// The URL was pasted before the type switch — the renderer must still
		// gate the image to the diagram type.
		expect(html).not.toContain("leftover.png");
		expect(html).not.toContain("<img");
	});

	it("does not render an unsafe image URL even for a diagram draft (#269)", () => {
		stubStorageWith(
			JSON.stringify({
				task: "p1",
				genre: "diagram",
				title: "QC-269 Unsafe",
				band: "7.0",
				source: "",
				prompt: "",
				note: "",
				status: "draft",
				skill: "reading",
				part: "p1",
				type: "diagram",
				passage: "Passage.",
				intro: "",
				imageUrl: "javascript:alert(1)",
				items: [{ stem: "Label.", answer: "x", opts: null, alts: "" }],
			}),
		);
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).not.toContain("<img");
		expect(html).not.toContain("javascript:alert(1)");
	});
});

describe("PreviewAssignmentRoute — bank mode ?id= (#282)", () => {
	it("renders the saved prompt paper with bank chrome", () => {
		mockSearch = { id: "p-bank-1" };
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("QC-282 Bank Features");
		expect(html).toContain("The canal builders changed the landscape forever.");
		expect(html).toContain("Ngân hàng lựa chọn");
		expect(html).toContain("Isambard Kingdom Brunel");
		expect(html).toContain("27 The first boat");
		expect(html).toContain("Quay lại danh sách");
		expect(html).not.toContain("Quay lại soạn đề");
		expect(html).not.toContain("Chưa có bản nháp nào để xem trước.");
	});

	it("?id= wins over a stale composer draft in sessionStorage", () => {
		mockSearch = { id: "p-bank-1" };
		stubStorageWith(JSON.stringify(draft));
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("QC-282 Bank Features");
		expect(html).not.toContain("QC Preview Essay");
	});

	it("unknown id shows the honest empty state back to the bank", () => {
		mockSearch = { id: "nope" };
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain("Không tìm thấy đề này.");
		expect(html).toContain("Quay lại danh sách");
		expect(html).not.toContain("Bài làm của học viên");
	});
});

describe("PreviewAssignmentRoute — segmented control cho đề auto-graded (#285)", () => {
	const readingDraft = {
		task: "p1",
		genre: "note",
		title: "QC-285 Sim tabs",
		band: "7.0",
		source: "",
		prompt: "",
		note: "Hướng dẫn: điền ONE WORD ONLY.",
		status: "ready",
		skill: "reading",
		part: "p1",
		type: "note",
		passage: "Passage text.",
		intro: "",
		items: [
			{
				stem: "The tower is made of ____.",
				answer: "SECRET_QC_285_KEY",
				opts: null,
				alts: "SECRET_QC_285_ALT",
			},
		],
	};

	it("đề auto-graded: 2 tab hiện, ẩn textarea mô phỏng, chỉ tab 'Đề bài' nằm trong DOM", () => {
		stubStorageWith(JSON.stringify(readingDraft));
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).toContain('role="tab"');
		expect(html).toContain("Đề bài");
		// Static markup escape `&` → `&amp;`.
		expect(html).toContain("Làm thử &amp; Soi bài");
		// Validation S1: khối textarea vô dụng với cloze/mcq bị ẩn.
		expect(html).not.toContain("Bài làm của học viên (mô phỏng)");
		// Render điều kiện đúng 1 tab: take view chưa mount ở tab mặc định.
		expect(html).not.toContain("Nộp bài");
		// Answer key không render ở tab "Đề bài".
		expect(html).not.toContain("SECRET_QC_285_KEY");
	});

	it("đề writing: không có tab, textarea mô phỏng giữ nguyên hiện trạng", () => {
		stubStorageWith(JSON.stringify(draft));
		const html = renderToStaticMarkup(<PreviewAssignmentRoute />);
		expect(html).not.toContain('role="tab"');
		expect(html).toContain("Bài làm của học viên (mô phỏng)");
	});
});
