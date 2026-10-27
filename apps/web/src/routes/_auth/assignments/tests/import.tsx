import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	type CreditWallet,
	EXAM_IMPORT_ERROR_CODES,
	EXAM_IMPORT_ERROR_MESSAGES,
	type ExamImportDuplicate,
	type ExamImportFailReason,
	type ExamImportJob,
	type ExtractedExamDraft,
} from "@teacher-os/api/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCostBadge } from "@/components/exam-import/credit-cost-badge";
import { DuplicateExamBanner } from "@/components/exam-import/duplicate-exam-banner";
import { ExamFileDropzone } from "@/components/exam-import/exam-file-dropzone";
import { ExtractedExamPanel } from "@/components/exam-import/extracted-exam-panel";
import { ImportFailedPanel } from "@/components/exam-import/import-failed-panel";
import { InsufficientCreditsDialog } from "@/components/exam-import/insufficient-credits-dialog";
import { SourceDocumentViewer } from "@/components/exam-import/source-document-viewer";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { useData } from "@/lib/data-store";
import { sha256Hex } from "@/lib/file-fingerprint";
import {
	createExamImport,
	type ExamImportCreateError,
	type ExamImportPublishError,
	fetchCreditWallet,
	fetchExamImportJob,
	lookupExamImportByFingerprint,
	publishExamImport,
	retryExamImport,
	saveExamImportDraft,
} from "@/lib/repos/exam-imports";
export const Route = createFileRoute("/_auth/assignments/tests/import")({
	validateSearch: (search: Record<string, unknown>): { job?: string } => {
		const job = search.job;
		return typeof job === "string" && job.length > 0 ? { job } : {};
	},
	component: ImportExamRoute,
});

function ImportExamRoute() {
	const { job } = Route.useSearch();
	const { refresh } = useData();
	return <ExamImportScreen jobId={job} onRefreshKernel={refresh} />;
}

/**
 * Máy trạng thái màn Nhập đề AI (phase-03): idle → uploading → done/error.
 * `?job=<id>` mở lại job đã có kết quả. Text trạng thái là contract e2e —
 * KHÔNG đổi mà không chốt lại spec.
 */
type ScreenState =
	| { phase: "idle" }
	| { phase: "uploading" }
	| { phase: "done"; job: ExamImportJob }
	| { phase: "error"; error: ExamImportCreateError };

const LG_MEDIA_QUERY = "(min-width: 1024px)";

/** Hook matchMedia theo pattern annotatable-essay — jsdom mặc định desktop. */
function useIsWide(): boolean {
	const [isWide, setIsWide] = useState(
		() =>
			typeof window === "undefined" ||
			typeof window.matchMedia !== "function" ||
			window.matchMedia(LG_MEDIA_QUERY).matches,
	);
	useEffect(() => {
		if (typeof window.matchMedia !== "function") return;
		const mq = window.matchMedia(LG_MEDIA_QUERY);
		const onChange = (e: MediaQueryListEvent) => setIsWide(e.matches);
		mq.addEventListener("change", onChange);
		return () => mq.removeEventListener("change", onChange);
	}, []);
	return isWide;
}

