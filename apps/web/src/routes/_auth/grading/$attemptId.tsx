import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type {
	EssayAnnotation,
	TeacherSubmission,
} from "@teacher-os/api/contracts";
import { useState } from "react";
import { fmtDue, fmtWhen } from "@/components/assignments/assignment-status";
import { GradeForm } from "@/components/grading/grade-form";
import { SubmissionView } from "@/components/grading/submission-view";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	createAnnotation,
	deleteAnnotation,
	gradingQueryKey,
	gradingQueueQueryKey,
	saveGrade,
	submissionQueryOptions,
	updateAnnotation,
} from "@/lib/repos/grading";
import { kernelQueryKey } from "@/lib/repos/kernel";

export const Route = createFileRoute("/_auth/grading/$attemptId")({
	component: GradingRoute,
});

/** 409 ở route annotation chỉ có thể là OVERLAP (NOT_SUBMITTED không xảy ra
 * vì trang chỉ mở bài đã nộp) — đọc trạng thái từ `status`, không cần body.
 * 400 thực tế chỉ là TOO_MANY_ANNOTATIONS: client luôn gửi đoạn đã snap theo
 * từ nên INVALID_SPAN không xảy ra từ UI này. */
function annotationErrorMessage(status: number, fallback: string): string {
	if (status === 409) return "Đoạn này trùng với highlight khác.";
	if (status === 400) return "Đã đạt tối đa 200 highlight.";
	if (status === 404) return "Highlight không còn tồn tại — tải lại trang.";
	return fallback;
}

/** 401 ở bất kỳ mutation nào → session hết hạn — quay về đăng nhập. */
function on401Reauth(loadError: Error | null): void {
	if (isHttpError(loadError) && loadError.status === 401) {
		reauth();
	}
}

