import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NotFoundPage } from "./not-found";

describe("admin NotFoundPage (#489)", () => {
	it("shows the branded 404 with a way back home and to login", () => {
		const html = renderToStaticMarkup(<NotFoundPage />);
		expect(html).toContain("Trang không tồn tại");
		expect(html).toContain("404");
		expect(html).toContain("Về trang quản trị");
		expect(html).toContain('href="/login"');
	});
});
