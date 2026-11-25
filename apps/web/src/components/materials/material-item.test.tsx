// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
	MaterialItem,
	MaterialOpenActions,
	type MaterialRowItem,
} from "@/components/materials/material-item";

function makeItem(overrides: Partial<MaterialRowItem> = {}): MaterialRowItem {
	return {
		id: "mat-1",
		title: "Bài đọc IELTS",
		description: "",
		kind: "link",
		url: "https://example.com/doc",
		mimeType: null,
		sizeBytes: null,
		originalName: null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("MaterialOpenActions", () => {
	it.each([
		"https://example.com/path?a=1#frag",
		"http://example.com",
		"HTTPS://EXAMPLE.COM/x",
	])("renders external link for valid url %s", (url) => {
		const { container } = render(
			<MaterialOpenActions item={makeItem({ url })} />,
		);

		expect(container.querySelectorAll("a")).toHaveLength(1);
		const link = screen.getByRole("link", {
			name: "Mở liên kết Bài đọc IELTS",
		});
		expect(link.getAttribute("href")).toBe(url);
		expect(link.getAttribute("target")).toBe("_blank");
		expect(link.getAttribute("rel")).toBe("noopener noreferrer");
		expect(link.textContent).toBe("Mở");
		expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
	});

	it.each<[string, string]>([
		["lowercase javascript:", "javascript:alert(1)"],
		["uppercase JAVASCRIPT:", "JAVASCRIPT:alert(1)"],
		["mixed-case JaVaScRiPt:", "JaVaScRiPt:alert(1)"],
		["leading-space javascript:", "  javascript:alert(1)"],
		["leading C0 control-char javascript:", "\u0001javascript:alert(1)"],
		["embedded tab javascript:", "java\tscript:alert(1)"],
		["embedded newline javascript:", "java\nscript:alert(1)"],
		["data: HTML payload", "data:text/html,<script>alert(1)</script>"],
		["vbscript:", "vbscript:msgbox(1)"],
		["blob:", "blob:https://example.com/123"],
		["file:", "file:///etc/passwd"],
		["ftp:", "ftp://example.com/a"],
		["mailto:", "mailto:a@b.com"],
		["tel:", "tel:+84123456"],
	])("renders nothing for unsafe scheme (%s)", (_label, url) => {
		const { container } = render(
			<MaterialOpenActions item={makeItem({ url })} />,
		);

		expect(container.firstChild).toBeNull();
		expect(container.querySelectorAll("a")).toHaveLength(0);
		expect(screen.queryByRole("link")).toBeNull();
	});

	it.each<[string, string | null]>([
		["protocol-relative URL", "//evil.com/phish"],
		["root-relative path", "/internal/path"],
		["bare domain", "example.com"],
		["scheme without host", "https://"],
		["whitespace-only string", "   "],
		["empty string", ""],
		["null url", null],
	])("renders nothing for non-absolute or empty url (%s)", (_label, url) => {
		const { container } = render(
			<MaterialOpenActions item={makeItem({ url })} />,
		);

		expect(container.firstChild).toBeNull();
		expect(container.querySelectorAll("a")).toHaveLength(0);
		expect(screen.queryByRole("link")).toBeNull();
	});

	it.each<[string, string | null]>([
		["null url", null],
		["defensive unsafe url", "javascript:alert(1)"],
	])("renders only download link for file kind (%s)", (_label, url) => {
		const { container } = render(
			<MaterialOpenActions
				item={makeItem({
					kind: "file",
					url,
					mimeType: "application/pdf",
					sizeBytes: 1024,
					originalName: "de.pdf",
				})}
			/>,
		);

		expect(container.querySelectorAll("a")).toHaveLength(1);
		const downloadLink = screen.getByRole("link", {
			name: "Tải xuống Bài đọc IELTS",
		});
		expect(downloadLink.getAttribute("href")).toMatch(
			/\/api\/materials\/mat-1\/file\?download=1$/,
		);
		expect(downloadLink.getAttribute("target")).toBeNull();
		expect(screen.queryByRole("link", { name: /Phát|Mở liên kết/ })).toBeNull();
	});

	it("renders play and download links for media kind", () => {
		const { container } = render(
			<MaterialOpenActions
				item={makeItem({
					kind: "media",
					url: null,
					mimeType: "audio/mpeg",
					sizeBytes: 2048,
					originalName: "audio.mp3",
				})}
			/>,
		);

		expect(container.querySelectorAll("a")).toHaveLength(2);
		const playLink = screen.getByRole("link", { name: "Phát Bài đọc IELTS" });
		expect(playLink.getAttribute("href")).toMatch(
			/\/api\/materials\/mat-1\/file$/,
		);
		expect(playLink.getAttribute("target")).toBe("_blank");
		expect(playLink.getAttribute("rel")).toBe("noopener noreferrer");

		const downloadLink = screen.getByRole("link", {
			name: "Tải xuống Bài đọc IELTS",
		});
		expect(downloadLink.getAttribute("href")).toMatch(
			/\/api\/materials\/mat-1\/file\?download=1$/,
		);
	});
});

describe("MaterialItem with MaterialOpenActions", () => {
	it("keeps row title visible while omitting anchor for unsafe link url", () => {
		const unsafeItem = makeItem({ url: "javascript:alert(1)" });
		const { container } = render(
			<ul>
				<MaterialItem
					item={unsafeItem}
					actions={<MaterialOpenActions item={unsafeItem} />}
				/>
			</ul>,
		);

		const row = screen.getByTestId("material-item");
		expect(row.textContent).toContain("Bài đọc IELTS");
		expect(container.querySelectorAll("a")).toHaveLength(0);
	});
});
