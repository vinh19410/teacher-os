import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	formatBand,
	ieltsOverallBand,
	isBandStep,
} from "@teacher-os/api/lib/ielts-band";
import {
	buildPlacementZaloText,
	computePlacementFinal,
	isIeltsSpeakingRubric,
	isIeltsWritingRubric,
	locatePlacementErrors,
	PLACEMENT_SPEAKING_RUBRIC,
	PLACEMENT_TEACHER_FEEDBACK_MAX,
	PLACEMENT_WRITING_RUBRIC,
	type PlacementError,
	type PlacementSubmissionDetail,
	type PlacementTeacherGrade,
} from "@teacher-os/api/placement-test-contracts";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusTag } from "@/components/assignments/status-tag";
import { BandSlider } from "@/components/grading/band-slider";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	fetchLeadPlacementSubmission,
	gradeLeadPlacementSubmission,
	leadPlacementSubmissionQueryKey,
	leadsAllQueryKey,
	resolvePlacementSubmissionMediaUrl,
	retryLeadPlacementAi,
} from "@/lib/repos/leads";
import {
	fetchStudentPlacementSubmission,
	gradeStudentPlacementSubmission,
	resolveStudentPlacementMediaUrl,
	retryStudentPlacementAi,
	studentPlacementSubmissionQueryKey,
} from "@/lib/repos/student-placement";
import { PlacementAiStatusBanner } from "./placement-ai-status-banner";
import { PlacementErrorHighlighter } from "./placement-error-highlighter";

/** Chu kỳ poll khi AI đang phân tích lỗi (#730, #800). */
export const PLACEMENT_AI_POLL_MS = 4000;

const SECTION_LABELS = {
	listening: "Listening",
	"vocab-grammar": "G&V",
	reading: "Reading",
} as const;

export type NullablePlacementWritingRubric = {
	task: number | null;
	coherence: number | null;
	lexical: number | null;
	grammar: number | null;
};

export type NullablePlacementSpeakingRubric = {
	fluency: number | null;
	lexical: number | null;
	grammar: number | null;
	pronunciation: number | null;
};

function emptyWritingRubric(): NullablePlacementWritingRubric {
	return { task: null, coherence: null, lexical: null, grammar: null };
}

function emptySpeakingRubric(): NullablePlacementSpeakingRubric {
	return {
		fluency: null,
		lexical: null,
		grammar: null,
		pronunciation: null,
	};
}

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

type GradingState = {
	writingRubric: NullablePlacementWritingRubric;
	writingScore: number | null;
	speakingRubric: NullablePlacementSpeakingRubric;
	speakingScore: number | null;
	includeSpeaking: boolean;
	writingErrors: PlacementError[];
	speakingErrors: PlacementError[];
};

/**
 * Trạng thái chấm khởi tạo (#730, #800):
 * - Lỗi: đã chốt (`writingErrors !== null`) → lấy lỗi đã lưu; chưa chốt → lấy
 *   lỗi từ nháp AI (nếu có). Lỗi luôn được định vị lại theo văn bản nguồn.
 * - Điểm IELTS: chỉ prefill khi bài đã chấm theo rubric IELTS; bài chưa chấm
 *   hoặc bài cũ (thang legacy /15, /20) luôn khởi tạo rỗng (`null`) để giáo
 *   viên tự chấm theo thang IELTS 0–9.
 */
