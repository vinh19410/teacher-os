import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import {
	PLACEMENT_MAX_CLIPS,
	PLACEMENT_MAX_QUESTIONS,
	type PlacementAudioMeta,
	type PlacementContent,
	type PlacementPublishIssue,
	type PlacementTeacherStateResponse,
	placementContentSchema,
	validatePlacementForPublish,
} from "@teacher-os/api/placement-test-contracts";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { BandsEditor } from "@/components/placement-test/bands-editor";
import { ClipCard } from "@/components/placement-test/clip-card";
import {
	addBand,
	addClipQuestion,
	addListeningClip,
	addVgQuestion,
	countListeningQuestions,
	countTotalQuestions,
	moveClipQuestion,
	moveListeningClip,
	moveVgQuestion,
	removeBand,
	removeClipQuestion,
	removeListeningClip,
	removeVgQuestion,
	updateBand,
	updateClipQuestion,
	updateListeningClip,
	updateVgQuestion,
} from "@/components/placement-test/content-model";
import { PublishDialog } from "@/components/placement-test/publish-dialog";
import { QuestionCard } from "@/components/placement-test/question-card";
import { SeedEmptyState } from "@/components/placement-test/seed-empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHead } from "@/components/ui/page-head";
import { isHttpError } from "@/lib/kernel-load-state";
import { reauth } from "@/lib/reauth";
import {
	isPlacementHttpError,
	placementTestQueryKey,
	placementTestQueryOptions,
	publishPlacementTest,
	saveDraft,
	uploadAudio,
} from "@/lib/repos/placement-test";
import { useFinanceRouteGuard } from "@/lib/use-finance-route-guard";

export const Route = createFileRoute("/_auth/placement-test/")({
	component: PlacementTestRoute,
});

function createBlankContent(): PlacementContent {
	return {
		bands: [{ min: 0, max: 2, cefr: "A1", course: "ielts-foundation" }],
		parts: [
			{
				id: "vocab-grammar",
				title: "Vocab + Grammar",
				questions: [
					{
						id: "vg-01",
						kind: "grammar",
						level: "A1",
						prompt: "",
						options: ["", "", "", ""],
						answer: null,
					},
				],
			},
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-1",
						audioId: null,
						maxPlays: 2,
						level: "A2",
						title: "Đoạn nghe 1",
						questions: [
							{
								id: "l-01",
								level: "A2",
								prompt: "",
								options: ["", "", "", ""],
								answer: null,
							},
						],
					},
				],
			},
		],
	};
}

