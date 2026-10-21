// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
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

import { useStudentTeam } from "@/components/layout/org-switcher";
import { setActiveStudentOrgId } from "@/lib/repos/student";

describe("useStudentTeam", () => {
	it("returns null when org list is empty or loading", () => {
		mockOrgs.mockReturnValue({ data: [], isLoading: false });
		expect(renderHook(() => useStudentTeam()).result.current).toBeNull();

		mockOrgs.mockReturnValue({ data: undefined, isLoading: true });
		expect(renderHook(() => useStudentTeam()).result.current).toBeNull();
	});

	it("maps the active org into a static single-org team (testid v1)", () => {
		mockOrgs.mockReturnValue({
			data: [{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true }],
			isLoading: false,
		});
		const team = renderHook(() => useStudentTeam()).result.current;
		expect(team?.name).toBe("IELTS Thầy Vinh");
		expect(team?.orgs).toEqual([{ id: "org-1", name: "IELTS Thầy Vinh" }]);
		// 1 org → TeamSwitcher hiển thị tĩnh với testid single.
		expect(team?.singleTestId).toBe("org-switcher-single");
	});

	it("exposes the switcher trigger + onOrg for 2+ orgs", () => {
		mockOrgs.mockReturnValue({
			data: [
				{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true },
				{ id: "org-2", name: "TOEIC Cô Mai", isCurrent: false },
			],
			isLoading: false,
		});
		const team = renderHook(() => useStudentTeam()).result.current;
		expect(team?.triggerTestId).toBe("org-switcher-trigger");
		expect(team?.menuTestId).toBe("org-switcher-menu");
		expect(team?.activeOrgId).toBe("org-1");
		// onOrg nhận ID org (logic setActiveStudentOrgId + invalidate giữ nguyên).
		team?.onOrg?.("org-2");
		expect(setActiveStudentOrgId).toHaveBeenCalledWith("org-2");
	});
});
