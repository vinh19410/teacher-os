import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { fmtDue, fmtWhen } from "@/components/assignments/assignment-status";
import { GradeForm } from "@/components/grading/grade-form";
import { SubmissionView } from "@/components/grading/submission-view";
import { Card } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	gradingQueryKey,
	saveGrade,
	submissionQueryOptions,
} from "@/lib/repos/grading";
import { kernelQueryKey } from "@/lib/repos/kernel";

export const Route = createFileRoute("/_auth/grading/$attemptId")({
	component: GradingRoute,
});

function GradingRoute() {
	const { attemptId } = Route.useParams();
	const { data, error, isPending } = useQuery(
		submissionQueryOptions(attemptId),
	);
	const queryClient = useQueryClient();
	const [savedAt, setSavedAt] = useState<string | null>(null);

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
			setSavedAt(grade.gradedAt);
		},
		onError(loadError) {
			if (isHttpError(loadError) && loadError.status === 401) {
				reauth();
			}
		},
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
				<p className="text-fg text-sm">{message}</p>
				<Link
					to="/classes"
					className="mt-4 inline-block font-medium text-accent-blue text-sm hover:text-accent-active"
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
	return (
		<div className="flex flex-col gap-5">
			<Card variant="white">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="flex flex-col gap-1">
						<h1 className="font-display font-semibold text-[18px] text-fg">
							{data.title}
						</h1>
						<p className="font-mono text-meta text-xs">
							{data.student.name} · {data.className} · Nộp{" "}
							{fmtWhen(data.submittedAt)} · Hạn {fmtDue(data.due)}
						</p>
					</div>
					<Link
						to="/classes/$classId"
						params={{ classId: data.classId }}
						search={{ tab: "assignments" }}
						className="font-medium text-accent-blue text-sm hover:text-accent-active"
					>
						← Về lớp
					</Link>
				</div>
			</Card>

			<div className="grid grid-cols-[2fr_1fr] items-start gap-5 max-app:grid-cols-1">
				<Card variant="white">
					<SubmissionView submission={data} />
				</Card>
				<Card variant="white">
					<SectionLabel>Chấm điểm</SectionLabel>
					<GradeForm
						key={data.grade?.gradedAt ?? "new"}
						skill={data.skill}
						part={data.part}
						initial={data.grade}
						saving={mutation.isPending}
						error={mutation.error ? friendlySaveError : null}
						savedAt={savedAt}
						onSave={(input) => mutation.mutate(input)}
					/>
				</Card>
			</div>
		</div>
	);
}
