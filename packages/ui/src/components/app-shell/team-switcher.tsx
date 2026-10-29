import { cn } from "@teacher-os/ui/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

/** Tổ chức trong switcher — student giữ logic id (useStudentOrgs). */
export type ShellOrg = { id: string; name: string };

export type ShellTeam = {
	name: string;
	sub: string;
	/** Có ≥2 org mới switch được; 1 org → hiển thị tĩnh. */
	orgs?: ShellOrg[];
	activeOrgId?: string;
	onOrg?: (orgId: string) => void;
	/** Hook e2e học viên — giữ nguyên testid v1 (spec org-switcher). */
	triggerTestId?: string;
	menuTestId?: string;
	singleTestId?: string;
	/** Nhãn của menu org (mặc định "Organizations"). */
	menuLabel?: string;
};

/** Chữ cái đầu của tên org — tối đa 2 từ, dùng làm avatar vuông. */
function orgInitials(name: string): string {
	return name
		.split(" ")
		.map((word) => word[0])
		.slice(0, 2)
		.join("");
}

/**
 * Logo + tên app/org đầu sidebar (design TeamSwitcher): bấm mở menu đổi tổ
 * chức khi có ≥2 org; 1 org hoặc không có org thì chỉ hiển thị tĩnh.
 */
export function TeamSwitcher({
	team,
	logo,
	collapsed = false,
}: {
	team: ShellTeam;
	/** Logo đầu row — app truyền logo riêng (shell mặc định ô vuông primary). */
	logo?: ReactNode;
	collapsed?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const orgs = team.orgs ?? [];
	const switchable = orgs.length > 1;

	// Esc + click ra ngoài đóng menu (hành vi org-switcher v1).
	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		const onPointerDown = (event: PointerEvent) => {
			if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
		};
		document.addEventListener("keydown", onKeyDown);
		document.addEventListener("pointerdown", onPointerDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			document.removeEventListener("pointerdown", onPointerDown);
		};
	}, [open]);

	const headerRow = (
		<span className="grid min-w-0 flex-1 leading-tight">
			<span className={cn("truncate font-medium", collapsed && "lg:hidden")}>
				{team.name}
			</span>
			<span
				className={cn(
					"truncate text-muted-foreground text-xs",
					collapsed && "lg:hidden",
				)}
			>
				{team.sub}
			</span>
		</span>
	);

	if (!switchable) {
		return (
			<div
				data-testid={
					orgs.length === 1 ? (team.singleTestId ?? undefined) : undefined
				}
				className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm"
			>
				{logo}
				{headerRow}
			</div>
		);
	}

	const currentId =
		orgs.find((org) => org.id === team.activeOrgId)?.id ?? orgs[0]?.id;

	return (
		<div ref={wrapRef} className="relative">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				aria-expanded={open}
				aria-haspopup="menu"
				data-testid={team.triggerTestId ?? undefined}
				className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{logo}
				{headerRow}
				<ChevronsUpDown
					aria-hidden="true"
					className={cn(
						"size-4 text-muted-foreground",
						collapsed && "lg:hidden",
					)}
				/>
			</button>
			{open && (
				<div
					role="menu"
					data-testid={team.menuTestId ?? undefined}
					className="absolute top-full right-2 left-2 z-20 mt-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					<div className="px-2 py-1.5 text-muted-foreground text-xs">
						{team.menuLabel ?? "Organizations"}
					</div>
					{orgs.map((org) => {
						const selected = org.id === currentId;
						return (
							<button
								key={org.id}
								type="button"
								role="menuitem"
								onClick={() => {
									team.onOrg?.(org.id);
									setOpen(false);
								}}
								className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
							>
								<span className="flex size-6 items-center justify-center rounded-md border font-medium text-[10px]">
									{orgInitials(org.name)}
								</span>
								<span className="flex-1 truncate text-left">{org.name}</span>
								{selected && <Check aria-hidden="true" className="size-4" />}
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
