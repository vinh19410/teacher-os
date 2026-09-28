import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockOrgs = vi.fn();

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		invalidateQueries: vi.fn(),
	}),
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentOrgs: () => mockOrgs(),
	getActiveStudentOrgId: () => "org-1",
	setActiveStudentOrgId: vi.fn(),
}));

import { OrgSwitcher } from "@/components/layout/org-switcher";

describe("OrgSwitcher", () => {
	it("renders nothing when org list is empty", () => {
		mockOrgs.mockReturnValue({
			data: [],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<OrgSwitcher />);
		expect(html).toBe("");
	});

	it("renders single org display without dropdown when user has only 1 org", () => {
		mockOrgs.mockReturnValue({
			data: [{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true }],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<OrgSwitcher />);
		expect(html).toContain('data-testid="org-switcher-single"');
		expect(html).toContain("IELTS Thầy Vinh");
		expect(html).not.toContain('data-testid="org-switcher-trigger"');
	});

	it("renders dropdown trigger with current org name when user has 2+ orgs", () => {
		mockOrgs.mockReturnValue({
			data: [
				{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true },
				{ id: "org-2", name: "TOEIC Cô Mai", isCurrent: false },
			],
			isLoading: false,
		});

		const html = renderToStaticMarkup(<OrgSwitcher />);
		expect(html).toContain('data-testid="org-switcher-trigger"');
		expect(html).toContain("IELTS Thầy Vinh");
	});
});
