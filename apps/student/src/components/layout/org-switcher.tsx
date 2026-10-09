import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getActiveStudentOrgId,
	setActiveStudentOrgId,
	useStudentOrgs,
} from "@/lib/repos/student";

export function OrgSwitcher() {
	const [isOpen, setIsOpen] = useState(false);
	const queryClient = useQueryClient();
	const { data: orgs, isLoading } = useStudentOrgs();

	const activeOrgId = getActiveStudentOrgId();
	const currentOrg =
		orgs?.find((o) => o.id === activeOrgId) ??
		orgs?.find((o) => o.isCurrent) ??
		orgs?.[0];

	// Keep localStorage synced with current active org if unset
	useEffect(() => {
		if (currentOrg && !activeOrgId) {
			setActiveStudentOrgId(currentOrg.id);
		}
	}, [currentOrg, activeOrgId]);

	if (isLoading) {
		return (
			<div className="neu-in flex h-8 items-center gap-2 rounded-md px-2.5 text-meta text-xs">
				<Building2 className="h-4 w-4 animate-pulse" />
				<span className="max-w-[140px] truncate">Đang tải...</span>
			</div>
		);
	}

	if (!orgs || orgs.length === 0) {
		return null;
	}

	if (orgs.length === 1 && currentOrg) {
		return (
			<div
				data-testid="org-switcher-single"
				className="neu-sm flex h-8 max-w-[180px] items-center gap-1.5 rounded-md px-2.5 font-medium text-fg text-xs"
			>
				<Building2 className="h-3.5 w-3.5 shrink-0 text-hot" />
				<span className="truncate">{currentOrg.name}</span>
			</div>
		);
	}

	const handleSelectOrg = (orgId: string) => {
		if (orgId === currentOrg?.id) {
			setIsOpen(false);
			return;
		}

		setActiveStudentOrgId(orgId);
		setIsOpen(false);
		void queryClient.invalidateQueries({ queryKey: ["student"] });
	};

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				data-testid="org-switcher-trigger"
				className="neu-sm flex h-8 max-w-[180px] items-center justify-between gap-1.5 rounded-md px-2.5 font-medium text-fg text-xs transition-colors hover:text-fg focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
			>
				<div className="flex min-w-0 items-center gap-1.5">
					<Building2 className="h-3.5 w-3.5 shrink-0 text-hot" />
					<span className="truncate">{currentOrg?.name || "Chọn tổ chức"}</span>
				</div>
				<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-fg" />
			</button>

			{isOpen && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setIsOpen(false)}
						aria-hidden="true"
					/>
					<div
						role="listbox"
						data-testid="org-switcher-menu"
						className="neu absolute left-0 z-50 mt-1.5 w-60 rounded-lg p-1"
					>
						<div className="border-line-soft border-b px-2.5 py-1.5 font-mono text-[10px] text-meta uppercase tracking-[0.18em]">
							Tổ chức học tập
						</div>
						<div className="py-1">
							{orgs.map((org) => {
								const isSelected = org.id === currentOrg?.id;
								return (
									<button
										key={org.id}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => handleSelectOrg(org.id)}
										className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left font-[510] text-xs transition-colors hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
									>
										<span className="truncate text-fg">{org.name}</span>
										{isSelected && (
											<Check className="h-4 w-4 shrink-0 text-hot" />
										)}
									</button>
								);
							})}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