export function initialPlacementGrading(
	submission: PlacementSubmissionDetail,
): GradingState {
	const useAi = submission.writingErrors === null;
	const aiWriting = useAi ? submission.aiWriting : null;
	const aiSpeaking = useAi ? submission.aiSpeaking : null;
	const ieltsWriting = isIeltsWritingRubric(submission.writingRubric)
		? submission.writingRubric
		: null;
	const ieltsSpeaking = isIeltsSpeakingRubric(submission.speakingRubric)
		? submission.speakingRubric
		: null;
	return {
		writingRubric: ieltsWriting
			? {
					task: ieltsWriting.task,
					coherence: ieltsWriting.coherence,
					lexical: ieltsWriting.lexical,
					grammar: ieltsWriting.grammar,
				}
			: emptyWritingRubric(),
		writingScore: ieltsWriting ? (submission.writingScore ?? null) : null,
		speakingRubric: ieltsSpeaking
			? {
					fluency: ieltsSpeaking.fluency,
					lexical: ieltsSpeaking.lexical,
					grammar: ieltsSpeaking.grammar,
					pronunciation: ieltsSpeaking.pronunciation,
				}
			: emptySpeakingRubric(),
		speakingScore: ieltsSpeaking ? (submission.speakingScore ?? null) : null,
		includeSpeaking:
			submission.gradedAt !== null
				? submission.speakingRubric !== null
				: submission.speakingStatus === "uploaded",
		writingErrors: locatePlacementErrors(
			submission.writingText,
			aiWriting?.errors ?? submission.writingErrors ?? [],
		),
		speakingErrors: locatePlacementErrors(
			submission.speakingTranscript,
			aiSpeaking?.errors ?? submission.speakingErrors ?? [],
		),
	};
}

function hydrationKeyOf(s: PlacementSubmissionDetail): string {
	return `${s.id}:${s.gradedAt ?? "pending"}:${s.aiDraftedAt ?? "no-ai"}`;
}

/** Bài có nguồn để AI phân tích lỗi (bài viết hoặc file nói đã upload/transcript). */
function hasAiSourceOf(s: PlacementSubmissionDetail): boolean {
	return (
		s.writingText.trim().length > 0 ||
		s.speakingStatus === "uploaded" ||
		s.speakingTranscript.trim().length > 0
	);
}

const EMAIL_STATUS_TEXT = {
	sent: "Đã gửi email kết quả cho học viên.",
	failed: "Gửi email kết quả lỗi — hãy gửi link qua Zalo.",
	skipped: "Học viên không có email — gửi link qua Zalo.",
} as const;

/**
 * Một trường nhập band IELTS (0–9, bước 0.5) kết hợp `<BandSlider>` và ô nhập số
 * đồng bộ hai chiều. Cho phép trống (`null`), commit giá trị hợp lệ ngay khi gõ
 * và chuẩn hóa/hoàn nguyên giá trị không hợp lệ khi blur.
 */
function IeltsBandField({
	label,
	desc,
	value,
	onChange,
	sliderId,
	inputTestId,
	highlight = false,
}: {
	label: string;
	desc?: string;
	value: number | null;
	onChange: (next: number | null) => void;
	sliderId: string;
	inputTestId: string;
	highlight?: boolean;
}) {
	const [draft, setDraft] = useState(() =>
		value === null ? "" : formatBand(value),
	);
	const focusedRef = useRef(false);

	useEffect(() => {
		if (!focusedRef.current) {
			setDraft(value === null ? "" : formatBand(value));
		}
	}, [value]);

	return (
		<div
			className={
				highlight
					? "space-y-1.5 rounded-md border border-primary/30 bg-muted/50 px-3 py-2.5"
					: "space-y-1 rounded-md border border-border bg-muted/30 px-3 py-2"
			}
		>
			<div className="flex flex-wrap items-baseline justify-between gap-2">
				<label
					htmlFor={sliderId}
					className="font-medium text-foreground text-xs"
				>
					{label}
				</label>
				{desc && <span className="text-muted-foreground text-xs">{desc}</span>}
			</div>
			<div className="flex items-center gap-3">
				<div className="min-w-0 flex-1">
					<BandSlider
						id={sliderId}
						value={value}
						hideValue
						onChange={(band) => onChange(band)}
					/>
				</div>
				<input
					type="number"
					min={0}
					max={9}
					step={0.5}
					placeholder="—"
					aria-label={`${label} (điểm IELTS)`}
					data-testid={inputTestId}
					value={draft}
					onFocus={() => {
						focusedRef.current = true;
					}}
					onChange={(e) => {
						const raw = e.target.value;
						setDraft(raw);
						if (raw.trim() === "") {
							onChange(null);
							return;
						}
						const parsed = Number(raw);
						if (isBandStep(parsed)) {
							onChange(parsed);
						}
					}}
					onBlur={() => {
						focusedRef.current = false;
						const trimmed = draft.trim();
						if (trimmed === "") {
							setDraft("");
							if (value !== null) onChange(null);
							return;
						}
						const parsed = Number(trimmed);
						if (!Number.isFinite(parsed)) {
							setDraft(value === null ? "" : formatBand(value));
							return;
						}
						const snapped =
							Math.round(Math.min(9, Math.max(0, parsed)) * 2) / 2;
						setDraft(formatBand(snapped));
						if (snapped !== value) {
							onChange(snapped);
						}
					}}
					className={cn(
						inputCls,
						"w-20 shrink-0 text-right font-mono tabular-nums",
					)}
				/>
			</div>
		</div>
	);
}

