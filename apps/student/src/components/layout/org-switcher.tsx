import { useQueryClient } from "@tanstack/react-query";
import type { ShellTeam } from "@teacher-os/ui/components/app-shell/team-switcher";
import { useEffect, useSyncExternalStore } from "react";
import {
	getActiveStudentOrgId,
	setActiveStudentOrgId,
	useStudentOrgs,
} from "@/lib/repos/student";
import { subscribeActiveStudentOrg } from "@/lib/student-org-storage";

/**
 * Dữ liệu TeamSwitcher học viên — giữ nguyên logic `useStudentOrgs` của
 * OrgSwitcher v1: org active theo localStorage, đổi org → invalidate cache
 * `["student"]`. Trả về null khi đang tải/chưa có org (shell bỏ qua khối).
 */
export function useStudentTeam(): ShellTeam | null {
	const queryClient = useQueryClient();
	const { data: orgs, isLoading, isFetching, isError } = useStudentOrgs();

	const activeOrgId = useSyncExternalStore(
		subscribeActiveStudentOrg,
		getActiveStudentOrgId,
		getActiveStudentOrgId,
	);
	const currentOrg =
		orgs?.find((o) => o.id === activeOrgId) ??
		orgs?.find((o) => o.isCurrent) ??
		orgs?.[0];

	// Keep localStorage synced when unset or pointing to a stale/removed org (#675)
	useEffect(() => {
		if (!currentOrg || isFetching || isError || activeOrgId === currentOrg.id) {
			return;
		}
		const hadStaleOrg = activeOrgId !== null;
		setActiveStudentOrgId(currentOrg.id);
		if (hadStaleOrg) {
			void queryClient.invalidateQueries({ queryKey: ["student"] });
		}
	}, [currentOrg, isFetching, isError, activeOrgId, queryClient]);

	if (isLoading || !orgs || orgs.length === 0 || !currentOrg) {
		return null;
	}

	return {
		name: currentOrg.name,
		sub: "Portal học viên",
		orgs: orgs.map((org) => ({ id: org.id, name: org.name })),
		activeOrgId: currentOrg.id,
		onOrg: (orgId) => {
			if (orgId === currentOrg.id) return;
			setActiveStudentOrgId(orgId);
			void queryClient.invalidateQueries({ queryKey: ["student"] });
		},
		// Hook e2e giữ nguyên từ OrgSwitcher v1 (spec org-switcher).
		triggerTestId: "org-switcher-trigger",
		menuTestId: "org-switcher-menu",
		singleTestId: "org-switcher-single",
		menuLabel: "Tổ chức học tập",
	};
}
