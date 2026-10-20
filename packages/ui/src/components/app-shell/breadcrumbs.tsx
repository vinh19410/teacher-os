import { cn } from "@teacher-os/ui/lib/utils";
import { ChevronRight } from "lucide-react";

/**
 * Breadcrumb đầu header (design Shell): "tổ chức › mục › chi tiết", ẩn dưới
 * sm. Crumb cuối là vị trí hiện tại (chữ đậm màu foreground).
 */
export function Breadcrumbs({
	crumbs,
	className,
}: {
	crumbs: string[];
	className?: string;
}) {
	if (crumbs.length === 0) return null;
	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"hidden min-w-0 items-center gap-1.5 text-muted-foreground text-sm sm:flex",
				className,
			)}
		>
			{crumbs.map((crumb, index) => (
				<span
					key={`${crumb}-${index}`}
					className="flex min-w-0 items-center gap-1.5"
				>
					{index > 0 && (
						<ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
					)}
					<span
						className={cn(
							"truncate",
							index === crumbs.length - 1 && "text-foreground",
						)}
					>
						{crumb}
					</span>
				</span>
			))}
		</nav>
	);
}
