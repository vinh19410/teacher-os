import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type {
	StudentPlacementSubmissionView,
	StudentPlacementViewResponse,
} from "@teacher-os/api/placement-test-contracts";
import { Button } from "@teacher-os/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StudentPageGate } from "@/components/layout/student-page-gate";
import Loader from "@/components/loader";
import {
	PlacementExemptCard,
	PlacementGradedResultView,
	PlacementPendingResultView,
	PlacementUnavailableCard,
} from "@/components/placement/placement-result-views";
import type { RecordedSpeakingAudio } from "@/components/placement/placement-speaking-step";
import {
	type PendingSpeakingRetry,
	PlacementTestRunner,
} from "@/components/placement/placement-test-runner";
import {
	deleteStudentSpeakingBackup,
	loadStudentSpeakingBackup,
	saveStudentSpeakingBackup,
} from "@/lib/placement-speaking-backup";
import { isHttpError } from "@/lib/query-client";
import {
	getStudentPlacementViewQueryKey,
	isSameStudentOrgContext,
	requestStudentPlacementSpeakingUploadToken,
	studentPlacementStatusQueryKey,
	studentPlacementViewQueryKey,
	uploadStudentPlacementSpeaking,
	useStudentPlacementView,
} from "@/lib/repos/placement-test";
import { getActiveStudentOrgId } from "@/lib/student-org-storage";

export const Route = createFileRoute("/_auth/placement-test")({
	component: StudentPlacementTestRoute,
});

const SPEAKING_UPLOAD_SUCCESS_MESSAGE =
	"Đã tải lên thành công bản ghi Speaking.";

type SpeakingUploadTarget = {
	submissionId: string;
	uploadToken: string | null;
	blob: Blob;
	mimeType: string;
	durationSec: number;
};

type SpeakingUploadOutcome = "uploaded" | "already_settled";

function isSpeakingUploadNotPendingError(err: unknown): boolean {
	return (
		isHttpError(err) &&
		err.status === 409 &&
		err.code === "SPEAKING_UPLOAD_NOT_PENDING"
	);
}

function isSpeakingUploadTokenAuthError(err: unknown): boolean {
	return (
		isHttpError(err) &&
		err.status === 401 &&
		(err.code === "UPLOAD_TOKEN_EXPIRED" ||
			err.code === "UPLOAD_TOKEN_INVALID" ||
			err.code === "UPLOAD_TOKEN_REQUIRED")
	);
}

async function uploadSpeakingWithTokenRefresh(
	target: SpeakingUploadTarget,
	onTokenRefreshed?: (token: string) => void,
	explicitOrgId?: string | null,
): Promise<SpeakingUploadOutcome> {
	const mintFreshToken = async (): Promise<string | null> => {
		try {
			const minted = await requestStudentPlacementSpeakingUploadToken(
				target.submissionId,
				explicitOrgId,
			);
			onTokenRefreshed?.(minted.uploadToken);
			return minted.uploadToken;
		} catch (err) {
			if (isSpeakingUploadNotPendingError(err)) {
				return null;
			}
			throw err;
		}
	};

	let activeToken = target.uploadToken;
	if (!activeToken) {
		activeToken = await mintFreshToken();
		if (!activeToken) {
			return "already_settled";
		}
	}

	try {
		await uploadStudentPlacementSpeaking(
			target.submissionId,
			activeToken,
			target.blob,
			target.mimeType,
			target.durationSec,
			{ orgId: explicitOrgId },
		);
		return "uploaded";
	} catch (err) {
		if (isSpeakingUploadNotPendingError(err)) {
			return "already_settled";
		}
		if (target.uploadToken && isSpeakingUploadTokenAuthError(err)) {
			const refreshedToken = await mintFreshToken();
			if (!refreshedToken) {
				return "already_settled";
			}
			try {
				await uploadStudentPlacementSpeaking(
					target.submissionId,
					refreshedToken,
					target.blob,
					target.mimeType,
					target.durationSec,
					{ orgId: explicitOrgId },
				);
				return "uploaded";
			} catch (retryErr) {
				if (isSpeakingUploadNotPendingError(retryErr)) {
					return "already_settled";
				}
				throw retryErr;
			}
		}
		throw err;
	}
}

function StudentPlacementTestRoute() {
	const { session } = Route.useRouteContext();
	const sessionEmail = session?.data?.user?.email;

	return (
		<StudentPageGate sessionEmail={sessionEmail}>
			{(me) => (
				<StudentPlacementTestContent
					key={`${me.student.orgId}:${me.student.id}`}
					studentId={me.student.id}
					orgId={me.student.orgId}
				/>
			)}
		</StudentPageGate>
	);
}

