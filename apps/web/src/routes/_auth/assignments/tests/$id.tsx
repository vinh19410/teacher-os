import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { TestBuilderShell } from "@/components/assignment-tests/test-builder-shell";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { useData } from "@/lib/data-store";

export const Route = createFileRoute("/_auth/assignments/tests/$id")({
	component: EditAssignmentTestRoute,
	notFoundComponent: () => (
		<Card variant="white" className="mx-auto mt-16 max-w-md text-center">
			<p className="mb-2 text-sm">Không tìm thấy bộ đề.</p>
			<Link
				to="/assignments"
				className="text-muted-foreground text-xs transition-colors hover:text-primary"
			>
				Về trang Bài tập
			</Link>
		</Card>
	),
});

function EditAssignmentTestRoute() {
	const { id } = Route.useParams();
	const { data } = useData();
	const test = data.assignmentTests.find((row) => row.id === id);
	if (!test) throw notFound();
	return (
		<div>
			<nav
				aria-label="Breadcrumb"
				className="mb-3 flex items-center gap-2 text-muted-foreground text-xs"
			>
				<Link
					to="/assignments"
					className="underline-offset-[3px] transition-colors hover:text-primary hover:underline"
				>
					Bài tập
				</Link>
				<span aria-hidden="true">›</span>
				<span>{test.title}</span>
			</nav>
			<PageHead
				title={test.title}
				lead="Chỉnh sửa thông tin bộ đề và các part đã gán. Kỹ năng cố định theo parts đã có; thay đổi part lưu ngay vào bộ đề."
			/>
			<TestBuilderShell mode="edit" test={test} />
		</div>
	);
}
