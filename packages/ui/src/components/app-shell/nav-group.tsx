import { cn } from "@teacher-os/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import {
	type ComponentType,
	createContext,
	type MouseEvent,
	type ReactNode,
	useContext,
	useState,
} from "react";

/** Một mục con của nav item cha (vd. Luyện tập theo skill — phase 10). */
export type NavChild = { key: string; label: string; href: string };

/**
 * Một mục điều hướng của shell. `href` được render bởi `ShellLinkComponent`
 * của app (web/student bọc TanStack `<Link>`); item có `children` là nút
 * mở/đóng nhóm con chứ không tự điều hướng.
 */
export type NavItem = {
	key: string;
	label: string;
	icon: LucideIcon;
	href: string;
	/** false = ẩn item khi route chưa tồn tại (flag theo phase). Mặc định hiện. */
	enabled?: boolean;
	children?: NavChild[];
};

/** Một nhóm nav có nhãn (vd. "Giảng dạy", "Học tập"). */
export type NavGroup = { group: string; items: NavItem[] };

/** Props link nhận từ shell — app-side component chịu trách nhiệm render <a>. */
export type ShellLinkProps = {
	href: string;
	className?: string;
	"aria-current"?: "page" | undefined;
	onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
	children: ReactNode;
};

export type ShellLinkComponent = ComponentType<ShellLinkProps>;

/** Link dự phòng khi app không truyền `linkComponent` — <a> thuần. */
function DefaultShellLink({
	href,
	className,
	"aria-current": ariaCurrent,
	onClick,
	children,
}: ShellLinkProps) {
	return (
		<a
			href={href}
			className={className}
			aria-current={ariaCurrent}
			onClick={onClick}
		>
			{children}
		</a>
	);
}

const ShellLinkContext = createContext<ShellLinkComponent>(DefaultShellLink);

/** Cung cấp link component cho toàn bộ nav (web/student bọc router link). */
export function ShellLinkProvider({
	linkComponent: Link,
	children,
}: {
	linkComponent: ShellLinkComponent;
	children: ReactNode;
}) {
	return (
		<ShellLinkContext.Provider value={Link}>
			{children}
		</ShellLinkContext.Provider>
	);
}

const itemCls = (active: boolean, collapsed = false) =>
	cn(
		"flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4",
		active
			? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
			: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
		// Rail thu gọn: chỉ còn icon, căn giữa trong 64px track.
		collapsed && "lg:justify-center lg:px-0",
	);

function NavEntry({
	item,
	activeKey,
	onSelect,
	collapsed,
}: {
	item: NavItem;
	activeKey: string;
	onSelect?: (key: string) => void;
	collapsed: boolean;
}) {
	const Link = useContext(ShellLinkContext);
	const { key, label, icon: Icon, href, children } = item;
	// Đang trong mục này (kể cả đang ở trang con) → highlight cha + mở nhóm.
	const inSection = activeKey === key || activeKey.startsWith(`${key}/`);
	const [open, setOpen] = useState(inSection);
	const labelCls = collapsed ? "lg:sr-only" : undefined;

	if (!children) {
		return (
			<li>
				<Link
					href={href}
					className={itemCls(inSection, collapsed)}
					aria-current={inSection ? "page" : undefined}
					onClick={() => onSelect?.(key)}
				>
					<Icon aria-hidden="true" />
					<span className={cn("truncate", labelCls)}>{label}</span>
				</Link>
			</li>
		);
	}

	const expanded = open || inSection;
	const firstChild = children[0];
	return (
		<li>
			<button
				type="button"
				onClick={() => {
					// Lần đầu chạm vào nhóm cha: mở nhóm và chọn mục con đầu tiên.
					if (!inSection) {
						if (firstChild) onSelect?.(firstChild.key);
						setOpen(true);
					} else {
						setOpen(!expanded);
					}
				}}
				aria-expanded={expanded}
				className={itemCls(false, collapsed)}
			>
				<Icon aria-hidden="true" />
				<span className={cn("truncate", labelCls)}>{label}</span>
				<ChevronDown
					aria-hidden="true"
					className={cn(
						"ml-auto transition-transform",
						!expanded && "-rotate-90",
						collapsed && "lg:hidden",
					)}
				/>
			</button>
			{expanded && (
				<ul className="mx-3.5 mt-1 flex flex-col gap-1 border-sidebar-border border-l px-2.5 py-0.5">
					{children.map((child) => (
						<li key={child.key}>
							<Link
								href={child.href}
								className={cn(
									"flex h-7 w-full items-center rounded-md px-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
									activeKey === child.key
										? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
										: "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
									collapsed && "lg:hidden",
								)}
								aria-current={activeKey === child.key ? "page" : undefined}
								onClick={() => onSelect?.(child.key)}
							>
								<span className="truncate">{child.label}</span>
							</Link>
						</li>
					))}
				</ul>
			)}
		</li>
	);
}

/** Danh sách nhóm nav có nhãn — phần thân sidebar dùng chung web + student. */
export function NavGroups({
	groups,
	activeKey,
	onSelect,
	collapsed = false,
	className,
}: {
	groups: NavGroup[];
	activeKey: string;
	onSelect?: (key: string) => void;
	collapsed?: boolean;
	className?: string;
}) {
	return (
		<div className={className}>
			{groups.map((navGroup) => (
				<div key={navGroup.group} className="py-2">
					<div
						className={cn(
							"flex h-8 items-center px-2 font-medium text-sidebar-foreground/70 text-xs",
							collapsed && "lg:hidden",
						)}
					>
						{navGroup.group}
					</div>
					<ul className="grid gap-1">
						{navGroup.items
							.filter((item) => item.enabled !== false)
							.map((item) => (
								<NavEntry
									key={item.key}
									item={item}
									activeKey={activeKey}
									onSelect={onSelect}
									collapsed={collapsed}
								/>
							))}
					</ul>
				</div>
			))}
		</div>
	);
}
