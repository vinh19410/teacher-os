import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AI_GRADING_CONFLICT_CODE,
	AI_GRADING_E011_MESSAGE,
	type AiGradingDraftView,
	type EssayAnnotation,
	type QuizGradeInput,
	type TeacherSubmission,
} from "@teacher-os/api/contracts";
import { criterionLabel } from "@teacher-os/api/lib/ielts-band";
import { canPublishGrade } from "@teacher-os/auth/role";
import { useState } from "react";
import { fmtDue, fmtWhen } from "@/components/assignments/assignment-status";
import { AiDraftPanel } from "@/components/grading/ai-draft-panel";
import { GradeForm } from "@/components/grading/grade-form";
import { SubmissionView } from "@/components/grading/submission-view";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { SectionLabel } from "@/components/ui/section-label";
import { AI_ENABLED } from "@/lib/features";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	createAnnotation,
	deleteAnnotation,
	gradingQueryKey,
	gradingQueueQueryKey,
	retryAiGrading,
	saveDraft,
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

function isVersionConflict(error: unknown): boolean {
	return (
		isHttpError(error) &&
		error.status === 409 &&
		error.reason === AI_GRADING_CONFLICT_CODE
	);
}

export function GradingRoute() {
	const { attemptId } = Route.useParams();
	const { data, error, isPending, refetch } = useQuery({
		...submissionQueryOptions(attemptId),
		// TOS-33 D3/D5: khi draft đang `ai_processing` (sau khi bấm "Thử chấm
		// lại AI" hoặc vừa nộp), tự poll 1s/lần tới khi rời `ai_processing`.
		refetchInterval: (query) =>
			query.state.data?.aiDraft?.status === "ai_processing" ? 1_000 : false,
	});
	const queryClient = useQueryClient();
	const [savedAt, setSavedAt] = useState<string | null>(null);
	/** Band tổng sống — GradeForm tính từ 4 slider rồi đẩy lên để PageHead
	 * render con số lớn (design `Grading`). */
	const [overall, setOverall] = useState("—");
	/** TOS-33 D4: hộp thoại E-011 + vùng giữ nội dung người dùng đang sửa
	 * ("Bản bạn đang sửa") khi lưu bị chặn 409 do nhân sự khác đã cập nhật. */
	const [conflictOpen, setConflictOpen] = useState(false);
	const [preservedEdit, setPreservedEdit] = useState<QuizGradeInput | null>(
		null,
	);

	const cachedKernel = queryClient.getQueryData<{
		viewer?: { role?: string };
	}>(kernelQueryKey);
	const viewerRole = cachedKernel?.viewer?.role ?? "teacher";
	const canPublish = canPublishGrade(viewerRole);
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
			queryClient.setQueryData(
				gradingQueryKey(attemptId),
				(old: TeacherSubmission | undefined) =>
					old
						? {
								...old,
								grade,
								// Chốt trả bài → draft sang published ngay trong cache
								// (server đã ghi cùng batch).
								aiDraft: old.aiDraft
									? {
											...old.aiDraft,
											status: "published" as const,
											publishedAt: new Date().toISOString(),
										}
									: null,
							}
						: old,
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
		onError(loadError, variables) {
			on401Reauth(loadError);
			if (isVersionConflict(loadError)) {
				setPreservedEdit({
					scores: variables.scores,
					feedback: variables.feedback,
				});
				setConflictOpen(true);
			}
		},
	});

	/** "Lưu bản nháp" (TOS-30): PATCH draft với version đang thấy — server
	 * lệch version → 409 E-011 (chống lưu đè). */
	const draftMutation = useMutation({
		mutationFn: (input: {
			patch: Parameters<typeof saveDraft>[1];
			version: number;
		}) => saveDraft(attemptId, { ...input.patch, version: input.version }),
		onSuccess(view: AiGradingDraftView) {
			queryClient.setQueryData(gradingQueryKey(attemptId), (old) =>
				old ? { ...old, aiDraft: view } : old,
			);
			void queryClient.invalidateQueries({
				queryKey: gradingQueueQueryKey,
			});
			setSavedAt(new Date().toISOString());
		},
		onError(loadError, variables) {
			on401Reauth(loadError);
			if (isVersionConflict(loadError)) {
				setPreservedEdit({
					scores: variables.patch.scores,
					feedback: variables.patch.feedback,
				});
				setConflictOpen(true);
			}
		},
	});

	/** "Thử chấm lại AI" (TOS-33 D3/D5): đặt lại draft `ai_processing` và
	 * kích hoạt polling cho tới khi xong. */
	const retryMutation = useMutation({
		mutationFn: () => retryAiGrading(attemptId),
		onSuccess(view: AiGradingDraftView) {
			queryClient.setQueryData(gradingQueryKey(attemptId), (old) =>
				old ? { ...old, aiDraft: view } : old,
			);
			void queryClient.invalidateQueries({
				queryKey: gradingQueueQueryKey,
			});
		},
		onError(loadError) {
			on401Reauth(loadError);
			if (isVersionConflict(loadError)) {
				setConflictOpen(true);
			}
		},
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

	if (!data) {
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
			? isVersionConflict(mutation.error)
				? `${AI_GRADING_CONFLICT_CODE} · ${AI_GRADING_E011_MESSAGE}`
				: "Bài chưa ở trạng thái đã nộp — tải lại trang."
			: isHttpError(mutation.error) && mutation.error.status === 403
				? "Chỉ Giáo viên đứng lớp được chốt trả bài."
				: saveError;
	/** GradeForm điền điểm ĐÃ CÔNG BỐ khi có (`data.grade`) — chỉ bài chưa
	 * chốt mới điền sẵn từ nháp rà → điểm gợi ý AI (code review #478: sau
	 * publish, điền điểm AI sẽ mời giáo viên ghi đè điểm cuối). */
	const draft = data.aiDraft ?? null;
	const draftInitialGrade =
		data.grade ??
		(draft
			? {
					scores: draft.reviewedScores ?? draft.aiScores ?? {},
					feedback: draft.reviewedFeedback || draft.aiFeedback,
					band: 0,
					gradedAt: draft.publishedAt ?? "",
				}
			: null);
	/** Draft `published` là terminal — form quay về luồng chấm tay thường. */
	const draftActive = draft !== null && draft.status !== "published";
	const draftError = draftMutation.error
		? isHttpError(draftMutation.error)
			? draftMutation.error.status === 409
				? `${AI_GRADING_CONFLICT_CODE} · ${AI_GRADING_E011_MESSAGE}`
				: "Bài không có bản nháp AI để lưu."
			: (draftMutation.error.message ?? null)
		: null;

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
				<div className="flex flex-col gap-6">
					{AI_ENABLED && draft !== null && (
						<AiDraftPanel
							draft={draft}
							skill={data.skill}
							part={data.part}
							canRetry={canPublish}
							retrying={retryMutation.isPending}
							onRetry={() => retryMutation.mutate()}
						/>
					)}
					{preservedEdit !== null && (
						<Card
							data-testid="conflict-preserved-draft"
							className="flex flex-col gap-3 border-warn/40 bg-warn/5 p-4 text-sm"
						>
							<div className="flex items-center justify-between gap-2">
								<SectionLabel>Bản bạn đang sửa</SectionLabel>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setPreservedEdit(null)}
								>
									Ẩn
								</Button>
							</div>
							<p className="text-muted-foreground text-xs">
								Nội dung bạn vừa chỉnh được giữ lại để đối chiếu hoặc chép sang
								bản mới nhất:
							</p>
							<dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
								{Object.entries(preservedEdit.scores).map(([key, val]) => (
									<div key={key} className="flex justify-between gap-2">
										<dt className="text-muted-foreground">
											{criterionLabel(data.skill, key as never, data.part)}
										</dt>
										<dd className="font-semibold tabular-nums">
											{val.toFixed(1)}
										</dd>
									</div>
								))}
							</dl>
							{preservedEdit.feedback.length > 0 && (
								<blockquote className="border-warn/40 border-l-2 pl-3 text-foreground text-sm">
									{preservedEdit.feedback}
								</blockquote>
							)}
						</Card>
					)}
					<Card className="p-6">
						<GradeForm
							key={
								draftActive
									? `draft-${draft.version}`
									: (data.grade?.gradedAt ?? "new")
							}
							skill={data.skill}
							part={data.part}
							initial={draftInitialGrade}
							saving={mutation.isPending}
							error={mutation.error ? friendlySaveError : null}
							savedAt={savedAt}
							onOverallChange={setOverall}
							canPublish={canPublish}
							onSave={(input) =>
								mutation.mutate(
									draft !== null ? { ...input, version: draft.version } : input,
								)
							}
							draftMode={draftActive}
							savingDraft={draftMutation.isPending}
							draftError={draftMutation.error ? draftError : null}
							onSaveDraft={(input) =>
								draftMutation.mutate({
									patch: { ...input, version: draft?.version ?? 1 },
									version: draft?.version ?? 1,
								})
							}
						/>
					</Card>
				</div>
			</div>
			<Modal
				open={conflictOpen}
				onClose={() => setConflictOpen(false)}
				title="Xung đột cập nhật điểm chấm (E-selfomy-alignment-011)"
				footer={
					<Button
						type="button"
						data-testid="reload-latest-draft"
						onClick={() => {
							mutation.reset();
							draftMutation.reset();
							retryMutation.reset();
							setConflictOpen(false);
							void refetch();
						}}
					>
						Tải lại bản mới nhất
					</Button>
				}
			>
				<p data-testid="conflict-dialog-message" className="text-sm">
					<span className="font-mono font-semibold text-warn text-xs">
						{AI_GRADING_CONFLICT_CODE}
					</span>{" "}
					· {AI_GRADING_E011_MESSAGE}
				</p>
				{preservedEdit !== null && (
					<div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
						<p className="mb-1 font-medium text-foreground">
							Bản bạn đang sửa được giữ lại trên màn hình sau khi tải lại:
						</p>
						{preservedEdit.feedback.length > 0 && (
							<p className="text-muted-foreground">{preservedEdit.feedback}</p>
						)}
					</div>
				)}
			</Modal>
		</div>
	);
}