export function ExamImportScreen({
	jobId,
	onRefreshKernel,
}: {
	jobId?: string;
	onRefreshKernel?: () => Promise<boolean>;
}) {
	const navigate = useNavigate();
	const [state, setState] = useState<ScreenState>({ phase: "idle" });
	const [wallet, setWallet] = useState<CreditWallet | null>(null);
	// TOS-25: bản ghi trùng đang hiển thị banner (từ lookup hoặc nhánh POST).
	const [duplicate, setDuplicate] = useState<ExamImportDuplicate | null>(null);
	// Cờ đang băm + lookup: khoá dropzone chống double-submit mà không bật
	// banner "Đang bóc tách" trước khi biết tệp có trùng hay không.
	const [checking, setChecking] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const [activeTab, setActiveTab] = useState("document");
	const [savingDraft, setSavingDraft] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [publishError, setPublishError] = useState<string | null>(null);
	const isWide = useIsWide();
	const [retrying, setRetrying] = useState(false);
	const refreshWallet = useCallback(() => {
		fetchCreditWallet()
			.then(setWallet)
			.catch(() => {
				// Ví load thất bại không chặn luồng chính — badge hiện "…".
			});
	}, []);

	useEffect(() => {
		refreshWallet();
	}, [refreshWallet]);

	// Mở lại job từ URL: load job + đẩy máy trạng thái sang done; quay về
	// URL không có `?job=` (Back/SPA nav) thì reset về idle để hiện dropzone.
	useEffect(() => {
		// Đổi ?job= hoặc unmount → huỷ luồng hash/lookup/upload đang bay để
		// không ghi đè state sau khi điều hướng.
		abortRef.current?.abort();
		abortRef.current = null;
		setChecking(false);
		setDuplicate(null);
		setStatusMessage(null);
		setPublishError(null);
		setSavingDraft(false);
		setPublishing(false);
		if (!jobId) {
			setState({ phase: "idle" });
			return;
		}
		let cancelled = false;
		fetchExamImportJob(jobId)
			.then((jobDto) => {
				if (!cancelled) setState({ phase: "done", job: jobDto });
			})
			.catch(() => {
				if (!cancelled) setState({ phase: "idle" });
			});
		return () => {
			cancelled = true;
			abortRef.current?.abort();
		};
	}, [jobId]);

	const uploading = state.phase === "uploading";

	// Luồng upload TOS-24 giữ nguyên — TOS-25 chỉ thêm nhánh duplicate của
	// POST (client bỏ qua lookup: tab cũ, race, lỗi mạng tạm thời). Response
	// 200 `{ duplicateOf }` → banner trùng, KHÔNG vào state `done` với job
	// rỗng (0 Credit — server chặn trước reserve).
	const submitUpload = useCallback(
		async (file: File, signal: AbortSignal) => {
			if (signal.aborted) return;
			setState({ phase: "uploading" });
			try {
				const result = await createExamImport({ file, signal });
				if (signal.aborted) return;
				if (result.kind === "duplicate") {
					setState({ phase: "idle" });
					setDuplicate(result.duplicate);
					return;
				}
				setState({ phase: "done", job: result.job });
				// Job xong → server đã hoàn/giữ credit; refresh badge số dư.
				refreshWallet();
				// Kết quả sống trong URL — reload/back/share giữ nguyên.
				void navigate({
					to: "/assignments/tests/import",
					search: { job: result.job.id },
					replace: true,
				});
			} catch (err) {
				if (signal.aborted) return;
				setState({
					phase: "error",
					error:
						typeof err === "object" && err !== null && "kind" in err
							? (err as ExamImportCreateError)
							: { kind: "unexpected", status: 0 },
				});
				// 402/502 đổi số dư ví — refresh badge kể cả khi lỗi.
				refreshWallet();
			}
		},
		[navigate, refreshWallet],
	);
	const handleRetry = useCallback(
		async (targetJobId: string) => {
			setRetrying(true);
			try {
				const created = await retryExamImport(targetJobId);
				setState({ phase: "done", job: created });
				refreshWallet();
				void navigate({
					to: "/assignments/tests/import",
					search: { job: created.id },
					replace: true,
				});
			} catch (err) {
				setState({
					phase: "error",
					error:
						typeof err === "object" && err !== null && "kind" in err
							? (err as ExamImportCreateError)
							: { kind: "unexpected", status: 0 },
				});
				refreshWallet();
			} finally {
				setRetrying(false);
			}
		},
		[navigate, refreshWallet],
	);

	// TOS-25 (plan D1): dedupe client là best-effort **fail-open** — hash lỗi
	// (crypto.subtle vắng ở non-secure context) hay lookup lỗi (mạng, server
	// restart) → upload thẳng như TOS-24, KHÔNG bao giờ chặn luồng. Lớp bảo
	// đảm 0 Credit nằm ở nhánh POST phía server.
	const handleFile = useCallback(
		async (file: File) => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			const { signal } = controller;
			setDuplicate(null);
			setStatusMessage(null);
			setPublishError(null);
			setSavingDraft(false);
			setPublishing(false);
			setState({ phase: "idle" });
			setChecking(true);
			try {
				const fingerprint = await sha256Hex(file);
				if (signal.aborted) return;
				const hit = await lookupExamImportByFingerprint(
					fingerprint,
					undefined,
					signal,
				);
				if (signal.aborted) return;
				if (hit) {
					// Trùng mã băm trong cùng org → không upload, không mất Credit.
					setChecking(false);
					setState({ phase: "idle" });
					setDuplicate(hit);
					return;
				}
			} catch {
				if (signal.aborted) return;
				// Lookup là tối ưu UX — lỗi bỏ qua, vẫn upload bình thường.
			} finally {
				if (!signal.aborted) setChecking(false);
			}
			await submitUpload(file, signal);
		},
		[submitUpload],
	);

	const job = state.phase === "done" ? state.job : null;
	const failedView: {
		jobId: string | null;
		reason: ExamImportFailReason | null;
	} | null =
		state.phase === "error" && state.error.kind === "failed"
			? { jobId: state.error.jobId, reason: state.error.reason }
			: job?.importStatus === "failed_refunded"
				? {
						jobId: job.id,
						reason:
							job.errorReason === "timeout" ||
							job.errorReason === "ai_error" ||
							job.errorReason === "empty_result"
								? job.errorReason
								: null,
					}
				: null;

	const handleSaveDraft = useCallback(
		async (draft: ExtractedExamDraft) => {
			if (!job) return;
			setSavingDraft(true);
			setStatusMessage(null);
			setPublishError(null);
			try {
				const updated = await saveExamImportDraft({ jobId: job.id, draft });
				setState({ phase: "done", job: updated });
				setStatusMessage("Đã lưu bản nháp (0 Credit).");
			} catch {
				setPublishError("Không thể lưu bản nháp. Vui lòng thử lại.");
			} finally {
				setSavingDraft(false);
			}
		},
		[job],
	);

	const handlePublish = useCallback(
		async (draft: ExtractedExamDraft, reviewConfirmed: boolean) => {
			if (!job) return;
			setPublishing(true);
			setStatusMessage(null);
			setPublishError(null);
			try {
				const result = await publishExamImport({
					jobId: job.id,
					draft,
					reviewConfirmed,
				});
				// Đồng bộ lại snapshot ['kernel'] để /assignments/tests/$id có sẵn đề mới.
				await onRefreshKernel?.();
				setStatusMessage(
					result.status === "draft"
						? "Đã lưu bộ đề nháp — cần bổ sung file nghe trước khi giao bài."
						: "Đã xuất bản vào Ngân hàng đề.",
				);
				void navigate({
					to: "/assignments/tests/$id",
					params: { id: result.testId },
				});
			} catch (err) {
				const kind =
					typeof err === "object" && err !== null && "kind" in err
						? (err as ExamImportPublishError).kind
						: "unexpected";
				setPublishError(formatPublishError(kind));
			} finally {
				setPublishing(false);
			}
		},
		[job, navigate, onRefreshKernel],
	);

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
				<span>Nhập đề AI</span>
			</nav>
			<PageHead
				title="Nhập đề thi bằng AI"
				lead="Tải lên file đề PDF hoặc ảnh — AI bóc tách thành bản nháp đề thi để bạn rà soát trước khi lưu vào ngân hàng."
				action={<CreditCostBadge wallet={wallet} />}
			/>

			{uploading && (
				<div
					className="mb-4 space-y-2"
					role="status"
					aria-live="polite"
					data-testid="exam-import-uploading"
				>
					<p className="font-medium text-sm">Đang bóc tách (tối đa 120 giây)</p>
					{/* Tiến trình bất định: giữ thanh chuyển động nhẹ 60→90%. */}
					<Progress value={80} />
				</div>
			)}

			<InsufficientCreditsDialog
				open={
					state.phase === "error" && state.error.kind === "insufficient_credits"
				}
				onClose={() => setState({ phase: "idle" })}
			/>

			{failedView && (
				<ImportFailedPanel
					reason={failedView.reason}
					retrying={retrying}
					onRetry={() => {
						if (failedView.jobId) void handleRetry(failedView.jobId);
					}}
				/>
			)}

			{duplicate && (
				<DuplicateExamBanner
					duplicate={duplicate}
					onReopen={() => {
						// Mở đúng job cũ theo URL — luồng hiển thị TOS-24 đọc
						// draft hiện tại; banner biến mất (không clone job).
						const targetJobId = duplicate.jobId;
						setDuplicate(null);
						setStatusMessage(null);
						setPublishError(null);
						setSavingDraft(false);
						setPublishing(false);
						void navigate({
							to: "/assignments/tests/import",
							search: { job: targetJobId },
						});
						// Nếu URL đã mang sẵn ?job=<targetJobId> (ví dụ lần fetch
						// trước lỗi mạng tạm thời rồi người dùng thả lại đúng tệp
						// đó), useEffect([jobId]) không chạy lại — chủ động nạp lại.
						if (jobId === targetJobId) {
							fetchExamImportJob(targetJobId)
								.then((jobDto) => {
									setState({ phase: "done", job: jobDto });
								})
								.catch(() => {
									setState({ phase: "idle" });
								});
						}
					}}
				/>
			)}

			{state.phase === "error" &&
				state.error.kind !== "insufficient_credits" &&
				state.error.kind !== "failed" && <ErrorNotice error={state.error} />}

			{/* Dropzone: màn trống HOẶC job `?job=` có draft không đọc được
				(row hỏng/failed_refunded) — không dead-end màn trắng, notice ở
				trên + vẫn nhập đề mới được (red-team #9). */}
			{(!job || job.draft === null) && !uploading && (
				<ExamFileDropzone
					disabled={uploading || checking || retrying}
					onFile={handleFile}
				/>
			)}

			{job && !job.draft && job.importStatus !== "failed_refunded" && (
				<div
					role="alert"
					data-testid="exam-import-broken-draft"
					className="mb-4 rounded-lg border border-warn bg-warn/10 p-4 text-sm"
				>
					Bản nháp hỏng hoặc không đọc được — hãy nhập đề mới.
				</div>
			)}

			{job?.draft && (
				<div data-testid="exam-import-workspace" className="mt-6">
					{isWide ? (
						// ≥ lg: đối chiếu 2 cột — tài liệu gốc bên trái, câu hỏi bên phải.
						<div className="grid grid-cols-2 items-start gap-6">
							<SourceColumn job={job} />
							<ExtractedExamPanel
								draft={job.draft}
								savingDraft={savingDraft}
								publishing={publishing}
								statusMessage={statusMessage}
								errorMessage={publishError}
								onSaveDraft={handleSaveDraft}
								onPublish={handlePublish}
							/>
						</div>
					) : (
						// < lg: Tabs + tab list sticky đáy màn để đổi bảng dễ.
						<>
							{activeTab === "document" ? (
								<SourceColumn job={job} />
							) : (
								<ExtractedExamPanel
									draft={job.draft}
									savingDraft={savingDraft}
									publishing={publishing}
									statusMessage={statusMessage}
									errorMessage={publishError}
									onSaveDraft={handleSaveDraft}
									onPublish={handlePublish}
								/>
							)}
							<div className="sticky bottom-0 -mx-4 border-border border-t bg-background px-4 pt-2 pb-3">
								<Tabs
									tabs={[
										{ id: "document", label: "Tài liệu gốc" },
										{ id: "questions", label: "Câu hỏi bóc tách" },
									]}
									active={activeTab}
									onChange={setActiveTab}
									className="mb-0"
								/>
							</div>
						</>
					)}
				</div>
			)}
		</div>
	);
}

