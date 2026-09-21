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
});
