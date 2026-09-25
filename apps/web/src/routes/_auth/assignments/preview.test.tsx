import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_DRAFT_KEY } from "@/lib/assignment-preview-draft";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
	Link: (props: { to: string; children?: React.ReactNode }) => (
		<a href={props.to}>{props.children}</a>
	),
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
