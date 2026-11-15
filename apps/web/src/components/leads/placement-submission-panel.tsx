import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	buildPlacementZaloText,
	computePlacementFinal,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_TEACHER_FEEDBACK_MAX,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementSpeakingRubric,
	type PlacementSubmissionDetail,
	type PlacementWritingRubric,
} from "@teacher-os/api/placement-test-contracts";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusTag } from "@/components/assignments/status-tag";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	gradeLeadPlacementSubmission,
	leadPlacementSubmissionQueryKey,
	leadPlacementSubmissionQueryOptions,
	leadsAllQueryKey,
	resolvePlacementSubmissionMediaUrl,
} from "@/lib/repos/leads";

const SCORE_LEVELS = [0, 1, 2, 3, 4, 5] as const;

const SECTION_LABELS = {
	listening: "Listening",
	"vocab-grammar": "G&V",
	reading: "Reading",
} as const;

const DEFAULT_WRITING: PlacementWritingRubric = { ct: 3, or: 3, lg: 3 };
const DEFAULT_SPEAKING: PlacementSpeakingRubric = {
	gv: 3,
	dm: 3,
	pr: 3,
	ic: 3,
};

function formatExpectedAnswer(expected: number | string[]): string {
	if (typeof expected === "number") {
		return ["A", "B", "C", "D"][expected] ?? String(expected);
	}
	return expected.join(" / ");
}

function formatStudentAnswer(
	studentAnswer: number | string | null,
	type: "mcq" | "gap",
): string {
	if (studentAnswer === null || studentAnswer === "") return "(bỏ trống)";
	if (type === "mcq" && typeof studentAnswer === "number") {
		return ["A", "B", "C", "D"][studentAnswer] ?? String(studentAnswer);
	}
	return String(studentAnswer);
}

function RubricRow({
	label,
	desc,
	value,
	onChange,
	testIdPrefix,
}: {
	label: string;
	desc: string;
	value: number;
	onChange: (next: number) => void;
	testIdPrefix: string;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
			<div className="min-w-[180px] flex-1">
				<div className="font-medium text-foreground text-xs">{label}</div>
				<div className="text-muted-foreground text-xs">{desc}</div>
			</div>
			<fieldset
				className="flex items-center gap-1 border-0 p-0"
				aria-label={label}
			>
				{SCORE_LEVELS.map((n) => (
					<button
						key={n}
						type="button"
						data-testid={`${testIdPrefix}-${n}`}
						aria-pressed={value === n}
						onClick={() => onChange(n)}
						className={`h-7 min-w-7 rounded border px-2 font-mono text-xs transition-colors ${
							value === n
								? "border-primary bg-primary text-primary-foreground"
								: "border-border bg-background text-foreground hover:bg-muted"
						}`}
					>
						{n}
					</button>
				))}
			</fieldset>
		</div>
	);
}

export function PlacementSubmissionPanel({ leadId }: { leadId: string }) {
	const queryClient = useQueryClient();
	const query = useQuery(leadPlacementSubmissionQueryOptions(leadId));

	useEffect(() => {
		if (isHttpError(query.error) && query.error.status === 401) {
			reauth();
		}
	}, [query.error]);

	if (query.isPending) {
		return (
			<div className="rounded-lg border border-border bg-muted/30 p-4 text-muted-foreground text-sm">
				Đang tải chi tiết bài kiểm tra đầu vào...
			</div>
		);
	}

	if (query.isError) {
		if (isHttpError(query.error) && query.error.status === 404) {
			return null;
		}
		return (
			<div
				role="alert"
				className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive text-xs"
			>
				Không tải được chi tiết bài làm Entry Test.
			</div>
		);
	}

	return (
		<PlacementSubmissionBody
			submission={query.data}
			onSaved={(updated) => {
				queryClient.setQueryData(
					leadPlacementSubmissionQueryKey(leadId),
					updated,
				);
				void queryClient.invalidateQueries({ queryKey: leadsAllQueryKey });
			}}
		/>
	);
}

