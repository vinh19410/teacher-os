import { cn } from "@teacher-os/ui/lib/utils";
import type { ReactNode } from "react";
import { type NavGroup, NavGroups } from "./nav-group";
import { type ShellTeam, TeamSwitcher } from "./team-switcher";
import { type ShellUser, UserFooter } from "./user-footer";

/**
 * Cột sidebar (design sidebar-07): TeamSwitcher đầu cột, nav có nhãn nhóm ở
 * giữa, user footer cuối cột. Dùng cho cả cột desktop lẫn panel drawer mobile.
 */
export function Sidebar({
	nav,
	activeKey,
	onSelect,
	team,
	user,
	collapsed = false,
	navLabel,
	logo,
	footerSlot,
	className,
}: {
	nav: NavGroup[];
	activeKey: string;
	onSelect?: (key: string) => void;
	team?: ShellTeam;
	user?: ShellUser;
	collapsed?: boolean;
	/** Accessible name của nav (student: "Điều hướng học viên"). */
	navLabel?: string;
	/** Logo đầu TeamSwitcher (app truyền logo riêng). */
	logo?: ReactNode;
	/** Node dưới user footer (web: VersionBadge). */
	footerSlot?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex h-full flex-col bg-sidebar text-sidebar-foreground",
				className,
			)}
		>
			{team && (
				<div className="p-2">
					<TeamSwitcher team={team} logo={logo} collapsed={collapsed} />
				</div>
			)}
			<nav aria-label={navLabel} className="flex-1 overflow-y-auto px-2 pb-2">
				<NavGroups
					groups={nav}
					activeKey={activeKey}
					onSelect={onSelect}
					collapsed={collapsed}
				/>
			</nav>
			{(user || footerSlot) && (
				<div className={cn("p-2", user && footerSlot && "pt-0")}>
					{user && <UserFooter user={user} collapsed={collapsed} />}
					{footerSlot}
				</div>
			)}
		</div>
	);
}
