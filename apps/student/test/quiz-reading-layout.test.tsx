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

	it("mỗi pane có thanh cuộn riêng ở lg (overflow-y-auto) + chiều cao khớp header", () => {
		const html = renderLayout();
		expect(html).toMatch(/lg:overflow-y-auto/g);
		expect(html).toContain("lg:h-[calc(100svh-3.5rem)]");
		expect(html).toContain("lg:grid-cols-2");
	});

	it("navigator nằm trong pane bài làm (không ăn chiều cao pane đọc)", () => {
		const html = renderLayout();
		const navIndex = html.indexOf('data-testid="nav"');
		const workIndex = html.indexOf('aria-label="Bài làm"');
		expect(workIndex).toBeLessThan(navIndex);
	});

	it("dưới lg hai pane xếp chồng — không khoá chiều cao/overflow ở mobile", () => {
		const html = renderLayout();
		// overflow/height chỉ bật ở lg: — class cứng (không prefix) không tồn tại.
		expect(html).not.toMatch(/[^:]overflow-y-auto/);
		expect(html).not.toMatch(/[^:]h-\[calc/);
	});
});