/** Khối nhập 4 tiêu chí IELTS + điểm tổng IELTS cho Writing hoặc Speaking. */
function IeltsSkillGradingSection({
	skill,
	criteria,
	rubric,
	overall,
	overallLabel,
	onCriterionChange,
	onOverallChange,
}: {
	skill: "writing" | "speaking";
	criteria: readonly {
		readonly key: string;
		readonly label: string;
		readonly desc: string;
	}[];
	rubric: Record<string, number | null>;
	overall: number | null;
	overallLabel: string;
	onCriterionChange: (key: string, next: number | null) => void;
	onOverallChange: (next: number | null) => void;
}) {
	return (
		<div className="space-y-1.5">
			{criteria.map((item) => (
				<IeltsBandField
					key={item.key}
					label={item.label}
					desc={item.desc}
					value={rubric[item.key] ?? null}
					sliderId={`${skill}-${item.key}-slider`}
					inputTestId={`${skill}-${item.key}-input`}
					onChange={(next) => onCriterionChange(item.key, next)}
				/>
			))}
			<IeltsBandField
				label={overallLabel}
				desc="Tự động tính khi đủ 4 tiêu chí · có thể chỉnh tay"
				value={overall}
				sliderId={`${skill}-overall-slider`}
				inputTestId={`${skill}-overall-input`}
				highlight
				onChange={onOverallChange}
			/>
		</div>
	);
}

export type PlacementSubmissionSubject =
	| { kind: "lead"; id: string }
	| { kind: "student"; id: string };

export type PlacementSubmissionPanelProps = {
	onGraded?: (detail: PlacementSubmissionDetail) => void;
	emptyFallback?: ReactNode;
} & (
	| { subject: PlacementSubmissionSubject; leadId?: never; studentId?: never }
	| { leadId: string; studentId?: never; subject?: never }
	| { studentId: string; leadId?: never; subject?: never }
);

export function PlacementSubmissionPanel(props: PlacementSubmissionPanelProps) {
	const resolvedSubject: PlacementSubmissionSubject =
		props.subject ??
		(props.studentId !== undefined
			? { kind: "student", id: props.studentId }
			: { kind: "lead", id: props.leadId });

	const queryClient = useQueryClient();
	const query = useQuery({
		queryKey:
			resolvedSubject.kind === "student"
				? studentPlacementSubmissionQueryKey(resolvedSubject.id)
				: leadPlacementSubmissionQueryKey(resolvedSubject.id),
		queryFn: ({ signal }) =>
			resolvedSubject.kind === "student"
				? fetchStudentPlacementSubmission(resolvedSubject.id, undefined, signal)
				: fetchLeadPlacementSubmission(resolvedSubject.id, undefined, signal),
		staleTime: resolvedSubject.kind === "student" ? 0 : undefined,
		refetchInterval: (q) =>
			q.state.data?.aiStatus === "processing" ? PLACEMENT_AI_POLL_MS : false,
	});

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
			return props.emptyFallback ?? null;
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
			subject={resolvedSubject}
			submission={query.data}
			onSaved={(updated, action) => {
				if (resolvedSubject.kind === "student") {
					queryClient.setQueryData(
						studentPlacementSubmissionQueryKey(resolvedSubject.id),
						updated,
					);
					void queryClient.invalidateQueries({
						queryKey: studentPlacementSubmissionQueryKey(resolvedSubject.id),
					});
				} else {
					queryClient.setQueryData(
						leadPlacementSubmissionQueryKey(resolvedSubject.id),
						updated,
					);
					void queryClient.invalidateQueries({ queryKey: leadsAllQueryKey });
				}
				if (action === "grade") {
					props.onGraded?.(updated);
				}
			}}
		/>
	);
}