/** Cột trái workspace: viewer tài liệu gốc của job. */
function SourceColumn({ job }: { job: ExamImportJob }) {
	return (
		<div data-testid="source-document-viewer">
			<SourceDocumentViewer jobId={job.id} mimeType={job.mimeType} />
		</div>
	);
}

/** Thông báo lỗi theo status của POST — text là contract e2e. */
function ErrorNotice({ error }: { error: ExamImportCreateError }) {
	let message: string;
	switch (error.kind) {
		case "job_not_found":
			message = "Bản nháp không tồn tại hoặc đã bị xoá — hãy nhập đề mới.";
			break;
		case "file_missing":
			message =
				"Tệp đề gốc không còn trên kho lưu trữ — vui lòng tải lên lại tệp.";
			break;
		case "not_retryable":
			message = "Lượt nhập đề này đã hoàn tất, không thể thử lại.";
			break;
		case "invalid_file":
			message =
				EXAM_IMPORT_ERROR_MESSAGES[EXAM_IMPORT_ERROR_CODES.INVALID_FILE];
			break;
		case "disabled":
			message = "Tính năng chưa cấu hình — liên hệ quản trị để bật Nhập đề AI.";
			break;
		default:
			message = "Có lỗi xảy ra khi nhập đề. Vui lòng thử lại.";
	}
	return (
		<div
			role="alert"
			className="mb-4 rounded-lg border border-warn bg-warn/10 p-4 text-sm"
		>
			{message}
		</div>
	);
}

function formatPublishError(kind: ExamImportPublishError["kind"]): string {
	switch (kind) {
		case "review_confirmation_required":
			return "Vui lòng tích xác nhận các câu gắn nhãn Cần rà soát lại trước khi lưu vào Ngân hàng đề.";
		case "too_many_parts":
			return "Số lượng part vượt quá giới hạn của kỹ năng đã chọn. Vui lòng gộp hoặc bớt part.";
		case "skill_mixed_not_allowed":
			return "Vui lòng chọn kỹ năng cụ thể (Reading, Listening, Writing hoặc Speaking) trước khi lưu vào Ngân hàng đề.";
		case "invalid_draft":
			return "Một số câu hỏi chưa có nội dung hoặc đáp án hợp lệ. Vui lòng kiểm tra lại.";
		default:
			return "Không thể lưu vào Ngân hàng đề. Vui lòng thử lại.";
	}
}
