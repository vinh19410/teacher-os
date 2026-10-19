import { Link } from "@tanstack/react-router";

export interface StudentNavItem {
	to: "/" | "/classes" | "/assignments" | "/vocab" | "/tuition";
	label: string;
	exact: boolean;
	testId: string;
}

export const STUDENT_NAV_ITEMS: readonly StudentNavItem[] = [
	{
		to: "/",
		label: "Tổng quan",
		exact: true,
		testId: "student-nav-overview",
	},
	{
		to: "/classes",
		label: "Lớp học",
		exact: false,
		testId: "student-nav-classes",
	},
	{
		to: "/assignments",
		label: "Bài tập",
		exact: false,
		testId: "student-nav-assignments",
	},
	{
		to: "/vocab",
		label: "Từ vựng",
		exact: false,
		testId: "student-nav-vocab",
	},
	{
		to: "/tuition",
		label: "Học phí",
		exact: false,
		testId: "student-nav-tuition",
	},
];

export function StudentNav({ className }: { className?: string }) {
	return (
		<nav
			aria-label="Điều hướng học viên"
			data-testid="student-nav"
			className={className}
		>
			{STUDENT_NAV_ITEMS.map((item) => (
				<Link
					key={item.to}
					to={item.to}
					activeOptions={{ exact: item.exact }}
					data-testid={item.testId}
					className="group aria-[current=page]:neu-in inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 font-medium text-[13px] text-fg-2 transition-colors duration-150 hover:text-hot focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-[current=page]:text-hot sm:px-3"
				>
					<span
						aria-hidden="true"
						className="hidden text-[8px] text-hot leading-none group-aria-[current=page]:inline"
					>
						■
					</span>
					<span>{item.label}</span>
				</Link>
			))}
		</nav>
	);
}
