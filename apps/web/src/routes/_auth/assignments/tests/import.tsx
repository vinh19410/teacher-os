import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { CreditWallet, ExamImportJob } from "@teacher-os/api/contracts";
import { CREDIT_COSTS } from "@teacher-os/api/contracts";
import { useCallback, useEffect, useState } from "react";
import { CreditCostBadge } from "@/components/exam-import/credit-cost-badge";
import { ExamFileDropzone } from "@/components/exam-import/exam-file-dropzone";
import { ExtractedExamPanel } from "@/components/exam-import/extracted-exam-panel";
import { SourceDocumentViewer } from "@/components/exam-import/source-document-viewer";
import { PageHead } from "@/components/ui/page-head";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import {
	createExamImport,
	type ExamImportCreateError,
	fetchCreditWallet,
	fetchExamImportJob,
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
	return <ExamImportScreen jobId={job} />;
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

export function ExamImportScreen({ jobId }: { jobId?: string }) {
	const navigate = useNavigate();
	const [state, setState] = useState<ScreenState>({ phase: "idle" });
	const [wallet, setWallet] = useState<CreditWallet | null>(null);
	const [activeTab, setActiveTab] = useState("document");
	const isWide = useIsWide();

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

	// Mở lại job từ URL: load job + đẩy máy trạng thái sang done.
	useEffect(() => {
		if (!jobId) return;
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
		};
	}, [jobId]);

	const uploading = state.phase === "uploading";

	const handleFile = useCallback(
		async (file: File) => {
			setState({ phase: "uploading" });
			try {
				const created = await createExamImport({ file });
				setState({ phase: "done", job: created });
				// Job xong → server đã hoàn/giữ credit; refresh badge số dư.
				refreshWallet();
				// Kết quả sống trong URL — reload/back/share giữ nguyên.
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
				// 402/502 đổi số dư ví — refresh badge kể cả khi lỗi.
				refreshWallet();
			}
		},
		[navigate, refreshWallet],
	);

	const job = state.phase === "done" ? state.job : null;

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

			{state.phase === "error" && <ErrorNotice error={state.error} />}

			{!job && !uploading && (
				<ExamFileDropzone disabled={uploading} onFile={handleFile} />
			)}

			{job?.draft && (
				<div data-testid="exam-import-workspace" className="mt-6">
					{isWide ? (
						// ≥ lg: đối chiếu 2 cột — tài liệu gốc bên trái, câu hỏi bên phải.
						<div className="grid grid-cols-2 items-start gap-6">
							<SourceColumn job={job} />
							<ExtractedExamPanel draft={job.draft} />
						</div>
					) : (
						// < lg: Tabs + tab list sticky đáy màn để đổi bảng dễ.
						<>
							{activeTab === "document" ? (
								<SourceColumn job={job} />
							) : (
								<ExtractedExamPanel draft={job.draft} />
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
		case "insufficient_credits":
			message = `Không đủ Credit — số dư ví còn ${error.balance} Cr, cần ${CREDIT_COSTS.examImport} Cr.`;
			break;
		case "failed":
			message = "Bóc tách thất bại — Credit đã hoàn về ví.";
			break;
		case "invalid_file":
			message = "Tệp không hợp lệ — chỉ nhận PDF, PNG, JPG, JPEG tối đa 15 MB.";
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
