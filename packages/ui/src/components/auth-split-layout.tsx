import { GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./theme-toggle";

/** Quote hiển thị ở cột phải (pattern `Login` design v2). */
export interface AuthQuote {
	text: string;
	author: string;
}

interface AuthSplitLayoutProps {
	/** Nội dung cột trái: tiêu đề, tabs, form auth. */
	children: ReactNode;
	/** Nhãn thương hiệu cạnh logo-block (vd "Teacher OS"). */
	brandLabel: string;
	/** aria-label cho section cột form — mỗi route giữ nhãn riêng cho e2e. */
	formLabel: string;
	/** Quote + tác giả ở cột phải. */
	quote: AuthQuote;
	/** Minh họa (TeacherDesk/StudentSpot) — caller truyền `decorative`. */
	illustration: ReactNode;
	className?: string;
}

/**
 * Khung auth split dùng chung (design v2 `Login`): `grid min-h-svh
 * lg:grid-cols-2` — cột trái chứa logo-block + ThemeToggle và form
 * `max-w-xs grid gap-6`; cột phải `bg-muted` với blockquote + minh họa,
 * ẩn dưới `lg`.
 */
export function AuthSplitLayout({
	children,
	brandLabel,
	formLabel,
	quote,
	illustration,
	className,
}: AuthSplitLayoutProps) {
	return (
		<div className={cn("grid min-h-svh lg:grid-cols-2", className)}>
			<div className="flex flex-col gap-4 p-6 md:p-10">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 font-medium">
						<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<GraduationCap aria-hidden="true" className="size-4" />
						</span>
						{brandLabel}
					</div>
					<ThemeToggle />
				</div>
				<section
					aria-label={formLabel}
					className="flex flex-1 items-center justify-center"
				>
					<div className="grid w-full max-w-xs gap-6">{children}</div>
				</section>
			</div>
			<div className="relative hidden flex-col justify-between bg-muted p-10 lg:flex">
				<blockquote className="max-w-md space-y-2">
					<p className="text-lg">&ldquo;{quote.text}&rdquo;</p>
					<footer className="text-muted-foreground text-sm">
						{quote.author}
					</footer>
				</blockquote>
				{illustration}
			</div>
		</div>
	);
}
