import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { StudentPlacementSubmissionView } from "@teacher-os/api/placement-test-contracts";
import { Button } from "@teacher-os/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import {
	PlacementExemptCard,
	PlacementGradedResultView,
	PlacementPendingResultView,
	PlacementUnavailableCard,
} from "@/components/placement/placement-result-views";
import {
	type PendingSpeakingRetry,
	PlacementTestRunner,
} from "@/components/placement/placement-test-runner";
import {
	studentPlacementStatusQueryKey,
	studentPlacementViewQueryKey,
	uploadStudentPlacementSpeaking,
	useStudentPlacementView,
} from "@/lib/repos/placement-test";

export const Route = createFileRoute("/_auth/placement-test")({
	component: StudentPlacementTestRoute,
});

function StudentPlacementTestRoute() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => <StudentPlacementTestContent studentId={me.student.id} />}
		</StudentPageGate>
	);
}

export function StudentPlacementTestContent({
	studentId,
}: {
	studentId: string;
}) {
	const queryClient = useQueryClient();
	const viewQuery = useStudentPlacementView();
	const [startedFromExempt, setStartedFromExempt] = useState(false);
	const [justSubmitted, setJustSubmitted] =
		useState<StudentPlacementSubmissionView | null>(null);
	const [pendingRetry, setPendingRetry] = useState<PendingSpeakingRetry | null>(
		null,
	);
	const [isRetryingUpload, setIsRetryingUpload] = useState(false);

	if (viewQuery.isLoading) {
		return <Loader />;
	}

	if (viewQuery.error || !viewQuery.data) {
		return (
			<Card className="mx-auto max-w-2xl">
				<CardHeader>
					<CardTitle>Không tải được bài kiểm tra đầu vào</CardTitle>
					<CardDescription>
						Có lỗi kết nối hoặc máy chủ tạm thời chưa phản hồi. Vui lòng thử
						lại.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-3">
					<Button type="button" onClick={() => void viewQuery.refetch()}>
						<RefreshCw aria-hidden="true" className="size-4" />
						<span>Thử lại</span>
					</Button>
					<Link
						to="/"
						className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs transition-colors hover:bg-accent"
					>
						<ArrowLeft aria-hidden="true" className="size-4" />
						<span>Về trang chủ</span>
					</Link>
				</CardContent>
			</Card>
		);
	}

	const view = viewQuery.data;

	const handleRetrySpeakingUpload = async () => {
		if (!pendingRetry || isRetryingUpload) return;
		setIsRetryingUpload(true);
		try {
			await uploadStudentPlacementSpeaking(
				pendingRetry.submissionId,
				pendingRetry.uploadToken,
				pendingRetry.blob,
				pendingRetry.mimeType,
				pendingRetry.durationSec,
			);
			setPendingRetry(null);
			setJustSubmitted((prev) =>
				prev ? { ...prev, speakingStatus: "uploaded" } : prev,
			);
			void queryClient.invalidateQueries({
				queryKey: studentPlacementStatusQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: studentPlacementViewQueryKey,
			});
			void queryClient.invalidateQueries({ queryKey: ["student", "inbox"] });
		} catch (err) {
			const msg =
				err instanceof Error && err.message
					? err.message
					: "Thử tải lại chưa thành công. Vui lòng thử lại sau.";
			setPendingRetry((prev) => (prev ? { ...prev, errorMessage: msg } : prev));
		} finally {
			setIsRetryingUpload(false);
		}
	};

	// Vừa nộp bài trong phiên hiện tại → chuyển ngay sang màn chờ chấm
	if (justSubmitted && view.status !== "graded") {
		const activeSubmission =
			view.status === "pending_grading" && view.submission
				? view.submission
				: justSubmitted;
		return (
			<PlacementPendingResultView
				submission={activeSubmission}
				bands={view.snapshot?.bands}
				canRetrySpeakingUpload={Boolean(pendingRetry)}
				isRetryingSpeakingUpload={isRetryingUpload}
				speakingUploadError={pendingRetry?.errorMessage}
				onRetrySpeakingUpload={() => void handleRetrySpeakingUpload()}
			/>
		);
	}

	if (view.status === "unavailable") {
		return <PlacementUnavailableCard />;
	}

	if (view.status === "pending_grading") {
		if (!view.submission) {
			return <PlacementUnavailableCard />;
		}
		return (
			<PlacementPendingResultView
				submission={view.submission}
				bands={view.snapshot?.bands}
				canRetrySpeakingUpload={Boolean(pendingRetry)}
				isRetryingSpeakingUpload={isRetryingUpload}
				speakingUploadError={pendingRetry?.errorMessage}
				onRetrySpeakingUpload={() => void handleRetrySpeakingUpload()}
			/>
		);
	}

	if (view.status === "graded") {
		if (!view.submission) {
			return <PlacementUnavailableCard />;
		}
		return <PlacementGradedResultView submission={view.submission} />;
	}

	if (view.status === "exempt" && !startedFromExempt) {
		return (
			<PlacementExemptCard
				entryScore={view.entryScore}
				testAvailable={Boolean(view.testAvailable && view.snapshot)}
				onStartTest={() => setStartedFromExempt(true)}
			/>
		);
	}

	if (!view.testAvailable || !view.snapshot) {
		return <PlacementUnavailableCard />;
	}

	return (
		<PlacementTestRunner
			studentId={studentId}
			snapshot={view.snapshot}
			onSubmitted={(submission, retryInfo) => {
				setJustSubmitted(submission);
				setPendingRetry(retryInfo);
			}}
		/>
	);
}
