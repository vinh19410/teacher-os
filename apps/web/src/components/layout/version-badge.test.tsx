import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VersionBadge } from "./version-badge";

describe("VersionBadge component", () => {
	it("renders the build version with a v prefix and data-testid", () => {
		const html = renderToStaticMarkup(<VersionBadge />);
		expect(html).toContain('data-testid="app-version"');
		expect(html).toContain(`v${__APP_VERSION__}`);
		expect(html).toMatch(/v\d+\.\d+\.\d+/);
	});
});
