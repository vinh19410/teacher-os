import { createFileRoute, Link } from "@tanstack/react-router";
import { TestBuilderShell } from "@/components/assignment-tests/test-builder-shell";
import { PageHead } from "@/components/ui/page-head";

export const Route = createFileRoute("/_auth/assignments/tests/new")({
	component: NewAssignmentTestRoute,
});

function NewAssignmentTestRoute() {
	return (
		<div>
			<nav
				aria-label="Breadcrumb"
				className="mb-3 flex items-center gap-2 font-mono text-[12px] text-meta"
			>
				<Link
					to="/assignments"
					className="underline-offset-[3px] transition-colors hover:text-hot hover:underline"
				>
					Bài tập
				</Link>
				<span aria-hidden="true">›</span>
				<span>Full test mới</span>
			</nav>
			<PageHead
				title="Soạn bộ đề full test"
				lead="Ghép các part IELTS thành một bộ đề trọn vẹn — chọn part từ ngân hàng hoặc soạn mới ngay trong slot. Số câu chạy liên tục theo số câu thật của từng part."
			/>
			<TestBuilderShell mode="create" />
		</div>
	);
}
