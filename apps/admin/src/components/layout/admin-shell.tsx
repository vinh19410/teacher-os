import { Link, Outlet, useRouteContext } from "@tanstack/react-router";
import { BookOpenText, LogOut } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const NAV_ITEMS = [
	{
		to: "/library/tests",
		label: "Thư viện đề",
		icon: BookOpenText,
	},
] as const;

/** Shell admin (DESIGN.md: token packages/ui globals.css, Be Vietnam Pro, light):
 * sidebar một mục "Thư viện đề", header tên admin + nút đăng xuất. */
export function AdminShell() {
	const { admin } = useRouteContext({ from: "/_auth" });

	const handleSignOut = async () => {
		const { error } = await authClient.signOut();
		if (error) {
			toast.error("Không đăng xuất được. Vui lòng thử lại.");
			return;
		}
		window.location.assign("/login");
	};

	return (
		<div className="flex min-h-svh flex-col md:flex-row">
			<aside
				aria-label="Điều hướng quản trị"
				className="flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-sidebar-border border-b bg-sidebar px-3 py-2 text-sidebar-foreground md:w-64 md:flex-col md:flex-nowrap md:items-stretch md:justify-start md:gap-1 md:border-r md:border-b-0 md:p-3"
			>
				<div className="flex min-w-0 flex-1 basis-60 items-center gap-2.5 px-2 py-1.5 font-medium md:w-full md:flex-none md:basis-auto md:py-2.5">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<BookOpenText aria-hidden="true" className="size-4" />
					</span>
					<span
						className="min-w-0 flex-1 text-sm leading-tight"
						title="Cô Mỹ Dạy Tiếng Anh · Quản trị"
					>
						Cô Mỹ Dạy Tiếng Anh · Quản trị
					</span>
				</div>
				<nav className="flex shrink-0 flex-row gap-1 md:grid md:w-full">
					{NAV_ITEMS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeProps={{ "data-active": true }}
							className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active]:bg-sidebar-accent data-[active]:font-medium data-[active]:text-sidebar-accent-foreground"
						>
							<item.icon aria-hidden="true" className="size-4 shrink-0" />
							{item.label}
						</Link>
					))}
				</nav>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 items-center justify-between gap-3 border-b px-4 md:px-6">
					<div className="min-w-0 truncate font-medium text-sm">
						{admin?.name || admin?.email}
					</div>
					<button
						type="button"
						onClick={() => void handleSignOut()}
						className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-3 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
					>
						<LogOut aria-hidden="true" className="size-4" />
						Đăng xuất
					</button>
				</header>
				<main className="min-w-0 flex-1">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
