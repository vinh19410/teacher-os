import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./not-found";

describe("NotFoundPage component", () => {
	it("renders the branded Cô Mỹ Dạy Tiếng Anh header with logo and home link", () => {
		const html = renderToStaticMarkup(<NotFoundPage />);
		expect(html).toContain("Cô Mỹ Dạy Tiếng Anh");
		expect(html).not.toContain("<svg");
		expect(html).toContain('href="/"');
	});

	it("renders the prominent 404 indicator and localized Vietnamese messaging", () => {
		const html = renderToStaticMarkup(<NotFoundPage />);
		expect(html).toContain("404");
		expect(html).toContain("Không tìm thấy trang");
		expect(html).toContain("Trang không tồn tại");
		expect(html).toContain("Đường dẫn bạn truy cập không tồn tại");
	});

	it("renders navigation buttons to dashboard and login", () => {
		const html = renderToStaticMarkup(<NotFoundPage />);
		expect(html).toContain('href="/dashboard"');
		expect(html).toContain("Về bảng điều khiển");
		expect(html).toContain('href="/login"');
		expect(html).toContain("Đăng nhập");
	});

	it("renders copyright footer", () => {
		const html = renderToStaticMarkup(<NotFoundPage />);
		expect(html).toContain("© 2022 Cô Mỹ Dạy Tiếng Anh");
	});
});
