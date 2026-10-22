import { createFileRoute } from "@tanstack/react-router";

/**
 * Placeholder Trang quản trị đề IELTS — UI CRUD thật ở phase 6 (agent khác
 * làm). Route này chỉ để shell render và build không lỗi.
 */
export const Route = createFileRoute("/_auth/library/tests")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<section aria-label="Thư viện đề" className="p-6">
			<h1 className="font-semibold text-xl">Thư viện đề</h1>
			<p className="mt-2 text-muted-foreground text-sm">
				Chức năng quản lý đề IELTS sẽ ra mắt trong bản kế tiếp.
			</p>
		</section>
	);
}
