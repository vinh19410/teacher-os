import { cn } from "@teacher-os/ui/lib/utils";
import { ChevronsUpDown } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export type ShellUser = {
	name: string;
	email?: string;
	initials: string;
	/** Avatar node — app tự render (web dùng Avatar có ảnh + testid e2e). */
	avatar?: ReactNode;
	/** Có href → cả footer là link hồ sơ (web: /profile); không có → button. */
	href?: string;
	/** Bấm footer chế độ button khi không có `menu`. */
	onClick?: () => void;
	/** Nội dung menu popover mở khi bấm footer (student: Đăng xuất). */
	menu?: ReactNode;
	/** Node hiển thị cạnh tên (web: badge plan). */
	badge?: ReactNode;
	/** Node cuối hàng footer (web: nút đăng xuất). */
	trailing?: ReactNode;
	/** data-testid dòng email (web e2e: sidebar-user-email). */
	emailTestId?: string;
	/** Accessible name + title của control (web: "Hồ sơ cá nhân"). */
	label?: string;
	/** Title hover riêng (web: "Tên (email)"). */
	title?: string;
};

/** Avatar mặc định: nền muted, chữ cái đầu. */
function InitialsAvatar({ initials }: { initials: string }) {
	return (
		<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted font-medium text-xs">
			{initials}
		</span>
	);
}

/**
 * Dòng user cuối sidebar (design Shell): avatar + tên + email; web render
 * thành link hồ sơ, student bấm mở menu tài khoản (Đăng xuất). Ở rail thu
 * gọn (desktop) chỉ còn avatar — email giữ sr-only để SR/e2e vẫn đọc được.
 */
export function UserFooter({
	user,
	collapsed = false,
}: {
	user: ShellUser;
	collapsed?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement>(null);
	const hasMenu = user.menu !== undefined;

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

	const rowClass =
		"flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

	const control =
		user.href !== undefined ? (
			<a
				href={user.href}
				aria-label={user.label}
				title={user.title ?? user.label}
				className={rowClass}
			>
				{user.avatar ?? <InitialsAvatar initials={user.initials} />}
				<TextBlock user={user} collapsed={collapsed} />
			</a>
		) : (
			<button
				type="button"
				onClick={() => {
					if (hasMenu) setOpen((prev) => !prev);
					user.onClick?.();
				}}
				aria-label={user.label}
				aria-expanded={hasMenu ? open : undefined}
				aria-haspopup={hasMenu ? "menu" : undefined}
				title={user.title ?? user.label}
				className={rowClass}
			>
				{user.avatar ?? <InitialsAvatar initials={user.initials} />}
				<TextBlock user={user} collapsed={collapsed} withChevron={hasMenu} />
			</button>
		);

	return (
		<div ref={wrapRef} className="relative">
			{control}
			{user.trailing}
			{open && user.menu && (
				<div className="absolute right-2 bottom-full left-2 z-20 mb-1">
					{user.menu}
				</div>
			)}
		</div>
	);
}

function TextBlock({
	user,
	collapsed,
	withChevron = false,
}: {
	user: ShellUser;
	collapsed: boolean;
	withChevron?: boolean;
}) {
	return (
		<>
			<span className="grid min-w-0 flex-1 leading-tight">
				<span
					className={cn(
						"flex items-center font-medium",
						collapsed && "lg:hidden",
					)}
				>
					<span className="truncate" title={user.name}>
						{user.name}
					</span>
					{user.badge}
				</span>
				{/* Email giữ sr-only khi thu gọn (phase-02 M1): testid + accessible
					email phải tồn tại cả trong rail 64px. */}
				{user.email && (
					<span
						data-testid={user.emailTestId ?? undefined}
						title={user.email}
						className={cn(
							"truncate text-muted-foreground text-xs",
							collapsed && "lg:sr-only",
						)}
					>
						{user.email}
					</span>
				)}
			</span>
			{withChevron && (
				<ChevronsUpDown
					aria-hidden="true"
					className={cn(
						"size-4 text-muted-foreground",
						collapsed && "lg:hidden",
					)}
				/>
			)}
		</>
	);
}
