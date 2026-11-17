import {
	type PlacementPublishedClip,
	type PlacementPublishedListeningQuestion,
	stripInlineCefrLabel,
} from "@teacher-os/api/placement-test-contracts";
import { Button } from "@teacher-os/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@teacher-os/ui/components/card";
import { Play, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	PlacementGapQuestionCard,
	PlacementMcqQuestionCard,
} from "@/components/placement/placement-question-card";
import {
	formatPlacementClock,
	groupPlacementItemsByPart,
} from "@/lib/placement-test-helpers";
import {
	resolveStudentPlacementMediaSrc,
	useActiveStudentOrgId,
} from "@/lib/repos/placement-test";

function ListeningClipCard({
	clip,
	clipNumber,
	playsUsed,
	isActiveClip,
	onRequestPlay,
	onPlayStopped,
	onRefundPlay,
	questionNumbers,
	answers,
	onAnswerChange,
}: {
	clip: PlacementPublishedClip;
	clipNumber: number;
	playsUsed: number;
	isActiveClip: boolean;
	onRequestPlay: (clipId: string) => void;
	onPlayStopped: (clipId: string) => void;
	onRefundPlay: (clipId: string) => void;
	questionNumbers: ReadonlyMap<string, number>;
	answers: Readonly<Record<string, string | number | null>>;
	onAnswerChange: (questionId: string, value: string | number) => void;
}) {
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const refundedRef = useRef(false);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [audioError, setAudioError] = useState("");

	const activeOrgId = useActiveStudentOrgId();
	const maxPlays = clip.maxPlays > 0 ? clip.maxPlays : 2;
	const remaining = Math.max(0, maxPlays - playsUsed);
	const audioSrc = resolveStudentPlacementMediaSrc(clip.src, activeOrgId);
	const displayNotesTitle = stripInlineCefrLabel(clip.notesTitle);

	// Khi một clip khác được phát thì tạm dừng clip này.
	useEffect(() => {
		if (!isActiveClip && audioRef.current && !audioRef.current.paused) {
			try {
				audioRef.current.pause();
				audioRef.current.currentTime = 0;
			} catch {
				// Ignore audio pause errors
			}
		}
	}, [isActiveClip]);

	useEffect(() => {
		const el = audioRef.current;
		return () => {
			if (el && !el.paused) {
				try {
					el.pause();
				} catch {
					// Ignore unmount pause errors
				}
			}
		};
	}, []);

	const handlePlayClick = async () => {
		setAudioError("");
		if (remaining <= 0 || isActiveClip || !audioSrc) return;

		refundedRef.current = false;
		onRequestPlay(clip.id);

		const audio = audioRef.current;
		if (!audio) return;
		try {
			audio.currentTime = 0;
			await audio.play();
		} catch (err) {
			onPlayStopped(clip.id);
			const errName =
				err && typeof err === "object" && "name" in err
					? String((err as { name: unknown }).name)
					: "";
			if (errName !== "AbortError") {
				if (!refundedRef.current) {
					refundedRef.current = true;
					onRefundPlay(clip.id);
				}
				setAudioError(
					"Trình duyệt không phát được âm thanh. Lượt nghe đã được hoàn lại, vui lòng thử lại.",
				);
			}
		}
	};

	const progressPct =
		duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

	const questionBlocks = useMemo(() => {
		const blocks: Array<
			| { kind: "notes"; questions: PlacementPublishedListeningQuestion[] }
			| { kind: "single"; question: PlacementPublishedListeningQuestion }
		> = [];
		for (const q of clip.questions) {
			if (q.type === "gap" && displayNotesTitle) {
				const prev = blocks[blocks.length - 1];
				if (prev?.kind === "notes") {
					prev.questions.push(q);
				} else {
					blocks.push({ kind: "notes", questions: [q] });
				}
			} else {
				blocks.push({ kind: "single", question: q });
			}
		}
		return blocks;
	}, [clip.questions, displayNotesTitle]);

	return (
		<Card data-clip-id={clip.id}>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Đoạn nghe {clipNumber}</CardTitle>
			</CardHeader>

			<CardContent className="space-y-5">
				<div className="space-y-3 rounded-lg border bg-muted/30 p-4">
					{/* biome-ignore lint/a11y/useMediaCaption: audio đề thi Listening không có phụ đề để giữ chuẩn đánh giá. */}
					<audio
						ref={audioRef}
						crossOrigin="use-credentials"
						preload="metadata"
						src={audioSrc || undefined}
						onLoadedMetadata={(e) => {
							const d = e.currentTarget.duration;
							if (Number.isFinite(d) && d > 0) setDuration(d);
						}}
						onTimeUpdate={(e) => {
							const t = e.currentTarget.currentTime;
							const d = e.currentTarget.duration;
							if (Number.isFinite(d) && d > 0) setDuration(d);
							if (Number.isFinite(t)) setCurrentTime(t);
						}}
						onEnded={() => {
							onPlayStopped(clip.id);
						}}
						onError={() => {
							if (isActiveClip) {
								onPlayStopped(clip.id);
								if (!refundedRef.current) {
									refundedRef.current = true;
									onRefundPlay(clip.id);
								}
								setAudioError(
									"Không thể tải file âm thanh. Lượt nghe đã được hoàn lại, vui lòng thử lại.",
								);
							}
						}}
					/>

					<div className="flex flex-wrap items-center justify-between gap-3">
						<Button
							type="button"
							size="sm"
							data-testid={`play-clip-${clip.id}`}
							disabled={remaining <= 0 || isActiveClip || !audioSrc}
							onClick={() => void handlePlayClick()}
						>
							{isActiveClip ? (
								<>
									<Volume2
										aria-hidden="true"
										className="size-4 animate-pulse"
									/>
									<span>Đang phát âm thanh...</span>
								</>
							) : remaining <= 0 ? (
								<span>Đã hết lượt nghe</span>
							) : (
								<>
									<Play aria-hidden="true" className="size-4" />
									<span>Nghe đoạn âm thanh</span>
								</>
							)}
						</Button>

						<span
							data-testid={`clip-plays-${clip.id}`}
							className={
								remaining <= 0
									? "font-medium text-destructive text-xs tabular-nums"
									: "font-medium text-muted-foreground text-xs tabular-nums"
							}
						>
							Còn {remaining}/{maxPlays} lượt nghe
						</span>
					</div>

					<div className="flex items-center gap-3">
						<div
							aria-hidden="true"
							className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
						>
							<div
								className="h-full bg-primary transition-[width]"
								style={{ width: `${progressPct}%` }}
							/>
						</div>
						<span className="font-mono text-muted-foreground text-xs tabular-nums">
							{formatPlacementClock(currentTime)} /{" "}
							{formatPlacementClock(duration)}
						</span>
					</div>

					{audioError ? (
						<p role="alert" className="text-destructive text-xs">
							{audioError}
						</p>
					) : null}
				</div>

				<div className="space-y-4">
					{questionBlocks.map((block, bIdx) => {
						if (block.kind === "notes") {
							return (
								<div
									key={`notes-${clip.id}-${bIdx}`}
									data-testid={`listening-notes-${clip.id}`}
									className="rounded-xl border bg-muted/20 p-4"
								>
									<div className="mb-2 flex flex-wrap items-center gap-2 border-border border-b pb-2.5">
										<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
											Phiếu ghi chú
										</span>
										<h4 className="font-semibold text-foreground text-sm">
											{displayNotesTitle}
										</h4>
									</div>

									<div>
										{block.questions.map((q) => {
											const qNum = questionNumbers.get(q.id) ?? 1;
											const val = answers[q.id];
											return (
												<PlacementGapQuestionCard
													key={q.id}
													questionId={q.id}
													questionNumber={qNum}
													prompt={q.prompt}
													value={typeof val === "string" ? val : ""}
													onChange={(next) => onAnswerChange(q.id, next)}
													inline
												/>
											);
										})}
									</div>

									<p className="mt-2 border-border border-t pt-2.5 text-muted-foreground text-xs">
										Gợi ý: Viết ngắn gọn (không cần viết hoa hay ký tự phụ như
										$, p.m.).
									</p>
								</div>
							);
						}

						const q = block.question;
						const qNum = questionNumbers.get(q.id) ?? 1;
						const val = answers[q.id];
						if (q.type === "gap") {
							return (
								<PlacementGapQuestionCard
									key={q.id}
									questionId={q.id}
									questionNumber={qNum}
									prompt={q.prompt}
									value={typeof val === "string" ? val : ""}
									onChange={(next) => onAnswerChange(q.id, next)}
								/>
							);
						}
						return (
							<PlacementMcqQuestionCard
								key={q.id}
								questionId={q.id}
								questionNumber={qNum}
								prompt={q.prompt}
								options={q.options}
								value={typeof val === "number" ? val : null}
								onChange={(optIdx) => onAnswerChange(q.id, optIdx)}
							/>
						);
					})}
				</div>
			</CardContent>
		</Card>
	);
}

