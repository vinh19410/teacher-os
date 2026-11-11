// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockOrgs = vi.fn();
const mockInvalidateQueries = vi.fn();
const mockGetActiveOrgId = vi.fn<() => string | null>(() => "org-1");

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({
		invalidateQueries: mockInvalidateQueries,
	}),
}));

vi.mock("@/lib/repos/student", () => ({
	useStudentOrgs: () => mockOrgs(),
	getActiveStudentOrgId: () => mockGetActiveOrgId(),
	setActiveStudentOrgId: vi.fn(),
}));

import { useStudentTeam } from "@/components/layout/org-switcher";
import { setActiveStudentOrgId } from "@/lib/repos/student";

describe("useStudentTeam", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetActiveOrgId.mockReturnValue("org-1");
	});

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

	it("heals stale active_student_org_id not in orgs and invalidates ['student'] (#675)", () => {
		mockGetActiveOrgId.mockReturnValue("org-removed");
		mockOrgs.mockReturnValue({
			data: [{ id: "org-2", name: "TOEIC Cô Mai", isCurrent: true }],
			isLoading: false,
		});
		const team = renderHook(() => useStudentTeam()).result.current;
		expect(team?.activeOrgId).toBe("org-2");
		expect(setActiveStudentOrgId).toHaveBeenCalledWith("org-2");
		expect(mockInvalidateQueries).toHaveBeenCalledWith({
			queryKey: ["student"],
		});
	});

	it("persists initial org when active_student_org_id is null without redundant invalidation", () => {
		mockGetActiveOrgId.mockReturnValue(null);
		mockOrgs.mockReturnValue({
			data: [{ id: "org-1", name: "IELTS Thầy Vinh", isCurrent: true }],
			isLoading: false,
		});
		const team = renderHook(() => useStudentTeam()).result.current;
		expect(team?.activeOrgId).toBe("org-1");
		expect(setActiveStudentOrgId).toHaveBeenCalledWith("org-1");
		expect(mockInvalidateQueries).not.toHaveBeenCalled();
	});

	it("does not write back stale cached org while /orgs is actively refetching (#675 review F1)", () => {
		mockGetActiveOrgId.mockReturnValue(null);
		mockOrgs.mockReturnValue({
			data: [{ id: "org-stale-cached", name: "Trung tâm Cũ", isCurrent: true }],
			isLoading: false,
			isFetching: true,
			isError: false,
		});
		renderHook(() => useStudentTeam());
		expect(setActiveStudentOrgId).not.toHaveBeenCalled();
	});
});
