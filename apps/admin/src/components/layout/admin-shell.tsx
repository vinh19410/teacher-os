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

/** Shell admin (DESIGN.md: token packages/ui globals.css, Geist, light):
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
				className="flex w-full flex-row flex-wrap items-center gap-3 border-b bg-muted/40 p-3 md:w-60 md:flex-col md:flex-nowrap md:gap-1 md:border-r md:border-b-0"
			>
				<div className="flex items-center gap-2 px-2 py-3 font-medium">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
						<BookOpenText aria-hidden="true" className="size-4" />
					</span>
					Teacher OS · Quản trị
				</div>
				<nav className="flex flex-row gap-1 md:grid">
					{NAV_ITEMS.map((item) => (
						<Link
							key={item.to}
							to={item.to}
							activeProps={{ "data-active": true }}
							className="flex items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[active]:bg-accent data-[active]:font-medium data-[active]:text-accent-foreground"
						>
							<item.icon aria-hidden="true" className="size-4" />
							{item.label}
						</Link>
					))}
				</nav>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="flex h-14 items-center justify-between border-b px-6">
					<div className="font-medium text-sm">
						{admin?.name || admin?.email}
					</div>
					<button
						type="button"
						onClick={() => void handleSignOut()}
						className="inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border bg-background px-3 font-medium text-sm shadow-xs outline-none transition-all hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
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
