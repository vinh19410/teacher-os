import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvatarMenu } from "@/components/layout/avatar-menu";

describe("AvatarMenu", () => {
	it("renders compact variant with initial and name", () => {
		const html = renderToStaticMarkup(
			<AvatarMenu name="Vinh Tran" email="vinh@test.local" variant="compact" />,
		);
		expect(html).toContain(">V</span>");
		expect(html).toContain("Vinh Tran");
		expect(html).toContain('aria-label="Tài khoản học viên"');
	});

	it("renders sidebar variant with full user card including name and email", () => {
		const html = renderToStaticMarkup(
			<AvatarMenu name="Vinh Tran" email="vinh@test.local" variant="sidebar" />,
		);
		expect(html).toContain(">V</span>");
		expect(html).toContain("Vinh Tran");
		expect(html).toContain("vinh@test.local");
		expect(html).toContain('aria-label="Tài khoản học viên"');
	});
});