export function PlacementListeningStep({
	title,
	clips,
	plays,
	onRecordPlay,
	onRefundPlay,
	questionNumbers,
	answers,
	onAnswerChange,
}: {
	title: string;
	clips: readonly PlacementPublishedClip[];
	plays: Readonly<Record<string, number>>;
	onRecordPlay: (clipId: string) => void;
	onRefundPlay: (clipId: string) => void;
	questionNumbers: ReadonlyMap<string, number>;
	answers: Readonly<Record<string, string | number | null>>;
	onAnswerChange: (questionId: string, value: string | number) => void;
}) {
	const [activeClipId, setActiveClipId] = useState<string | null>(null);
	const partGroups = useMemo(() => groupPlacementItemsByPart(clips), [clips]);

	return (
		<div className="space-y-6" data-testid="placement-step-listening">
			<Card>
				<CardHeader>
					<CardDescription className="font-mono text-[11px] uppercase tracking-[0.16em]">
						Phần 1 / 5 · Nghe hiểu
					</CardDescription>
					<CardTitle className="text-xl">
						{stripInlineCefrLabel(title) || "Listening Comprehension"}
					</CardTitle>
					<CardDescription>
						Mỗi đoạn âm thanh có số lượt nghe giới hạn. Hãy đọc nhanh câu hỏi
						trước khi bấm phát âm thanh.
					</CardDescription>
				</CardHeader>
			</Card>

			{partGroups.length === 0 ? (
				<Card>
					<CardContent>
						<p className="text-muted-foreground text-sm">
							Phần Listening hiện chưa có đoạn nghe nào. Bạn có thể chuyển sang
							bước tiếp theo.
						</p>
					</CardContent>
				</Card>
			) : (
				partGroups.map((group, gIdx) => (
					<section
						key={`listening-part-${group.partLabel || gIdx}`}
						className="space-y-4"
					>
						{group.partLabel || group.instruction ? (
							<div className="space-y-1.5 px-1">
								{group.partLabel ? (
									<div>
										<span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 font-semibold text-foreground text-xs">
											{group.partLabel}
										</span>
									</div>
								) : null}
								{group.instruction ? (
									<p className="text-muted-foreground text-sm leading-relaxed">
										{group.instruction}
									</p>
								) : null}
							</div>
						) : null}

						<div className="space-y-4">
							{group.items.map(({ item: clip, index: clipIndex }) => (
								<ListeningClipCard
									key={clip.id}
									clip={clip}
									clipNumber={clipIndex + 1}
									playsUsed={plays[clip.id] ?? 0}
									isActiveClip={activeClipId === clip.id}
									onRequestPlay={(cid) => {
										onRecordPlay(cid);
										setActiveClipId(cid);
									}}
									onPlayStopped={(cid) => {
										setActiveClipId((prev) => (prev === cid ? null : prev));
									}}
									onRefundPlay={onRefundPlay}
									questionNumbers={questionNumbers}
									answers={answers}
									onAnswerChange={onAnswerChange}
								/>
							))}
						</div>
					</section>
				))
			)}
		</div>
	);
}