function scrollToFirstIssue(issues: readonly PlacementPublishIssue[]) {
	const first = issues[0];
	if (!first || typeof document === "undefined") return;
	const qMatch =
		/^(parts\.0\.questions\.\d+|parts\.1\.clips\.\d+\.questions\.\d+)/.exec(
			first.path,
		);
	if (qMatch) {
		const el = document.querySelector(`[data-question-path="${qMatch[1]}"]`);
		el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	const cMatch = /^(parts\.1\.clips\.\d+)/.exec(first.path);
	if (cMatch) {
		const el = document.querySelector(`[data-clip-path="${cMatch[1]}"]`);
		el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	if (first.path.startsWith("bands")) {
		const el = document.querySelector('[data-section="bands"]');
		el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
	}
}

export function PlacementTestRoute() {
	const canAccessFinance = useFinanceRouteGuard();
	const queryClient = useQueryClient();
	const query = useQuery({
		...placementTestQueryOptions(),
		enabled: canAccessFinance,
	});

	const [localDraft, setLocalDraft] = useState<PlacementContent | null>(null);
	const [savedDraftJson, setSavedDraftJson] = useState<string | null>(null);
	const [revision, setRevision] = useState(0);
	const [publishedVersion, setPublishedVersion] = useState(0);
	const [publishedAt, setPublishedAt] = useState<string | null>(null);
	const [serverDirty, setServerDirty] = useState(false);
	const [audioMap, setAudioMap] = useState<Record<string, PlacementAudioMeta>>(
		{},
	);
	const [hydratedFromServer, setHydratedFromServer] = useState(false);

	const [saving, setSaving] = useState(false);
	const [publishing, setPublishing] = useState(false);
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [conflictDetected, setConflictDetected] = useState(false);
	const [publishIssues, setPublishIssues] = useState<PlacementPublishIssue[]>(
		[],
	);

	const [importingSeed, setImportingSeed] = useState(false);
	const [seedProgress, setSeedProgress] = useState<string | null>(null);
	const [seedError, setSeedError] = useState<string | null>(null);

	useEffect(() => {
		if (query.error && isHttpError(query.error) && query.error.status === 401) {
			reauth();
		}
	}, [query.error]);

	const applyServerState = useCallback(
		(data: PlacementTeacherStateResponse) => {
			setLocalDraft(data.draft);
			setSavedDraftJson(data.draft ? JSON.stringify(data.draft) : null);
			setRevision(data.revision);
			setPublishedVersion(data.publishedVersion);
			setPublishedAt(data.publishedAt);
			setServerDirty(data.dirty);
			setAudioMap(data.audio ?? {});
			setHydratedFromServer(true);
		},
		[],
	);

	useEffect(() => {
		if (!query.data || query.isFetching || hydratedFromServer) return;
		applyServerState(query.data);
	}, [query.data, query.isFetching, hydratedFromServer, applyServerState]);

	const currentDraftJson = useMemo(
		() => (localDraft ? JSON.stringify(localDraft) : null),
		[localDraft],
	);
	const hasUnsavedChanges =
		hydratedFromServer &&
		localDraft !== null &&
		currentDraftJson !== savedDraftJson;
	const hasUnpublishedChanges = serverDirty || hasUnsavedChanges;

	useBlocker({
		shouldBlockFn: async () => {
			if (!hasUnsavedChanges) return false;
			return !window.confirm(
				"Còn thay đổi chưa lưu nháp. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?",
			);
		},
	});

	useEffect(() => {
		if (!hasUnsavedChanges) return;
		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => window.removeEventListener("beforeunload", onBeforeUnload);
	}, [hasUnsavedChanges]);

	if (!canAccessFinance) {
		return null;
	}

	const handleReloadAfterConflict = async () => {
		setConflictDetected(false);
		setPublishIssues([]);
		const res = await query.refetch();
		if (res.data) {
			applyServerState(res.data);
		}
	};

	const performSaveDraft = async (
		contentToSave: PlacementContent,
	): Promise<number | null> => {
		setSaving(true);
		setConflictDetected(false);
		try {
			const res = await saveDraft(revision, contentToSave);
			const nextJson = JSON.stringify(contentToSave);
			setRevision(res.revision);
			setSavedDraftJson(nextJson);
			setServerDirty(res.dirty);
			queryClient.setQueryData<PlacementTeacherStateResponse>(
				placementTestQueryKey,
				(prev) =>
					prev
						? {
								...prev,
								draft: contentToSave,
								revision: res.revision,
								dirty: res.dirty,
								audio: audioMap,
							}
						: prev,
			);
			toast.success("Đã lưu bản nháp.");
			return res.revision;
		} catch (error) {
			if (isHttpError(error) && error.status === 401) {
				reauth();
				return null;
			}
			if (isHttpError(error) && error.status === 409) {
				setConflictDetected(true);
				toast.error("Đề đã được sửa ở tab khác, tải lại để tiếp tục");
				return null;
			}
			toast.error(
				error instanceof Error ? error.message : "Lưu bản nháp thất bại.",
			);
			return null;
		} finally {
			setSaving(false);
		}
	};

	const handleRequestPublish = async () => {
		if (!localDraft) return;
		let activeRevision = revision;
		if (hasUnsavedChanges || revision === 0) {
			const savedRev = await performSaveDraft(localDraft);
			if (savedRev === null) return;
			activeRevision = savedRev;
		}

		const clientIssues = validatePlacementForPublish(localDraft);
		if (clientIssues.length > 0) {
			setPublishIssues(clientIssues);
			toast.error(
				`Chưa thể phát hành: còn ${clientIssues.length} lỗi cần kiểm tra.`,
			);
			scrollToFirstIssue(clientIssues);
			return;
		}

		setPublishIssues([]);
		setRevision(activeRevision);
		setConfirmOpen(true);
	};

	const handleConfirmPublish = async () => {
		setPublishing(true);
		try {
			const res = await publishPlacementTest(revision);
			setPublishedVersion(res.publishedVersion);
			setPublishedAt(res.publishedAt);
			setRevision(res.revision);
			setServerDirty(false);
			setPublishIssues([]);
			setConfirmOpen(false);
			toast.success(`Đã phát hành bộ đề v${res.publishedVersion}.`);
			await queryClient.invalidateQueries({ queryKey: placementTestQueryKey });
		} catch (error) {
			setConfirmOpen(false);
			if (isHttpError(error) && error.status === 401) {
				reauth();
				return;
			}
			if (isHttpError(error) && error.status === 409) {
				setConflictDetected(true);
				toast.error("Đề đã được sửa ở tab khác, tải lại để tiếp tục");
				return;
			}
			if (isPlacementHttpError(error) && error.status === 422 && error.issues) {
				setPublishIssues(error.issues);
				toast.error(
					`Phát hành bị từ chối (${error.issues.length} lỗi nội dung).`,
				);
				scrollToFirstIssue(error.issues);
				return;
			}
			toast.error(
				error instanceof Error ? error.message : "Phát hành bộ đề thất bại.",
			);
		} finally {
			setPublishing(false);
		}
	};

	const handleImportSeed = async () => {
		setImportingSeed(true);
		setSeedError(null);
		setSeedProgress("Đang tải đề gốc...");
		try {
			const seedRes = await fetch("/placement-seed/questions.json", {
				cache: "no-cache",
			});
			if (!seedRes.ok) {
				throw new Error(
					`Không tải được đề gốc (HTTP ${seedRes.status}). Vui lòng thử lại.`,
				);
			}
			const rawSeed = await seedRes.json();
			const content = placementContentSchema.parse(rawSeed);
			const nextAudioMap: Record<string, PlacementAudioMeta> = { ...audioMap };

			const clips = content.parts[1].clips;
			for (let idx = 0; idx < clips.length; idx += 1) {
				const clip = clips[idx]!;
				setSeedProgress(
					`Đang tải audio ${idx + 1}/${clips.length} (${clip.id}.mp3)...`,
				);
				const audioRes = await fetch(`/placement-seed/${clip.id}.mp3`);
				if (!audioRes.ok) {
					throw new Error(
						`Không tải được file âm thanh mẫu ${clip.id}.mp3 (HTTP ${audioRes.status}).`,
					);
				}
				const blob = await audioRes.blob();
				const uploaded = await uploadAudio({
					file: blob,
					fileName: `${clip.id}.mp3`,
					type: "audio/mpeg",
				});
				clip.audioId = uploaded.audioId;
				nextAudioMap[uploaded.audioId] = {
					name: uploaded.name,
					size: uploaded.size,
					type: uploaded.type,
				};
			}

			setSeedProgress("Đang lưu bản nháp...");
			const saved = await saveDraft(revision, content);
			const contentJson = JSON.stringify(content);
			setAudioMap(nextAudioMap);
			setLocalDraft(content);
			setSavedDraftJson(contentJson);
			setRevision(saved.revision);
			setServerDirty(saved.dirty);
			queryClient.setQueryData<PlacementTeacherStateResponse>(
				placementTestQueryKey,
				(prev) =>
					prev
						? {
								...prev,
								draft: content,
								revision: saved.revision,
								dirty: saved.dirty,
								audio: nextAudioMap,
							}
						: prev,
			);
			toast.success("Đã nhập đề gốc (30 câu, 5 đoạn nghe).");
			await queryClient.invalidateQueries({ queryKey: placementTestQueryKey });
		} catch (error) {
			if (isHttpError(error) && error.status === 409) {
				setConflictDetected(true);
				setSeedError("Đề đã được sửa ở tab khác, tải lại để tiếp tục");
				return;
			}
			setSeedError(
				error instanceof Error
					? error.message
					: "Nhập đề gốc thất bại. Vui lòng thử lại.",
			);
		} finally {
			setImportingSeed(false);
			setSeedProgress(null);
		}
	};

	const totalQuestions = localDraft ? countTotalQuestions(localDraft) : 0;
	const vgCount = localDraft ? localDraft.parts[0].questions.length : 0;
	const listeningCount = localDraft ? countListeningQuestions(localDraft) : 0;
	const clipCount = localDraft ? localDraft.parts[1].clips.length : 0;

	const publishStatusText =
		publishedVersion > 0
			? `Đã phát hành v${publishedVersion}${publishedAt ? ` lúc ${fmtWhen(publishedAt)}` : ""}`
			: "Chưa phát hành";

	let runningListeningQuestionNumber = vgCount + 1;

	return (
		<div className="space-y-6">
			<PageHead
				title="Bài test đầu vào"
				kicker={
					<span className="inline-flex flex-wrap items-center gap-2 text-sm">
						<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
							<CheckCircle2 className="size-4 text-muted-foreground" />
							{publishStatusText}
						</span>
						{hasUnpublishedChanges && (
							<span className="rounded-md bg-muted px-2 py-0.5 font-medium text-foreground text-xs">
								Có thay đổi chưa phát hành
							</span>
						)}
						{hasUnsavedChanges && (
							<span className="rounded-md bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs">
								Có thay đổi chưa lưu
							</span>
						)}
					</span>
				}
				lead="Soạn câu hỏi Ngữ pháp, Từ vựng, đoạn nghe Listening và bảng quy đổi CEFR cho trang /kiem-tra-dau-vao/."
				action={
					localDraft ? (
						<>
							<Button
								variant="outline"
								disabled={!hasUnsavedChanges || saving || publishing}
								onClick={() => void performSaveDraft(localDraft)}
								data-testid="save-draft-btn"
							>
								{saving ? "Đang lưu..." : "Lưu nháp"}
							</Button>
							<Button
								variant="primary"
								disabled={saving || publishing}
								onClick={() => void handleRequestPublish()}
								data-testid="publish-btn"
							>
								{publishing ? "Đang phát hành..." : "Phát hành"}
							</Button>
						</>
					) : undefined
				}
			/>

			{query.data && !query.data.isLeadOrg && (
				<div
					role="status"
					className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/60 px-4 py-3 text-foreground text-sm"
				>
					<AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
					<div>
						<strong>Lưu ý cấu hình tổ chức:</strong> Tổ chức hiện tại không
						trùng với <code className="font-mono text-xs">LEAD_ORG_ID</code> của
						trang giới thiệu công khai. Đề phát hành ở tổ chức này sẽ chưa hiển
						thị trên{" "}
						<code className="font-mono text-xs">/kiem-tra-dau-vao/</code>.
					</div>
				</div>
			)}

			{conflictDetected && (
				<div
					role="alert"
					className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
				>
					<span>Đề đã được sửa ở tab khác, tải lại để tiếp tục</span>
					<Button
						variant="outline"
						size="sm"
						onClick={() => void handleReloadAfterConflict()}
					>
						<RefreshCw className="size-3.5" />
						Tải lại bộ đề
					</Button>
				</div>
			)}

			{publishIssues.length > 0 && (
				<Card
					role="alert"
					data-testid="publish-issues-banner"
					className="border-destructive/50 bg-destructive/5"
				>
					<h2 className="font-semibold text-destructive text-sm">
						Không thể phát hành — vui lòng sửa {publishIssues.length} lỗi sau:
					</h2>
					<ul className="mt-2 list-disc space-y-1 pl-5 text-destructive text-xs">
						{publishIssues.map((issue) => (
							<li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
						))}
					</ul>
				</Card>
			)}

			{query.isLoading && (
				<Card>
					<p className="text-muted-foreground text-sm">
						Đang tải bộ đề kiểm tra đầu vào...
					</p>
				</Card>
			)}

			{query.isError && !conflictDetected && (
				<Card role="alert">
					<p className="text-destructive text-sm">
						{query.error instanceof Error
							? query.error.message
							: "Không thể tải bộ đề kiểm tra đầu vào."}
					</p>
				</Card>
			)}

			{hydratedFromServer && localDraft === null && (
				<SeedEmptyState
					importing={importingSeed}
					progressLabel={seedProgress}
					errorMessage={seedError}
					onImportSeed={() => void handleImportSeed()}
					onStartBlank={() => {
						setLocalDraft(createBlankContent());
						setPublishIssues([]);
					}}
				/>
			)}

			{localDraft && (
				<div className="space-y-6">
					<Card className="flex flex-col gap-4">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 className="font-semibold text-foreground text-lg">
									Phần 1: Ngữ pháp & Từ vựng (Vocab + Grammar)
								</h2>
								<p className="text-muted-foreground text-sm">
									Hiện có <strong>{vgCount}</strong> câu hỏi trắc nghiệm 4 lựa
									chọn.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={totalQuestions >= PLACEMENT_MAX_QUESTIONS}
								onClick={() =>
									setLocalDraft((prev) => (prev ? addVgQuestion(prev) : prev))
								}
							>
								<Plus className="size-3.5" />
								Thêm câu hỏi Phần 1
							</Button>
						</div>

						<div className="space-y-3">
							{localDraft.parts[0].questions.map((question, qIdx) => (
								<QuestionCard
									key={question.id}
									question={question}
									displayNumber={qIdx + 1}
									basePath={`parts.0.questions.${qIdx}`}
									canMoveUp={qIdx > 0}
									canMoveDown={qIdx < localDraft.parts[0].questions.length - 1}
									canRemove={localDraft.parts[0].questions.length > 1}
									showKindSelector
									issues={publishIssues}
									onChange={(patch) =>
										setLocalDraft((prev) =>
											prev ? updateVgQuestion(prev, qIdx, patch) : prev,
										)
									}
									onMoveUp={() =>
										setLocalDraft((prev) =>
											prev ? moveVgQuestion(prev, qIdx, qIdx - 1) : prev,
										)
									}
									onMoveDown={() =>
										setLocalDraft((prev) =>
											prev ? moveVgQuestion(prev, qIdx, qIdx + 1) : prev,
										)
									}
									onRemove={() =>
										setLocalDraft((prev) =>
											prev ? removeVgQuestion(prev, qIdx) : prev,
										)
									}
								/>
							))}
						</div>
					</Card>

					<div className="space-y-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 className="font-semibold text-foreground text-lg">
									Phần 2: Nghe hiểu (Listening)
								</h2>
								<p className="text-muted-foreground text-sm">
									Hiện có <strong>{clipCount}</strong> đoạn nghe •{" "}
									<strong>{listeningCount}</strong> câu hỏi.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								disabled={
									clipCount >= PLACEMENT_MAX_CLIPS ||
									totalQuestions >= PLACEMENT_MAX_QUESTIONS
								}
								onClick={() =>
									setLocalDraft((prev) =>
										prev ? addListeningClip(prev) : prev,
									)
								}
							>
								<Plus className="size-3.5" />
								Thêm đoạn nghe
							</Button>
						</div>

						{localDraft.parts[1].clips.map((clip, cIdx) => {
							const clipStartNumber = runningListeningQuestionNumber;
							runningListeningQuestionNumber += clip.questions.length;
							return (
								<ClipCard
									key={clip.id}
									clip={clip}
									clipIndex={cIdx}
									startQuestionNumber={clipStartNumber}
									canMoveUp={cIdx > 0}
									canMoveDown={cIdx < localDraft.parts[1].clips.length - 1}
									canRemove={localDraft.parts[1].clips.length > 1}
									audioMap={audioMap}
									issues={publishIssues}
									onUpdateClip={(patch) =>
										setLocalDraft((prev) =>
											prev ? updateListeningClip(prev, cIdx, patch) : prev,
										)
									}
									onMoveUp={() =>
										setLocalDraft((prev) =>
											prev ? moveListeningClip(prev, cIdx, cIdx - 1) : prev,
										)
									}
									onMoveDown={() =>
										setLocalDraft((prev) =>
											prev ? moveListeningClip(prev, cIdx, cIdx + 1) : prev,
										)
									}
									onRemove={() =>
										setLocalDraft((prev) =>
											prev ? removeListeningClip(prev, cIdx) : prev,
										)
									}
									onAudioUploaded={(uploaded) => {
										setAudioMap((prev) => ({
											...prev,
											[uploaded.audioId]: {
												name: uploaded.name,
												size: uploaded.size,
												type: uploaded.type,
											},
										}));
										setLocalDraft((prev) =>
											prev
												? updateListeningClip(prev, cIdx, {
														audioId: uploaded.audioId,
													})
												: prev,
										);
									}}
									onAddQuestion={() =>
										setLocalDraft((prev) =>
											prev ? addClipQuestion(prev, cIdx) : prev,
										)
									}
									onUpdateQuestion={(qIdx, patch) =>
										setLocalDraft((prev) =>
											prev ? updateClipQuestion(prev, cIdx, qIdx, patch) : prev,
										)
									}
									onMoveQuestion={(fromIdx, toIdx) =>
										setLocalDraft((prev) =>
											prev
												? moveClipQuestion(prev, cIdx, fromIdx, toIdx)
												: prev,
										)
									}
									onRemoveQuestion={(qIdx) =>
										setLocalDraft((prev) =>
											prev ? removeClipQuestion(prev, cIdx, qIdx) : prev,
										)
									}
								/>
							);
						})}
					</div>

					<BandsEditor
						bands={localDraft.bands}
						totalQuestions={totalQuestions}
						issues={publishIssues}
						onUpdateBand={(bIdx, patch) =>
							setLocalDraft((prev) =>
								prev ? updateBand(prev, bIdx, patch) : prev,
							)
						}
						onAddBand={() =>
							setLocalDraft((prev) => (prev ? addBand(prev) : prev))
						}
						onRemoveBand={(bIdx) =>
							setLocalDraft((prev) => (prev ? removeBand(prev, bIdx) : prev))
						}
					/>
				</div>
			)}

			<PublishDialog
				open={confirmOpen}
				totalQuestions={totalQuestions}
				vgCount={vgCount}
				listeningCount={listeningCount}
				clipCount={clipCount}
				nextVersion={publishedVersion + 1}
				publishing={publishing}
				onClose={() => setConfirmOpen(false)}
				onConfirm={() => void handleConfirmPublish()}
			/>
		</div>
	);
}