function PlacementSubmissionBody({
	subject,
	submission,
	onSaved,
}: {
	subject: PlacementSubmissionSubject;
	submission: PlacementSubmissionDetail;
	onSaved: (
		updated: PlacementSubmissionDetail,
		action: "grade" | "retry",
	) => void;
}) {
	const [initial] = useState(() => initialPlacementGrading(submission));
	const [writingRubric, setWritingRubric] =
		useState<NullablePlacementWritingRubric>(initial.writingRubric);
	const [writingScore, setWritingScore] = useState<number | null>(
		initial.writingScore,
	);
	const [includeSpeaking, setIncludeSpeaking] = useState<boolean>(
		initial.includeSpeaking,
	);
	const [speakingRubric, setSpeakingRubric] =
		useState<NullablePlacementSpeakingRubric>(initial.speakingRubric);
	const [speakingScore, setSpeakingScore] = useState<number | null>(
		initial.speakingScore,
	);
	const [writingErrors, setWritingErrors] = useState<PlacementError[]>(
		initial.writingErrors,
	);
	const [speakingErrors, setSpeakingErrors] = useState<PlacementError[]>(
		initial.speakingErrors,
	);
	const [teacherFeedback, setTeacherFeedback] = useState(
		() => submission.teacherFeedback,
	);
	// Giáo viên đã sửa form (rubric/điểm/lỗi/nhận xét) kể từ lần hydrate gần nhất.
	const [dirty, setDirty] = useState(false);
	// Danh sách lỗi AI mới về khi form đang sửa → chờ giáo viên bấm "Áp dụng lỗi AI".
	const [draftPending, setDraftPending] = useState(false);
	const touch = () => setDirty(true);

	// Media playback qua Blob URL với credentials: "include" (hỗ trợ cross-origin web<->api dev/prod)
	const [mediaBlobUrl, setMediaBlobUrl] = useState<string | null>(null);
	const [mediaLoading, setMediaLoading] = useState(false);
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [mediaRetryTick, setMediaRetryTick] = useState(0);
	const [copiedZalo, setCopiedZalo] = useState(false);
	const [copiedLink, setCopiedLink] = useState(false);

	// Khởi tạo lại form khi đổi bài, khi vừa chốt, hoặc khi kết quả AI mới về.
	// Kết quả AI mới về lúc form đang sửa → KHÔNG ghi đè, chỉ mời áp dụng lỗi.
	const hydratedRef = useRef({
		key: hydrationKeyOf(submission),
		id: submission.id,
		gradedAt: submission.gradedAt,
	});
	useEffect(() => {
		const hydrationKey = hydrationKeyOf(submission);
		const prev = hydratedRef.current;
		if (prev.key === hydrationKey) return;
		hydratedRef.current = {
			key: hydrationKey,
			id: submission.id,
			gradedAt: submission.gradedAt,
		};
		const onlyNewAiDraft =
			prev.id === submission.id && prev.gradedAt === submission.gradedAt;
		if (onlyNewAiDraft && dirty) {
			setDraftPending(true);
			return;
		}
		setDirty(false);
		setDraftPending(false);
		const next = initialPlacementGrading(submission);
		setWritingRubric(next.writingRubric);
		setWritingScore(next.writingScore);
		setIncludeSpeaking(next.includeSpeaking);
		setSpeakingRubric(next.speakingRubric);
		setSpeakingScore(next.speakingScore);
		setWritingErrors(next.writingErrors);
		setSpeakingErrors(next.speakingErrors);
		setTeacherFeedback(submission.teacherFeedback);
	}, [submission, dirty]);

	/** Chỉ cập nhật danh sách lỗi từ AI, KHÔNG chạm vào điểm hay nhận xét. */
	const applyAiDraft = () => {
		if (submission.aiWriting) {
			setWritingErrors(
				locatePlacementErrors(
					submission.writingText,
					submission.aiWriting.errors,
				),
			);
		}
		if (submission.aiSpeaking) {
			setSpeakingErrors(
				locatePlacementErrors(
					submission.speakingTranscript,
					submission.aiSpeaking.errors,
				),
			);
		}
		setDraftPending(false);
	};

	useEffect(() => {
		const resolved =
			subject.kind === "student"
				? (resolvePlacementSubmissionMediaUrl(submission.speakingMediaUrl) ??
					(submission.speakingStatus === "uploaded"
						? resolveStudentPlacementMediaUrl(subject.id)
						: null))
				: resolvePlacementSubmissionMediaUrl(submission.speakingMediaUrl);
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
	}, [
		subject.kind,
		subject.id,
		submission.speakingStatus,
		submission.speakingMediaUrl,
		mediaRetryTick,
	]);

	const handleWritingCriterionChange = (key: string, next: number | null) => {
		touch();
		const updated: NullablePlacementWritingRubric = {
			...writingRubric,
			[key]: next,
		};
		setWritingRubric(updated);
		if (
			updated.task !== null &&
			updated.coherence !== null &&
			updated.lexical !== null &&
			updated.grammar !== null
		) {
			setWritingScore(
				ieltsOverallBand([
					updated.task,
					updated.coherence,
					updated.lexical,
					updated.grammar,
				]),
			);
		}
	};

	const handleSpeakingCriterionChange = (key: string, next: number | null) => {
		touch();
		const updated: NullablePlacementSpeakingRubric = {
			...speakingRubric,
			[key]: next,
		};
		setSpeakingRubric(updated);
		if (
			updated.fluency !== null &&
			updated.lexical !== null &&
			updated.grammar !== null &&
			updated.pronunciation !== null
		) {
			setSpeakingScore(
				ieltsOverallBand([
					updated.fluency,
					updated.lexical,
					updated.grammar,
					updated.pronunciation,
				]),
			);
		}
	};

	const hasCompleteWriting =
		writingRubric.task !== null &&
		writingRubric.coherence !== null &&
		writingRubric.lexical !== null &&
		writingRubric.grammar !== null &&
		writingScore !== null;

	const hasCompleteSpeaking =
		!includeSpeaking ||
		(speakingRubric.fluency !== null &&
			speakingRubric.lexical !== null &&
			speakingRubric.grammar !== null &&
			speakingRubric.pronunciation !== null &&
			speakingScore !== null);

	const canSave = hasCompleteWriting && hasCompleteSpeaking;
	const activeSpeakingScore = includeSpeaking ? speakingScore : null;

	const previewFinal = computePlacementFinal({
		objective: submission.objective,
		bands: submission.snapshot.bands,
		writingScore,
		speakingScore: activeSpeakingScore,
	});

	const gradeMutation = useMutation({
		mutationFn: () => {
			if (!canSave) {
				throw new Error("INCOMPLETE_IELTS_GRADE");
			}
			const payload: PlacementTeacherGrade = {
				writingRubric: {
					task: writingRubric.task as number,
					coherence: writingRubric.coherence as number,
					lexical: writingRubric.lexical as number,
					grammar: writingRubric.grammar as number,
				},
				writingScore: writingScore as number,
				speakingRubric: includeSpeaking
					? {
							fluency: speakingRubric.fluency as number,
							lexical: speakingRubric.lexical as number,
							grammar: speakingRubric.grammar as number,
							pronunciation: speakingRubric.pronunciation as number,
						}
					: null,
				speakingScore: includeSpeaking ? (speakingScore as number) : null,
				teacherFeedback: teacherFeedback.trim(),
				writingErrors,
				speakingErrors: includeSpeaking ? speakingErrors : [],
			};
			return subject.kind === "student"
				? gradeStudentPlacementSubmission(subject.id, payload)
				: gradeLeadPlacementSubmission(subject.id, payload);
		},
		onSuccess: (updated) => {
			toast.success("Đã lưu kết quả chấm bài kiểm tra đầu vào.");
			onSaved(updated, "grade");
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			toast.error("Không thể lưu điểm chấm. Vui lòng thử lại.");
		},
	});

	const retryMutation = useMutation({
		mutationFn: () =>
			subject.kind === "student"
				? retryStudentPlacementAi(subject.id)
				: retryLeadPlacementAi(subject.id),
		onSuccess: (updated) => {
			toast.success("Đã gửi yêu cầu AI phân tích lỗi.");
			onSaved(updated, "retry");
		},
		onError: (err) => {
			if (isHttpError(err) && err.status === 401) {
				reauth();
				return;
			}
			if (isHttpError(err) && err.status === 503) {
				toast.error("Phân tích lỗi AI chưa được bật — vui lòng chấm tay.");
				return;
			}
			toast.error("Không thể yêu cầu AI phân tích lỗi. Vui lòng thử lại.");
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

	const handleCopyLink = async () => {
		if (!submission.resultUrl) return;
		try {
			await navigator.clipboard.writeText(submission.resultUrl);
			setCopiedLink(true);
			toast.success("Đã sao chép link kết quả.");
			setTimeout(() => setCopiedLink(false), 2000);
		} catch {
			toast.error("Trình duyệt không cho phép sao chép tự động.");
		}
	};

	const { objective } = submission;
	const hasSpeakingTranscriptArea =
		submission.speakingStatus === "uploaded" ||
		submission.speakingTranscript.trim().length > 0 ||
		speakingErrors.length > 0;
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
						Chấm tự động 3 phần • giáo viên chấm Writing & Speaking
					</p>
				</div>
				<StatusTag tone={submission.status === "graded" ? "ok" : "warn"}>
					{submission.status === "graded" ? "Đã chấm" : "Chờ chấm W&S"}
				</StatusTag>
			</div>

			<PlacementAiStatusBanner
				submission={submission}
				retrying={retryMutation.isPending}
				onRetry={() => retryMutation.mutate()}
				locked={submission.status === "graded"}
				hasAiSource={hasAiSourceOf(submission)}
				onApplyDraft={draftPending ? applyAiDraft : undefined}
			/>

			{submission.gradedAt !== null &&
				!isIeltsWritingRubric(submission.writingRubric) && (
					<div
						role="note"
						data-testid="legacy-score-banner"
						className="rounded-md border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-xs"
					>
						Điểm cũ: Writing {submission.writingScore ?? "—"}/15
						{submission.speakingScore !== null
							? ` · Speaking ${submission.speakingScore}/20`
							: ""}{" "}
						— nhập điểm IELTS (0–9) để cập nhật.
					</div>
				)}

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
						Phần 4: Writing (
						{writingScore !== null
							? `Band ${formatBand(writingScore)}/9 • ${previewFinal.writingPct ?? 0}%`
							: "Chưa chấm"}
						)
					</h5>
					<span className="rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-xs">
						{submission.writingWordCount} từ
					</span>
				</div>
				<PlacementErrorHighlighter
					skill="writing"
					text={submission.writingText}
					emptyText="(Học viên không nhập bài viết)"
					errors={writingErrors}
					onChange={(next) => {
						touch();
						setWritingErrors(next);
					}}
				/>
				<IeltsSkillGradingSection
					skill="writing"
					criteria={PLACEMENT_WRITING_RUBRIC}
					rubric={writingRubric}
					overall={writingScore}
					overallLabel="Điểm tổng Writing (IELTS Band)"
					onCriterionChange={handleWritingCriterionChange}
					onOverallChange={(next) => {
						touch();
						setWritingScore(next);
					}}
				/>
			</div>

			{/* Speaking */}
			<div className="space-y-2.5 rounded-md border border-border bg-background p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h5 className="font-semibold text-foreground text-xs uppercase tracking-wide">
						Phần 5: Speaking (
						{activeSpeakingScore !== null
							? `Band ${formatBand(activeSpeakingScore)}/9 • ${previewFinal.speakingPct ?? 0}%`
							: submission.speakingStatus === "skipped"
								? "Học viên đã bỏ qua"
								: "Chưa chấm"}
						)
					</h5>
					<label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground text-xs">
						<input
							type="checkbox"
							checked={includeSpeaking}
							onChange={(e) => {
								touch();
								setIncludeSpeaking(e.target.checked);
							}}
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

				{includeSpeaking && hasSpeakingTranscriptArea && (
					<div className="space-y-2">
						<div className="font-medium text-foreground text-xs">
							Transcript bài nói (AI chuyển từ file ghi âm)
						</div>
						<PlacementErrorHighlighter
							skill="speaking"
							text={submission.speakingTranscript}
							emptyText="Chưa có transcript — AI chưa chuyển bài nói thành văn bản."
							errors={speakingErrors}
							onChange={(next) => {
								touch();
								setSpeakingErrors(next);
							}}
						/>
					</div>
				)}

				{includeSpeaking && (
					<IeltsSkillGradingSection
						skill="speaking"
						criteria={PLACEMENT_SPEAKING_RUBRIC}
						rubric={speakingRubric}
						overall={speakingScore}
						overallLabel="Điểm tổng Speaking (IELTS Band)"
						onCriterionChange={handleSpeakingCriterionChange}
						onOverallChange={(next) => {
							touch();
							setSpeakingScore(next);
						}}
					/>
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
				<p
					data-testid="placement-score-summary"
					className="text-muted-foreground text-xs tabular-nums"
				>
					Writing{" "}
					{writingScore !== null ? `Band ${formatBand(writingScore)}/9` : "—"} ·
					Speaking{" "}
					{activeSpeakingScore !== null
						? `Band ${formatBand(activeSpeakingScore)}/9`
						: "—"}{" "}
					· Tổng {previewFinal.averagePct}% · CEFR {previewFinal.band.cefr}
				</p>
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
					onChange={(e) => {
						touch();
						setTeacherFeedback(e.target.value);
					}}
					placeholder="Ghi chú điểm mạnh, lỗi cần khắc phục (sẽ kèm vào tin nhắn Zalo)..."
					className={`${inputCls} mt-1 w-full resize-y py-2`}
				/>
			</label>

			<div className="space-y-1.5">
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
						disabled={gradeMutation.isPending || !canSave}
						aria-busy={gradeMutation.isPending}
						onClick={() => gradeMutation.mutate()}
						data-testid="save-placement-grade-btn"
					>
						{gradeMutation.isPending
							? "Đang chốt kết quả..."
							: submission.resultUrl
								? "Cập nhật kết quả đã chốt"
								: "Chốt kết quả & gửi học viên"}
					</Button>
				</div>
				{!canSave && (
					<p
						data-testid="save-placement-grade-hint"
						className="text-right text-muted-foreground text-xs"
					>
						{!hasCompleteWriting
							? "Nhập đủ 4 tiêu chí và điểm tổng IELTS cho Writing"
							: "Nhập đủ 4 tiêu chí và điểm tổng IELTS cho Speaking (hoặc bỏ chọn Tính điểm Speaking)"}
						{" để chốt kết quả."}
					</p>
				)}
			</div>

			{submission.resultUrl && (
				<div
					data-testid="placement-result-link"
					className="space-y-2 rounded-md border border-border bg-background p-3 text-xs"
				>
					<div className="font-medium text-foreground">
						Link kết quả cho học viên
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<a
							href={submission.resultUrl}
							target="_blank"
							rel="noreferrer"
							className="min-w-0 flex-1 break-all text-foreground underline underline-offset-4"
						>
							{submission.resultUrl}
						</a>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void handleCopyLink()}
							data-testid="copy-result-link-btn"
						>
							{copiedLink ? (
								<Check className="size-3.5" />
							) : (
								<Link2 className="size-3.5" />
							)}
							{copiedLink ? "Đã sao chép link" : "Copy link kết quả"}
						</Button>
					</div>
					{submission.resultEmailStatus && (
						<p
							data-testid="placement-result-email-status"
							className={
								submission.resultEmailStatus === "failed"
									? "text-destructive"
									: "text-muted-foreground"
							}
						>
							{EMAIL_STATUS_TEXT[submission.resultEmailStatus]}
						</p>
					)}
				</div>
			)}
		</div>
	);
}
