import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { LibraryTestCreate } from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { Card } from "@teacher-os/ui/components/web-kit/card";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { libraryErrorMessage } from "@/components/library/library-error";
import {
	buildCreatePayload,
	emptyTestHeader,
	TestHeaderForm,
	type TestHeaderFormValue,
} from "@/components/library/test-header-form";
import {
	createLibraryTest,
	libraryTestsQueryOptions,
} from "@/lib/repos/library";

/**
 * Trang tạo bộ đề mới (phase 6): form header → POST → điều hướng sang
 * trang edit để soạn part. `skill` chọn được ở đây và immutable sau tạo.
 */

export const Route = createFileRoute("/_auth/library/tests/new")({
	component: NewTestRoute,
});

function NewTestRoute() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [value, setValue] = useState<TestHeaderFormValue>(emptyTestHeader);
	const [showErrors, setShowErrors] = useState(false);

	// Gợi ý collection/group từ các đề đã có (distinct) — không tạo query
	// mới: tái dùng cache list của trang danh sách.
	const listQuery = useQuery(libraryTestsQueryOptions());
	const { collections, groups } = useMemo(() => {
		const collectionSet = new Set<string>();
		const groupSet = new Set<string>();
		for (const item of listQuery.data ?? []) {
			if (item.collection) collectionSet.add(item.collection);
			if (item.testGroup) groupSet.add(item.testGroup);
		}
		return {
			collections: [...collectionSet].sort(),
			groups: [...groupSet].sort(),
		};
	}, [listQuery.data]);

	const createMutation = useMutation({
		mutationFn: (payload: LibraryTestCreate) => createLibraryTest(payload),
		onSuccess: async (created) => {
			toast.success("Đã tạo bộ đề — bắt đầu soạn nội dung.");
			await queryClient.invalidateQueries({
				queryKey: ["admin", "library", "tests"],
			});
			void navigate({
				to: "/library/tests/$testId",
				params: { testId: created.id },
			});
		},
		onError: (error) => {
			toast.error(libraryErrorMessage(error));
		},
	});

	const handleSubmit = () => {
		const built = buildCreatePayload(value);
		if (!built.ok) {
			setShowErrors(true);
			toast.error("Vui lòng kiểm tra lại các trường có lỗi.");
			return;
		}
		createMutation.mutate(built.payload);
	};

	return (
		<section
			aria-label="Tạo bộ đề mới"
			className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6"
		>
			<div>
				<Link
					to="/library/tests"
					className="text-muted-foreground text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					← Thư viện đề
				</Link>
				<h1 className="mt-2 font-semibold text-xl">Tạo bộ đề mới</h1>
			</div>
			<Card className="p-5">
				<TestHeaderForm
					value={value}
					showErrors={showErrors}
					collections={collections}
					groups={groups}
					idPrefix="new"
					onChange={(patch) =>
						setValue((previous) => ({ ...previous, ...patch }))
					}
				/>
				<div className="mt-5 flex justify-end gap-2">
					<Link
						to="/library/tests"
						className={buttonVariants({ variant: "outline" })}
					>
						Hủy
					</Link>
					<button
						type="button"
						className={buttonVariants()}
						disabled={createMutation.isPending}
						onClick={handleSubmit}
					>
						{createMutation.isPending ? "Đang tạo…" : "Tạo bộ đề"}
					</button>
				</div>
			</Card>
		</section>
	);
}