export function StudentPlacementTestContent({
	studentId,
	orgId,
}: {
	studentId: string;
	orgId?: string;
}) {
	const queryClient = useQueryClient();
	const viewQueryKey = getStudentPlacementViewQueryKey(orgId ?? studentId);
	const viewQuery = useStudentPlacementView(orgId, studentId);
	const [startedFromExempt, setStartedFromExempt] = useState(false);
	const [justSubmitted, setJustSubmitted] =
		useState<StudentPlacementSubmissionView | null>(null);
	const [pendingRetry, setPendingRetry] = useState<PendingSpeakingRetry | null>(
		null,
	);
	const [isRetryingUpload, setIsRetryingUpload] = useState(false);
	const [isAutoRecoveringSpeaking, setIsAutoRecoveringSpeaking] =
		useState(false);
	const [settledRecoveryKey, setSettledRecoveryKey] = useState<string | null>(
		null,
	);
	const [speakingUploadSuccessMessage, setSpeakingUploadSuccessMessage] =
		useState("");

	const pendingRetryRef = useRef<PendingSpeakingRetry | null>(null);
	pendingRetryRef.current = pendingRetry;
	const autoRecoveryAttemptedRef = useRef<Set<string>>(new Set());
	const isUploadingSpeakingRef = useRef(false);
	const unmountedRef = useRef(false);

	useEffect(() => {
		unmountedRef.current = false;
		return () => {
			unmountedRef.current = true;
		};
	}, []);

	const view = viewQuery.data ?? null;

	// Hợp nhất bài vừa nộp với cache: không bao giờ để dữ liệu cũ `pending_upload`
	// ghi đè trạng thái `uploaded` đã được xác nhận trong phiên hiện tại.
	const activePendingSubmission: StudentPlacementSubmissionView | null =
		(() => {
			if (!view) return justSubmitted;
			if (justSubmitted && view.status !== "graded") {
				if (view.status === "pending_grading" && view.submission) {
					if (
						justSubmitted.speakingStatus === "uploaded" &&
						view.submission.speakingStatus === "pending_upload" &&
						view.submission.id === justSubmitted.id
					) {
						return {
							...view.submission,
							speakingStatus: "uploaded",
						};
					}
					return view.submission;
				}
				return justSubmitted;
			}
			if (view.status === "pending_grading" && view.submission) {
				return view.submission;
			}
			return null;
		})();

	const finalizeSpeakingUploadSuccess = useCallback(
		async (
			submission: StudentPlacementSubmissionView,
			outcome: SpeakingUploadOutcome,
			expectedOrgId: string | null,
		) => {
			await deleteStudentSpeakingBackup(studentId, submission.id);
			if (!isSameStudentOrgContext(expectedOrgId)) {
				return;
			}

			if (!unmountedRef.current) {
				pendingRetryRef.current = null;
				setPendingRetry(null);
			}

			if (outcome === "uploaded") {
				if (!unmountedRef.current) {
					setSpeakingUploadSuccessMessage(SPEAKING_UPLOAD_SUCCESS_MESSAGE);
					setJustSubmitted({
						...submission,
						speakingStatus: "uploaded",
					});
				}
				queryClient.setQueryData<StudentPlacementViewResponse>(
					viewQueryKey,
					(prev) =>
						prev
							? {
									...prev,
									status:
										prev.status === "graded" ? "graded" : "pending_grading",
									submissionId: submission.id,
									submission: prev.submission
										? { ...prev.submission, speakingStatus: "uploaded" }
										: { ...submission, speakingStatus: "uploaded" },
									speakingTasks: null,
								}
							: prev,
				);
			}

			void queryClient.invalidateQueries({
				queryKey: studentPlacementStatusQueryKey,
			});
			void queryClient.invalidateQueries({
				queryKey: studentPlacementViewQueryKey,
			});
			void queryClient.invalidateQueries({ queryKey: ["student", "inbox"] });
		},
		[queryClient, studentId, viewQueryKey],
	);

	const autoRecoveryKey =
		activePendingSubmission &&
		activePendingSubmission.status === "pending_grading" &&
		activePendingSubmission.speakingStatus === "pending_upload"
			? `${studentId}:${activePendingSubmission.id}`
			: null;

	const awaitingInitialBackupCheck = Boolean(
		autoRecoveryKey && !pendingRetry && settledRecoveryKey !== autoRecoveryKey,
	);

	const activeSubmissionRef = useRef<StudentPlacementSubmissionView | null>(
		null,
	);
	activeSubmissionRef.current = activePendingSubmission;

	useEffect(() => {
		if (!autoRecoveryKey) return;
		if (pendingRetryRef.current) {
			autoRecoveryAttemptedRef.current.add(autoRecoveryKey);
			setSettledRecoveryKey(autoRecoveryKey);
			return;
		}
		if (autoRecoveryAttemptedRef.current.has(autoRecoveryKey)) return;
		if (isUploadingSpeakingRef.current) return;

		const submission = activeSubmissionRef.current;
		if (
			submission?.status !== "pending_grading" ||
			submission.speakingStatus !== "pending_upload"
		) {
			return;
		}

		autoRecoveryAttemptedRef.current.add(autoRecoveryKey);
		setIsAutoRecoveringSpeaking(true);
		const capturedOrgId = orgId ?? getActiveStudentOrgId();

		void (async () => {
			try {
				const backup = await loadStudentSpeakingBackup(
					studentId,
					submission.id,
				);
				if (unmountedRef.current || !isSameStudentOrgContext(capturedOrgId)) {
					return;
				}
				if (!backup) return;

				const restoredRetry: PendingSpeakingRetry = {
					submissionId: submission.id,
					uploadToken: null,
					blob: backup.blob,
					mimeType: backup.mimeType,
					durationSec: backup.durationSec,
					errorMessage: "",
				};
				pendingRetryRef.current = restoredRetry;
				setPendingRetry(restoredRetry);

				if (isUploadingSpeakingRef.current) return;
				isUploadingSpeakingRef.current = true;
				let refreshedToken: string | null = null;
				try {
					const outcome = await uploadSpeakingWithTokenRefresh(
						restoredRetry,
						(token) => {
							refreshedToken = token;
							if (
								!unmountedRef.current &&
								isSameStudentOrgContext(capturedOrgId)
							) {
								setPendingRetry((prev) =>
									prev ? { ...prev, uploadToken: token } : prev,
								);
							}
						},
						orgId,
					);
					if (!isSameStudentOrgContext(capturedOrgId)) {
						return;
					}
					await finalizeSpeakingUploadSuccess(
						submission,
						outcome,
						capturedOrgId,
					);
				} catch (err) {
					if (unmountedRef.current || !isSameStudentOrgContext(capturedOrgId)) {
						return;
					}
					const msg =
						err instanceof Error && err.message
							? err.message
							: "Tự động tải lại bản ghi Speaking chưa thành công. Vui lòng bấm thử tải lại.";
					const nextToken =
						isHttpError(err) && err.status === 401 ? null : refreshedToken;
					const failedRetry: PendingSpeakingRetry = {
						...restoredRetry,
						uploadToken: nextToken,
						errorMessage: msg,
					};
					pendingRetryRef.current = failedRetry;
					setPendingRetry(failedRetry);
				} finally {
					isUploadingSpeakingRef.current = false;
				}
			} finally {
				if (!unmountedRef.current) {
					setIsAutoRecoveringSpeaking(false);
					setSettledRecoveryKey(autoRecoveryKey);
				}
			}
		})();
	}, [autoRecoveryKey, finalizeSpeakingUploadSuccess, orgId, studentId]);

	if (viewQuery.isLoading) {
		return <Loader />;
	}

	if (viewQuery.error || !view) {
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
						className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-4 font-medium text-foreground text-sm shadow-xs outline-none transition-colors hover:bg-accent focus-visible:shadow-[var(--focus-ring)]"
					>
						<ArrowLeft aria-hidden="true" className="size-4" />
						<span>Về trang chủ</span>
					</Link>
				</CardContent>
			</Card>
		);
	}

	const recoverySpeakingTasks =
		view.speakingTasks && view.speakingTasks.length > 0
			? view.speakingTasks
			: view.snapshot?.parts[4]?.tasks &&
					view.snapshot.parts[4].tasks.length > 0
				? view.snapshot.parts[4].tasks
				: null;

	const handleRetrySpeakingUpload = async () => {
		const target = pendingRetryRef.current;
		const submission = activePendingSubmission;
		if (
			!target ||
			!submission ||
			isRetryingUpload ||
			isUploadingSpeakingRef.current
		) {
			return;
		}
		isUploadingSpeakingRef.current = true;
		setIsRetryingUpload(true);
		setSpeakingUploadSuccessMessage("");
		const capturedOrgId = orgId ?? getActiveStudentOrgId();
		let latestToken: string | null = target.uploadToken;
		try {
			const outcome = await uploadSpeakingWithTokenRefresh(
				target,
				(token) => {
					latestToken = token;
					if (!unmountedRef.current && isSameStudentOrgContext(capturedOrgId)) {
						setPendingRetry((prev) =>
							prev ? { ...prev, uploadToken: token } : prev,
						);
					}
				},
				orgId,
			);
			if (!isSameStudentOrgContext(capturedOrgId)) {
				return;
			}
			await finalizeSpeakingUploadSuccess(submission, outcome, capturedOrgId);
		} catch (err) {
			if (unmountedRef.current || !isSameStudentOrgContext(capturedOrgId)) {
				return;
			}
			const msg =
				err instanceof Error && err.message
					? err.message
					: "Thử tải lại chưa thành công. Vui lòng thử lại sau.";
			const nextToken =
				isHttpError(err) && err.status === 401 ? null : latestToken;
			setPendingRetry((prev) =>
				prev ? { ...prev, uploadToken: nextToken, errorMessage: msg } : prev,
			);
		} finally {
			isUploadingSpeakingRef.current = false;
			if (!unmountedRef.current) {
				setIsRetryingUpload(false);
			}
		}
	};

	const handleUploadRecoveredSpeaking = async (
		audio: RecordedSpeakingAudio,
	): Promise<{ ok: boolean; errorMessage?: string }> => {
		const submission = activePendingSubmission;
		if (!submission || isUploadingSpeakingRef.current) {
			return {
				ok: false,
				errorMessage: "Đang có tiến trình tải Speaking khác. Vui lòng chờ.",
			};
		}

		isUploadingSpeakingRef.current = true;
		setSpeakingUploadSuccessMessage("");
		const capturedOrgId = orgId ?? getActiveStudentOrgId();
		let refreshedToken: string | null = null;
		try {
			await saveStudentSpeakingBackup({
				studentId,
				submissionId: submission.id,
				blob: audio.blob,
				mimeType: audio.mimeType,
				durationSec: audio.durationSec,
			});

			const outcome = await uploadSpeakingWithTokenRefresh(
				{
					submissionId: submission.id,
					uploadToken: null,
					blob: audio.blob,
					mimeType: audio.mimeType,
					durationSec: audio.durationSec,
				},
				(token) => {
					refreshedToken = token;
				},
				orgId,
			);
			if (!isSameStudentOrgContext(capturedOrgId)) {
				return { ok: true };
			}
			await finalizeSpeakingUploadSuccess(submission, outcome, capturedOrgId);
			return { ok: true };
		} catch (err) {
			const msg =
				err instanceof Error && err.message
					? err.message
					: "Không thể tải lên bản ghi Speaking. Vui lòng thử lại.";
			if (!unmountedRef.current && isSameStudentOrgContext(capturedOrgId)) {
				const retryInfo: PendingSpeakingRetry = {
					submissionId: submission.id,
					uploadToken:
						isHttpError(err) && err.status === 401 ? null : refreshedToken,
					blob: audio.blob,
					mimeType: audio.mimeType,
					durationSec: audio.durationSec,
					errorMessage: msg,
				};
				pendingRetryRef.current = retryInfo;
				setPendingRetry(retryInfo);
			}
			return { ok: false, errorMessage: msg };
		} finally {
			isUploadingSpeakingRef.current = false;
		}
	};

	const effectiveIsAutoRecovering =
		isAutoRecoveringSpeaking || awaitingInitialBackupCheck;

	// Vừa nộp bài trong phiên hiện tại hoặc đang chờ chấm → hiển thị màn chờ chấm
	if (activePendingSubmission && view.status !== "graded") {
		return (
			<PlacementPendingResultView
				submission={activePendingSubmission}
				bands={view.snapshot?.bands}
				canRetrySpeakingUpload={Boolean(pendingRetry)}
				isRetryingSpeakingUpload={isRetryingUpload}
				isAutoRecoveringSpeaking={effectiveIsAutoRecovering}
				speakingUploadError={pendingRetry?.errorMessage}
				speakingUploadSuccessMessage={speakingUploadSuccessMessage}
				onRetrySpeakingUpload={() => void handleRetrySpeakingUpload()}
				recoverySpeakingTasks={recoverySpeakingTasks}
				onUploadRecoveredSpeaking={handleUploadRecoveredSpeaking}
			/>
		);
	}

	if (view.status === "unavailable") {
		return <PlacementUnavailableCard />;
	}

	if (view.status === "pending_grading") {
		return <PlacementUnavailableCard />;
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
			orgId={orgId}
			snapshot={view.snapshot}
			onSubmitted={(submission, retryInfo) => {
				pendingRetryRef.current = retryInfo;
				setJustSubmitted(submission);
				setPendingRetry(retryInfo);
				setSpeakingUploadSuccessMessage("");
			}}
		/>
	);
}
