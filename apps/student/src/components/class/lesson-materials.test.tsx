// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { StudentLessonMaterialView } from "@teacher-os/api/material-contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { formatFileSize, LessonMaterials } from "./lesson-materials";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(JSON.stringify(body), {
					status,
					headers: { "Content-Type": "application/json" },
				}),
		),
	);
}

function item(
	over: Partial<StudentLessonMaterialView> & { id: string },
): StudentLessonMaterialView {
	return {
		title: "Tài liệu",
		description: "",
		kind: "file",
		url: null,
		mimeType: "application/pdf",
		sizeBytes: 2_500_000,
		originalName: "a.pdf",
		position: 0,
		...over,
	};
}

function renderMaterials() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<LessonMaterials classId="class-1" date="2026-11-20" />
		</QueryClientProvider>,
	);
}

describe("formatFileSize", () => {
	it("định dạng dễ đọc", () => {
		expect(formatFileSize(null)).toBe("");
		expect(formatFileSize(512)).toBe("512 B");
		expect(formatFileSize(2_500_000)).toBe("2.5 MB");
		expect(formatFileSize(25_000_000)).toBe("25 MB");
	});
});

describe("LessonMaterials", () => {
	it("vẽ từng loại: file có Mở/Tải, link rel an toàn, media có trình phát", async () => {
		stubFetch(200, {
			items: [
				item({ id: "m1", title: "Đề cương", description: "Đọc trước" }),
				item({
					id: "m2",
					title: "Bài đọc",
					kind: "link",
					url: "https://example.com/doc",
					mimeType: null,
					sizeBytes: null,
				}),
				item({
					id: "m3",
					title: "Nghe",
					kind: "media",
					mimeType: "audio/mpeg",
				}),
				item({
					id: "m4",
					title: "Xem",
					kind: "media",
					mimeType: "video/mp4",
				}),
			],
		});
		const { container } = renderMaterials();
		await waitFor(() =>
			expect(screen.getAllByTestId("lesson-material")).toHaveLength(4),
		);
		expect(screen.getByText("Đọc trước")).toBeTruthy();
		expect(screen.getAllByText("2.5 MB").length).toBeGreaterThan(0);

		const [file, link] = screen.getAllByTestId("lesson-material");
		const download = file?.querySelector("a[href*='download=1']");
		expect(download).toBeTruthy();
		expect(file?.querySelector("a[target='_blank']")?.getAttribute("rel")).toBe(
			"noopener noreferrer",
		);
		const ext = link?.querySelector("a");
		expect(ext?.getAttribute("href")).toBe("https://example.com/doc");
		expect(ext?.getAttribute("target")).toBe("_blank");
		expect(ext?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(link?.querySelector("a[href*='download=1']")).toBeNull();

		expect(container.querySelectorAll("audio")).toHaveLength(1);
		expect(container.querySelectorAll("video")).toHaveLength(1);
		expect(container.querySelector("audio")?.getAttribute("src")).toContain(
			"/sessions/2026-11-20/materials/m3/file",
		);
	});

	it("hiện empty khi buổi chưa có tài liệu", async () => {
		stubFetch(200, { items: [] });
		renderMaterials();
		expect(await screen.findByText("Buổi này chưa có tài liệu")).toBeTruthy();
	});

	it("404 không crash và không hiện lỗi, coi như chưa có tài liệu", async () => {
		stubFetch(404, { error: "session not found" });
		renderMaterials();
		expect(await screen.findByText("Buổi này chưa có tài liệu")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("lỗi khác 404 hiện thông báo lỗi", async () => {
		stubFetch(500, { error: "boom" });
		renderMaterials();
		expect(await screen.findByRole("alert")).toBeTruthy();
	});
});