function PlacementSubmissionBody({
	submission,
	onSaved,
}: {
	submission: PlacementSubmissionDetail;
	onSaved: (updated: PlacementSubmissionDetail) => void;
}) {
	const [writingRubric, setWritingRubric] = useState<PlacementWritingRubric>(
		() => submission.writingRubric ?? DEFAULT_WRITING,
	);
	const [includeSpeaking, setIncludeSpeaking] = useState<boolean>(() =>
		submission.gradedAt !== null
			? submission.speakingRubric !== null
			: submission.speakingStatus === "uploaded",
	);
	const [speakingRubric, setSpeakingRubric] = useState<PlacementSpeakingRubric>(
		() => submission.speakingRubric ?? DEFAULT_SPEAKING,
	);
	const [teacherFeedback, setTeacherFeedback] = useState(
		() => submission.teacherFeedback,
	);

	// Media playback qua Blob URL với credentials: "include" (hỗ trợ cross-origin web<->api dev/prod)
	const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
	const [mediaLoading, setMediaLoading] = useState(false);
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [mediaRetryTick, setMediaRetryTick] = useState(0);
	const [copiedZalo, setCopiedZalo] = useState(false);

	const hydratedKeyRef = useRef(
		`${submission.id}:${submission.gradedAt ?? "pending"}`,
	);
	useEffect(() => {
		const hydrationKey = `${submission.id}:${submission.gradedAt ?? "pending"}`;
		if (hydratedKeyRef.current === hydrationKey) return;
		hydratedKeyRef.current = hydrationKey;
		setWritingRubric(submission.writingRubric ?? DEFAULT_WRITING);
		setIncludeSpeaking(
			submission.gradedAt !== null
				? submission.speakingRubric !== null
				: submission.speakingStatus === "uploaded",
		);
		setSpeakingRubric(submission.speakingRubric ?? DEFAULT_SPEAKING);
		setTeacherFeedback(submission.teacherFeedback);
	}, [submission]);

	useEffect(() => {
		const resolved = resolvePlacementSubmissionMediaUrl(
			submission.speakingMediaUrl,
		);
		if (submission.speakingStatus !== "uploaded" || !resolved) {
			setMediaBlobUrl(null);
			setMediaError(null);
			return;
		}
		let cancelled = false;
		let createdUrl: string | null = null;
		setMediaLoading(true);
		setMediaError(null);

		fetch(resolved, { credentials: "include" })
			.then(async (res) => {
				if (!res.ok) {
					throw new Error(`HTTP ${res.status}`);
				}
				return res.blob();
			})
			.then((blob) => {
				if (cancelled) return;
				createdUrl = URL.createObjectURL(blob);
				setMediaBlobUrl(createdUrl);
			})
			.catch(() => {
				if (!cancelled) {
					setMediaError("Không tải được file ghi âm Speaking.");
				}
			})
			.finally(() => {
				if (!cancelled) setMediaLoading(false);
			});

		return () => {
			cancelled = true;
			if (createdUrl) {
				URL.revokeObjectURL(createdUrl);
			}
		};
	}, [submission.speakingStatus, submission.speakingMediaUrl, mediaRetryTick]);

	const activeSpeakingRubric = includeSpeaking ? speakingRubric : null;
	const previewFinal = computePlacementFinal({
		objective: submission.objective,
		bands: submission.snapshot.bands,
		writingRubric,
		speakingRubric: activeSpeakingRubric,
	});

	const gradeMutation = useMutation({
		mutationFn: () =>
			gradeLeadPlacementSubmission(submission.leadId, {
				writingRubric,
				speakingRubric: activeSpeakingRubric,
				teacherFeedback: teacherFeedback.trim(),
			}),
		onSuccess: (updated) => {
			toast.success("Đã lưu kết quả chấm bài kiểm tra đầu vào.");
			onSaved(updated);
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error("Không thể lưu điểm chấm. Vui lòng thử lại.");
		},
	});

	const liveZaloText = buildPlacementZaloText({
		studentName: submission.studentName,
		phone: submission.studentPhone,
		objective: submission.objective,
		writingScore: previewFinal.writingScore,
		speakingScore: previewFinal.speakingScore,
		speakingStatus: submission.speakingStatus,
		band: previewFinal.band,
		averagePct: previewFinal.averagePct,
		note: previewFinal.note,
		teacherFeedback,
	});

	const handleCopyZalo = async () => {
		try {
			await navigator.clipboard.writeText(liveZaloText);
			setCopiedZalo(true);
			toast.success("Đã sao chép kết quả gửi Zalo.");
			setTimeout(() => setCopiedZalo(false), 2000);
		} catch {
			toast.error("Trình duyệt không cho phép sao chép tự động.");
		}
	};

	const { objective } = submission;
	const isVideo =
		submission.speakingMediaMime?.toLowerCase().startsWith("video/") ?? false;

	return (
		<div
			data-testid="placement-submission-panel"
			className="flex flex-col gap-4 rounded-lg border border-border bg-muted/20 p-4"
		>
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h4 className="font-semibold text-foreground text-sm">
						Bài kiểm tra đầu vào 5 kỹ năng (v{submission.testVersion})
					</h4>
					<p className="text-muted-foreground text-xs">
						Chấm tự động 3 phần khách quan • giáo viên chấm Writing & Speaking
					</p>
				</div>
				<StatusTag tone={submission.status === "graded" ? "ok" : "warn"}>
					{submission.status === "graded" ? "Đã chấm" : "Chờ chấm W&S"}
				</StatusTag>
			</div>

			{/* 3 điểm tự động */}
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<div className="rounded-md border border-border bg-background px-3 py-2">
					<div className="text-muted-foreground text-xs">Listening</div>
					<div className="font-semibold text-foreground text-sm tabular-nums">
						{objective.listening.correct}/{objective.listening.total} (
						{objective.listening.pct ?? 0}%)
					</div>
				</div>
				<div className="rounded-md border border-border bg-background px-3 py-2">
					<div className="text-muted-foreground text-xs">Grammar & Vocab</div>
					<div className="font-semibold text-foreground text-sm tabular-nums">
						{objective.vocabGrammar.correct}/{objective.vocabGrammar.total} (
						{objective.vocabGrammar.pct ?? 0}%)
					</div>
				</div>
				<div className="rounded-md border border-border bg-background px-3 py-2">
					<div className="text-muted-foreground text-xs">Reading</div>
					<div className="font-semibold text-foreground text-sm tabular-nums">
						{objective.reading.correct}/{objective.reading.total} (
						{objective.reading.pct ?? 0}%)
					</div>
				</div>
				<div className="rounded-md border border-border bg-background px-3 py-2">
					<div className="text-muted-foreground text-xs">Trung bình 3 phần</div>
					<div className="font-semibold text-foreground text-sm tabular-nums">
						{objective.totalCorrect}/{objective.totalQuestions} (
						{objective.averagePct}%)
					</div>
				</div>
			</div>

			{/* Thống kê CEFR theo level */}
			{objective.byLevel.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{objective.byLevel.map((stat) => (
						<span
							key={stat.level}
							className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs tabular-nums"
						>
							<strong>{stat.level}</strong>
							<span className="text-muted-foreground">
								{stat.correct}/{stat.total} ({stat.pct}%)
							</span>
						</span>
					))}
				</div>
			)}

			{/* Chi tiết câu trả lời */}
			<details className="rounded-md border border-border bg-background">
				<summary className="cursor-pointer px-3 py-2 font-medium text-foreground text-xs hover:bg-muted/40">
					Xem chi tiết {objective.items.length} câu hỏi & đáp án đã chọn
				</summary>
				<div className="max-h-64 overflow-auto border-border border-t">
					<table className="w-full text-left text-xs">
						<thead className="bg-muted/50 text-muted-foreground">
							<tr>
								<th className="px-2.5 py-1.5 font-medium">Câu</th>
								<th className="px-2.5 py-1.5 font-medium">Phần</th>
								<th className="px-2.5 py-1.5 font-medium">Mức</th>
								<th className="px-2.5 py-1.5 font-medium">Học viên</th>
								<th className="px-2.5 py-1.5 font-medium">Đáp án đúng</th>
								<th className="px-2.5 py-1.5 font-medium">KQ</th>
							</tr>
						</thead>
						<tbody>
							{objective.items.map((item) => (
								<tr key={item.id} className="border-border border-t">
									<td className="px-2.5 py-1.5 font-mono">{item.id}</td>
									<td className="px-2.5 py-1.5">
										{SECTION_LABELS[item.section]}
									</td>
									<td className="px-2.5 py-1.5">{item.level}</td>
									<td className="px-2.5 py-1.5 font-mono">
										{formatStudentAnswer(item.studentAnswer, item.type)}
									</td>
									<td className="px-2.5 py-1.5 font-mono">
										{formatExpectedAnswer(item.expected)}
									</td>
									<td className="px-2.5 py-1.5">
										<span
											className={
												item.correct
													? "font-medium text-emerald-700 dark:text-emerald-400"
													: "font-medium text-destructive"
											}
										>
											{item.correct ? "Đúng" : "Sai"}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</details>

			{/* Writing */}
			<div className="space-y-2.5 rounded-md border border-border bg-background p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">
						Phần 4: Writing ({previewFinal.writingScore ?? 0}/15 điểm •{" "}
						{previewFinal.writingPct ?? 0}%)
					</h5>
					<span className="rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
						{submission.writingWordCount} từ
					</span>
				</div>
				<div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-muted/30 p-2.5 text-foreground text-sm">
					{submission.writingText.trim() || "(Học viên không nhập bài viết)"}
				</div>
				<div className="space-y-1.5">
					{PLACEMENT_WRITING_RUBRIC.map((item) => (
						<RubricRow
							key={item.key}
							label={item.label}
							desc={item.desc}
							value={writingRubric[item.key]}
							testIdPrefix={`writing-${item.key}`}
							onChange={(next) =>
								setWritingRubric((prev) => ({ ...prev, [item.key]: next }))
							}
						/>
					))}
				</div>
			</div>

			{/* Speaking */}
			<div className="space-y-2.5 rounded-md border border-border bg-background p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">
						Phần 5: Speaking (
						{previewFinal.speakingScore !== null
							? `${previewFinal.speakingScore}/20 điểm • ${previewFinal.speakingPct}%`
							: submission.speakingStatus === "skipped"
								? "Học viên đã bỏ qua"
								: "Chưa chấm"}
						)
					</h5>
					<label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs">
						<input
							type="checkbox"
							checked={includeSpeaking}
							onChange={(e) => setIncludeSpeaking(e.target.checked)}
							data-testid="toggle-speaking-grading"
							className="size-3.5 accent-primary"
						/>
						Tính điểm Speaking
					</label>
				</div>

				{submission.speakingStatus === "uploaded" && (
					<div className="space-y-2">
						{mediaLoading && (
							<p className="text-muted-foreground text-xs">
								Đang tải file Speaking...
							</p>
						)}
						{mediaError && (
							<div className="flex items-center justify-between gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs">
								<span>{mediaError}</span>
								<Button
									variant="outline"
									size="sm"
									onClick={() => setMediaRetryTick((n) => n + 1)}
								>
									<RefreshCw className="size-3.5" />
									Thử lại
								</Button>
							</div>
						)}
						{mediaBlobUrl &&
							(isVideo ? (
								// biome-ignore lint/a11y/useMediaCaption: teacher review of raw learner speaking recording has no captions track
								<video
									controls
									preload="metadata"
									src={mediaBlobUrl}
									data-testid="speaking-media-player"
									className="max-h-64 w-full rounded border border-border bg-black"
								/>
							) : (
								// biome-ignore lint/a11y/useMediaCaption: teacher review of raw learner speaking audio has no captions track
								<audio
									controls
									preload="metadata"
									src={mediaBlobUrl}
									data-testid="speaking-media-player"
									className="w-full"
								/>
							))}
						{submission.speakingDurationSec !== null && (
							<p className="text-muted-foreground text-xs tabular-nums">
								Thời lượng ghi: {submission.speakingDurationSec} giây
								{submission.speakingMediaMime
									? ` · ${submission.speakingMediaMime}`
									: ""}
							</p>
						)}
					</div>
				)}

				{submission.speakingStatus !== "uploaded" && (
					<p className="rounded border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs">
						{submission.speakingStatus === "skipped"
							? "Học viên đã chọn bỏ qua phần Speaking khi nộp bài."
							: submission.speakingStatus === "pending_upload"
								? "File ghi âm Speaking chưa hoàn tất tải lên."
								: "Không có file Speaking kèm theo."}
					</p>
				)}

				{includeSpeaking && (
					<div className="space-y-1.5">
						{PLACEMENT_SPEAKING_RUBRIC.map((item) => (
							<RubricRow
								key={item.key}
								label={item.label}
								desc={item.desc}
								value={speakingRubric[item.key]}
								testIdPrefix={`speaking-${item.key}`}
								onChange={(next) =>
									setSpeakingRubric((prev) => ({ ...prev, [item.key]: next }))
								}
							/>
						))}
					</div>
				)}
			</div>

			{/* Xem trước kết quả cuối cùng */}
			<div className="space-y-2 rounded-md border border-border bg-background p-3">
				<div className="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<span className="text-muted-foreground text-xs">
							Kết quả xếp lớp đề xuất:{" "}
						</span>
						<strong
							className="text-foreground text-sm"
							data-testid="final-band-preview"
						>
							{previewFinal.band.cefr} ({previewFinal.averagePct}%)
						</strong>
					</div>
					<span className="font-medium text-foreground text-xs">
						{previewFinal.band.displayCourse || previewFinal.band.courseLabel}
					</span>
				</div>
				{previewFinal.note && (
					<p
						data-testid="speaking-floor-note"
						className="rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-amber-900 text-xs dark:text-amber-200"
					>
						{previewFinal.note}
					</p>
				)}
				{previewFinal.band.advice && (
					<p className="text-muted-foreground text-xs">
						Lộ trình: {previewFinal.band.advice}
					</p>
				)}
			</div>

			{/* Nhận xét & nút lưu */}
			<label className="block font-medium text-muted-foreground text-xs">
				Nhận xét chi tiết của Cô Mỹ gửi học viên
				<textarea
					rows={2}
					maxLength={PLACEMENT_TEACHER_FEEDBACK_MAX}
					aria-label="Nhận xét bài kiểm tra đầu vào"
					value={teacherFeedback}
					onChange={(e) => setTeacherFeedback(e.target.value)}
					placeholder="Ghi chú điểm mạnh, lỗi cần khắc phục (sẽ kèm vào tin nhắn Zalo)..."
					className={`${inputCls} mt-1 w-full resize-y py-2`}
				/>
			</label>

			<div className="flex flex-wrap items-center justify-between gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={() => void handleCopyZalo()}
					data-testid="copy-zalo-result-btn"
				>
					{copiedZalo ? (
						<Check className="size-3.5" />
					) : (
						<Copy className="size-3.5" />
					)}
					{copiedZalo ? "Đã sao chép Zalo" : "Sao chép tin nhắn Zalo"}
				</Button>
				<Button
					variant="primary"
					size="sm"
					disabled={gradeMutation.isPending}
					aria-busy={gradeMutation.isPending}
					onClick={() => gradeMutation.mutate()}
					data-testid="save-placement-grade-btn"
				>
					{gradeMutation.isPending
						? "Đang lưu điểm..."
						: "Lưu điểm & Cập nhật kết quả"}
				</Button>
			</div>
		</div>
	);
}