export function GradingRoute() {
	const { attemptId } = Route.useParams();
	const { data, error, isPending } = useQuery(
		submissionQueryOptions(attemptId),
	);
	const queryClient = useQueryClient();
	const [savedAt, setSavedAt] = useState<string | null>(null);
	/** Band tổng sống — GradeForm tính từ 4 slider rồi đẩy lên để PageHead
	 * render con số lớn (design `Grading`). */
	const [overall, setOverall] = useState("—");

	/** Cập nhật mảng annotations trong cache submission — dùng chung cho
	 * create/update/delete, cache cũ (chưa có key) giữ nguyên. */
	const setAnnotations = (
		update: (list: EssayAnnotation[]) => EssayAnnotation[],
	) => {
		queryClient.setQueryData(
			gradingQueryKey(attemptId),
			(old: TeacherSubmission | undefined) =>
				old ? { ...old, annotations: update(old.annotations ?? []) } : old,
		);
	};

	const mutation = useMutation({
		mutationFn: (input: Parameters<typeof saveGrade>[1]) =>
			saveGrade(attemptId, input),
		onSuccess(grade) {
			queryClient.setQueryData(gradingQueryKey(attemptId), (old) =>
				old ? { ...old, grade } : old,
			);
			// Tab Bài tập (kernel snapshot) phải thấy tag "Đã chấm · Band X" mới.
			void queryClient.invalidateQueries({
				queryKey: kernelQueryKey,
				exact: true,
			});
			// Hàng chờ chấm (/grading) cũng phải thấy trạng thái "Đã chấm · Band X" mới (#383).
			void queryClient.invalidateQueries({
				queryKey: gradingQueueQueryKey,
			});
			setSavedAt(grade.gradedAt);
		},
		onError: on401Reauth,
	});

	const createMutation = useMutation({
		mutationFn: (input: Parameters<typeof createAnnotation>[1]) =>
			createAnnotation(attemptId, input),
		onSuccess(created) {
			setAnnotations((list) =>
				[...list, created].sort((a, b) => a.start - b.start),
			);
		},
		onError: on401Reauth,
	});
	const updateMutation = useMutation({
		mutationFn: (input: { id: string; note: string }) =>
			updateAnnotation(attemptId, input.id, { note: input.note }),
		onSuccess(updated) {
			setAnnotations((list) =>
				list.map((a) => (a.id === updated.id ? updated : a)),
			);
		},
		onError: on401Reauth,
	});
	const deleteMutation = useMutation({
		mutationFn: (annotationId: string) =>
			deleteAnnotation(attemptId, annotationId),
		onSuccess(_result, annotationId) {
			setAnnotations((list) => list.filter((a) => a.id !== annotationId));
		},
		onError: on401Reauth,
	});

	if (isPending) {
		return (
			<Card variant="white" className="mt-10">
				Đang tải bài nộp…
			</Card>
		);
	}

	if (error || !data) {
		const status = isHttpError(error) ? error.status : 0;
		const message =
			status === 404
				? "Không tìm thấy bài nộp này."
				: status === 409
					? "Học viên chưa nộp bài này."
					: status === 400
						? "Đề này được chấm tự động, không cần chấm tay."
						: "Không tải được bài nộp. Thử tải lại trang.";
		return (
			<Card variant="white" className="mx-auto mt-10 max-w-md text-center">
				<p className="text-foreground text-sm">{message}</p>
				<Link
					to="/classes"
					className="mt-4 inline-block text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					← Về danh sách lớp
				</Link>
			</Card>
		);
	}

	const saveError =
		mutation.error instanceof Error ? mutation.error.message : null;
	const friendlySaveError =
		isHttpError(mutation.error) && mutation.error.status === 409
			? "Bài chưa ở trạng thái đã nộp — tải lại trang."
			: saveError;

	/** Map lỗi annotation thành message thân thiện rồi ném lại — component
	 * highlight hiển thị ngay tại vị trí thao tác (popover/hàng sửa/xác nhận
	 * xoá). 409 ở route này chỉ có thể là OVERLAP (NOT_SUBMITTED không xảy ra
	 * vì trang chỉ mở bài đã nộp). */
	async function withFriendlyError(
		action: Promise<unknown>,
		fallback = "Không lưu được highlight. Thử lại.",
	) {
		try {
			await action;
		} catch (loadError) {
			throw new Error(
				isHttpError(loadError)
					? annotationErrorMessage(loadError.status, fallback)
					: fallback,
			);
		}
	}

	return (
		<div className="flex flex-col">
			{data.practice || !data.classId ? (
				<Link
					to="/grading"
					search={data.practice ? { mode: "practice" } : undefined}
					className="self-start text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					← Về hàng chờ chấm
				</Link>
			) : (
				<Link
					to="/classes/$classId"
					params={{ classId: data.classId }}
					search={{ tab: "assignments" }}
					className="self-start text-muted-foreground text-sm transition-colors hover:text-foreground"
				>
					← Về lớp
				</Link>
			)}
			<PageHead
				kicker={
					<>
						{data.student.name} · {data.className} · Nộp{" "}
						{fmtWhen(data.submittedAt)}
						{data.due ? <> · Hạn {fmtDue(data.due)}</> : null}
					</>
				}
				title={data.title}
				action={
					<div className="text-right">
						<div className="mb-1 text-muted-foreground text-sm">Band tổng</div>
						<div
							data-testid="grade-overall-band"
							aria-live="polite"
							className="font-semibold text-5xl tabular-nums leading-none tracking-tight md:text-6xl"
						>
							{overall}
						</div>
					</div>
				}
			/>

			<div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
				<Card className="p-6">
					<SubmissionView
						submission={data}
						annotation={
							data.skill === "writing"
								? {
										pending:
											createMutation.isPending ||
											updateMutation.isPending ||
											deleteMutation.isPending,
										onCreate: (input) =>
											withFriendlyError(createMutation.mutateAsync(input)),
										onUpdate: (id, note) =>
											withFriendlyError(
												updateMutation.mutateAsync({ id, note }),
											),
										onDelete: (id) =>
											withFriendlyError(
												deleteMutation.mutateAsync(id),
												"Không xoá được highlight. Thử lại.",
											),
									}
								: undefined
						}
					/>
				</Card>
				<Card className="self-start p-6">
					<GradeForm
						key={data.grade?.gradedAt ?? "new"}
						skill={data.skill}
						part={data.part}
						initial={data.grade}
						saving={mutation.isPending}
						error={mutation.error ? friendlySaveError : null}
						savedAt={savedAt}
						onOverallChange={setOverall}
						onSave={(input) => mutation.mutate(input)}
					/>
				</Card>
			</div>
		</div>
	);
}
