import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QuizReadingSplitLayout } from "@/components/quiz/quiz-reading-layout";

describe("QuizReadingSplitLayout — reading split-pane (#286)", () => {
	function renderLayout(node?: React.ReactNode) {
		return renderToStaticMarkup(
			<QuizReadingSplitLayout
				passage="<p>Đoạn đọc bên trái.</p>"
				navigator={node ?? <footer data-testid="nav" />}
			>
				<p>paper</p>
			</QuizReadingSplitLayout>,
		);
	}

	it("render 2 section aria-label Bài đọc / Bài làm với passage ở pane trái", () => {
		const html = renderLayout();
		expect(html).toContain('aria-label="Bài đọc"');
		expect(html).toContain('aria-label="Bài làm"');
		expect(html.indexOf("Đoạn đọc bên trái.")).toBeLessThan(
			html.indexOf('aria-label="Bài làm"'),
		);
	});

	it("mỗi pane có thanh cuộn riêng ở lg (overflow-y-auto) + wrapper khoá chiều cao khớp header", () => {
		const html = renderLayout();
		expect(html).toMatch(/lg:overflow-y-auto/g);
		expect(html).toContain("lg:h-[calc(100svh-3.5rem)]");
		expect(html).toContain("lg:grid-cols-2");
	});

	it("giữ testid trên đúng phần tử cuộn của từng pane", () => {
		const html = renderLayout();
		const passageTag = html.match(
			/<section[^>]*reading-passage-pane[^>]*>/,
		)?.[0];
		const workTag = html.match(/<div[^>]*reading-work-pane[^>]*>/)?.[0];
		expect(passageTag).toContain("lg:overflow-y-auto");
		expect(workTag).toContain("lg:overflow-y-auto");
	});

	it("navigator nằm ngoài pane bài làm, là anh em của grid 2 pane (full-width)", () => {
		const html = renderLayout();
		const navIndex = html.indexOf('<footer data-testid="nav"');
		const lastSectionClose = html.lastIndexOf("</section>");
		// Sau section "Bài làm" chỉ còn đúng thẻ đóng grid rồi tới navigator.
		expect(html.slice(lastSectionClose, navIndex)).toBe("</section></div>");
		expect(navIndex).toBeGreaterThan(lastSectionClose);
		expect(html.endsWith("</footer></div>")).toBe(true);
	});

	it("dưới lg hai pane xếp chồng — không khoá chiều cao/overflow ở mobile", () => {
		const html = renderLayout();
		// overflow/height chỉ bật ở lg: — class cứng (không prefix) không tồn tại.
		expect(html).not.toMatch(/[^:]overflow-y-auto/);
		expect(html).not.toMatch(/[^:]h-\[calc/);
	});
});
