import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import {
	PLACEMENT_MAX_CLIPS,
	PLACEMENT_MAX_PASSAGES,
	PLACEMENT_MAX_QUESTIONS,
	type PlacementAudioMeta,
	type PlacementContent,
	type PlacementPublishIssue,
	type PlacementTeacherStateResponse,
	placementContentSchema,
	validatePlacementForPublish,
} from "@teacher-os/api/placement-test-contracts";
import {
	AlertTriangle,
	CheckCircle2,
	Plus,
	RefreshCw,
	RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { fmtWhen } from "@/components/assignments/assignment-status";
import { BandsEditor } from "@/components/placement-test/bands-editor";
import { ClipCard } from "@/components/placement-test/clip-card";
import {
	addBand,
	addClipQuestion,
	addListeningClip,
	addReadingPassage,
	addReadingQuestion,
	addSpeakingTask,
	addVgQuestion,
	convertClipQuestionType,
	countListeningQuestions,
	countReadingQuestions,
	countTotalQuestions,
	countVgQuestions,
	moveClipQuestion,
	moveListeningClip,
	moveReadingPassage,
	moveReadingQuestion,
	moveSpeakingTask,
	moveVgQuestion,
	removeBand,
	removeClipQuestion,
	removeListeningClip,
	removeReadingPassage,
	removeReadingQuestion,
	removeSpeakingTask,
	removeVgQuestion,
	updateBand,
	updateClipQuestion,
	updateListeningClip,
	updateReadingPassage,
	updateReadingQuestion,
	updateSpeakingTask,
	updateVgQuestion,
	updateWritingPart,
} from "@/components/placement-test/content-model";
import { PublishDialog } from "@/components/placement-test/publish-dialog";
import { QuestionCard } from "@/components/placement-test/question-card";
import { ReadingPassageCard } from "@/components/placement-test/reading-passage-card";
import { SeedEmptyState } from "@/components/placement-test/seed-empty-state";
import {
	SpeakingEditorSection,
	WritingEditorCard,
} from "@/components/placement-test/writing-speaking-editor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHead } from "@/components/ui/page-head";
import { Tabs } from "@/components/ui/tabs";
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

type SkillTabId =
	| "listening"
	| "vocab-grammar"
	| "reading"
	| "writing"
	| "speaking";

function createBlankContent(): PlacementContent {
	return {
		bands: [
			{
				min: 0,
				max: 100,
				cefr: "A1",
				course: "foundation-core",
				displayCourse: "Xây Nền Từ Gốc",
				advice: "",
			},
		],
		parts: [
			{
				id: "listening",
				title: "Listening",
				clips: [
					{
						id: "clip-1",
						partLabel: "Part A",
						instruction: "",
						title: "Đoạn nghe 1",
						notesTitle: "",
						transcript: "",
						audioId: null,
						maxPlays: 2,
						level: "A2",
						questions: [
							{
								id: "l-01",
								type: "mcq",
								level: "A2",
								prompt: "",
								options: ["", "", "", ""],
								answer: null,
							},
						],
					},
				],
			},
			{
				id: "vocab-grammar",
				title: "Grammar & Vocabulary",
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
				id: "reading",
				title: "Reading",
				passages: [
					{
						id: "p-1",
						partLabel: "Part 3A",
						kind: "passage",
						instruction: "",
						title: "Bài đọc 1",
						body: "",
						questions: [
							{
								id: "r-01",
								level: "B1",
								prompt: "",
								options: ["", "", "", ""],
								answer: null,
							},
						],
					},
				],
			},
			{
				id: "writing",
				title: "Writing",
				promptTitle: "",
				promptBody: "",
				minWords: 50,
				maxWords: 80,
			},
			{
				id: "speaking",
				title: "Speaking",
				tasks: [
					{
						id: "s-01",
						partLabel: "Câu 1",
						level: "A2",
						prompt: "",
						prepSeconds: 10,
						answerSeconds: 30,
					},
				],
			},
		],
	};
}

function issueTabForPath(path: string): SkillTabId | null {
	if (path.startsWith("parts.0")) return "listening";
	if (path.startsWith("parts.1")) return "vocab-grammar";
	if (path.startsWith("parts.2")) return "reading";
	if (path.startsWith("parts.3")) return "writing";
	if (path.startsWith("parts.4")) return "speaking";
	return null;
}

function scrollIssueIntoView(path: string) {
	if (typeof document === "undefined") return;
	const qMatch =
		/^(parts\.0\.clips\.\d+\.questions\.\d+|parts\.1\.questions\.\d+|parts\.2\.passages\.\d+\.questions\.\d+)/.exec(
			path,
		);
	if (qMatch) {
		document
			.querySelector(`[data-question-path="${qMatch[1]}"]`)
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	const cMatch = /^(parts\.0\.clips\.\d+)/.exec(path);
	if (cMatch) {
		document
			.querySelector(`[data-clip-path="${cMatch[1]}"]`)
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	const pMatch = /^(parts\.2\.passages\.\d+)/.exec(path);
	if (pMatch) {
		document
			.querySelector(`[data-passage-path="${pMatch[1]}"]`)
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	const sMatch = /^(parts\.4\.tasks\.\d+)/.exec(path);
	if (sMatch) {
		document
			.querySelector(`[data-speaking-path="${sMatch[1]}"]`)
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	if (path.startsWith("parts.3")) {
		document
			.querySelector('[data-section="writing"]')
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	if (path.startsWith("parts.4")) {
		document
			.querySelector('[data-section="speaking"]')
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
		return;
	}
	if (path.startsWith("bands")) {
		document
			.querySelector('[data-section="bands"]')
			?.scrollIntoView?.({ behavior: "smooth", block: "center" });
	}
}

export function PlacementTestRoute() {
	const canAccessFinance = useFinanceRouteGuard();
	const queryClient = useQueryClient();
	const query = useQuery({
		...placementTestQueryOptions(),
		enabled: canAccessFinance,
	});

	const [activeTab, setActiveTab] = useState<SkillTabId>("listening");
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
	const [reimportConfirmOpen, setReimportConfirmOpen] = useState(false);
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

	const focusFirstIssue = (issues: readonly PlacementPublishIssue[]) => {
		const first = issues[0];
		if (!first) return;
		const targetTab = issueTabForPath(first.path);
		if (targetTab && targetTab !== activeTab) {
			setActiveTab(targetTab);
			requestAnimationFrame(() => scrollIssueIntoView(first.path));
			return;
		}
		scrollIssueIntoView(first.path);
	};

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
			focusFirstIssue(clientIssues);
			return;
		}

		setPublishIssues([]);
		setRevision(activeRevision);
		setConfirmOpen(true);
	};

	const executePublish = async (
		targetRevision: number,
		onSuccessToast?: (version: number) => string,
	) => {
		setPublishing(true);
		setConflictDetected(false);
		try {
			const res = await publishPlacementTest(targetRevision);
			setPublishedVersion(res.publishedVersion);
			setPublishedAt(res.publishedAt);
			setRevision(res.revision);
			setServerDirty(false);
			setPublishIssues([]);
			setConfirmOpen(false);
			toast.success(
				onSuccessToast
					? onSuccessToast(res.publishedVersion)
					: `Đã phát hành bộ đề v${res.publishedVersion}.`,
			);
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
				focusFirstIssue(error.issues);
				return;
			}
			toast.error(
				error instanceof Error ? error.message : "Phát hành bộ đề thất bại.",
			);
		} finally {
			setPublishing(false);
		}
	};

	const handleConfirmPublish = () => executePublish(revision);

	const handleImportSeed = async (options?: { publishAfter?: boolean }) => {
		setImportingSeed(true);
		setSeedError(null);
		setConflictDetected(false);
		setReimportConfirmOpen(false);
		setSeedProgress("Đang tải đề gốc 5 kỹ năng...");
		try {
			const assetBase = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
			const seedRes = await fetch(`${assetBase}placement-seed/questions.json`, {
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

			const clips = content.parts[0].clips;
			for (let idx = 0; idx < clips.length; idx += 1) {
				const clip = clips[idx]!;
				setSeedProgress(
					`Đang tải audio ${idx + 1}/${clips.length} (${clip.id}.mp3)...`,
				);
				const audioRes = await fetch(
					`${assetBase}placement-seed/${clip.id}.mp3`,
				);
				if (!audioRes.ok) {
					throw new Error(
						`Không tải được file audio mẫu ${clip.id}.mp3 (HTTP ${audioRes.status}).`,
					);
				}
				const blob = await audioRes.blob();
				const fileName = `${clip.id}.mp3`;
				const file = new File([blob], fileName, {
					type: blob.type || "audio/mpeg",
				});
				setSeedProgress(
					`Đang upload audio ${idx + 1}/${clips.length} (${fileName})...`,
				);
				const uploaded = await uploadAudio({
					file,
					fileName,
					type: file.type || "audio/mpeg",
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
			setAudioMap(nextAudioMap);
			setLocalDraft(content);
			setSavedDraftJson(JSON.stringify(content));
			setRevision(saved.revision);
			setServerDirty(saved.dirty);
			setPublishIssues([]);
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

			if (options?.publishAfter) {
				const clientIssues = validatePlacementForPublish(content);
				if (clientIssues.length > 0) {
					setPublishIssues(clientIssues);
					toast.error(
						`Đã lưu nháp đề gốc nhưng chưa thể phát hành: còn ${clientIssues.length} lỗi cần kiểm tra.`,
					);
					focusFirstIssue(clientIssues);
					await queryClient.invalidateQueries({
						queryKey: placementTestQueryKey,
					});
					return;
				}
				setSeedProgress("Đang phát hành bộ đề...");
				await executePublish(
					saved.revision,
					(version) => `Đã nhập đề gốc và phát hành bộ đề v${version}.`,
				);
				return;
			}

			toast.success(
				"Đã nhập đề gốc 5 kỹ năng (40 câu, Writing & Speaking, 6 đoạn nghe).",
			);
			await queryClient.invalidateQueries({ queryKey: placementTestQueryKey });
		} catch (error) {
			if (isHttpError(error) && error.status === 401) {
				reauth();
				return;
			}
			if (isHttpError(error) && error.status === 409) {
				setConflictDetected(true);
				const msg = "Đề đã được sửa ở tab khác, tải lại để tiếp tục";
				setSeedError(msg);
				toast.error(msg);
				return;
			}
			const msg =
				error instanceof Error
					? error.message
					: "Nhập đề gốc thất bại. Vui lòng thử lại.";
			setSeedError(msg);
			toast.error(msg);
		} finally {
			setImportingSeed(false);
			setSeedProgress(null);
		}
	};

	const listeningCount = localDraft ? countListeningQuestions(localDraft) : 0;
	const vgCount = localDraft ? countVgQuestions(localDraft) : 0;
	const readingCount = localDraft ? countReadingQuestions(localDraft) : 0;
	const totalQuestions = localDraft ? countTotalQuestions(localDraft) : 0;
	const clipCount = localDraft ? localDraft.parts[0].clips.length : 0;
	const passageCount = localDraft ? localDraft.parts[2].passages.length : 0;
	const speakingCount = localDraft ? localDraft.parts[4].tasks.length : 0;

	const publishStatusText =
		publishedVersion > 0
			? `Đã phát hành v${publishedVersion}${publishedAt ? ` lúc ${fmtWhen(publishedAt)}` : ""}`
			: "Chưa phát hành";

	let runningListeningNumber = 1;
	const vgStartNumber = listeningCount + 1;
	let runningReadingNumber = listeningCount + vgCount + 1;

	const issueCountsByTab = useMemo(() => {
		const counts: Record<SkillTabId, number> = {
			listening: 0,
			"vocab-grammar": 0,
			reading: 0,
			writing: 0,
			speaking: 0,
		};
		for (const issue of publishIssues) {
			const tab = issueTabForPath(issue.path);
			if (tab) counts[tab] += 1;
		}
		return counts;
	}, [publishIssues]);

	const formatTabLabel = (base: string, tab: SkillTabId) => {
		const errCount = issueCountsByTab[tab];
		return errCount > 0 ? `${base} (${errCount} lỗi)` : base;
	};

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
				lead="Soạn đề 5 kỹ năng (Listening, Grammar & Vocab, Reading, Writing, Speaking) và bảng quy đổi CEFR (%) cho trang /kiem-tra-dau-vao/."
				action={
					localDraft ? (
						<div className="flex flex-wrap items-center gap-2">
							<Button
								variant="outline"
								disabled={saving || publishing || importingSeed}
								onClick={() => setReimportConfirmOpen(true)}
								data-testid="reimport-seed-btn"
							>
								<RotateCcw className="size-3.5" />
								{importingSeed
									? (seedProgress ?? "Đang nhập đề gốc...")
									: "Nhập lại đề gốc mẫu"}
							</Button>
							<Button
								variant="outline"
								disabled={
									!hasUnsavedChanges || saving || publishing || importingSeed
								}
								onClick={() => void performSaveDraft(localDraft)}
								data-testid="save-draft-btn"
							>
								{saving ? "Đang lưu..." : "Lưu nháp"}
							</Button>
							<Button
								variant="primary"
								disabled={saving || publishing || importingSeed}
								onClick={() => void handleRequestPublish()}
								data-testid="publish-btn"
							>
								{publishing ? "Đang phát hành..." : "Phát hành"}
							</Button>
						</div>
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

			{seedError && localDraft !== null && (
				<div
					role="alert"
					className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-destructive text-sm"
				>
					{seedError}
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
					<Tabs
						active={activeTab}
						onChange={(id) => setActiveTab(id as SkillTabId)}
						className="mb-0"
						tabs={[
							{
								id: "listening",
								label: formatTabLabel(
									`1. Listening (${listeningCount})`,
									"listening",
								),
							},
							{
								id: "vocab-grammar",
								label: formatTabLabel(
									`2. Grammar & Vocab (${vgCount})`,
									"vocab-grammar",
								),
							},
							{
								id: "reading",
								label: formatTabLabel(
									`3. Reading (${readingCount})`,
									"reading",
								),
							},
							{
								id: "writing",
								label: formatTabLabel("4. Writing", "writing"),
							},
							{
								id: "speaking",
								label: formatTabLabel(
									`5. Speaking (${speakingCount})`,
									"speaking",
								),
							},
						]}
					/>

					{activeTab === "listening" && (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-foreground text-lg">
										Phần 1: Nghe hiểu (Listening)
									</h2>
									<p className="text-muted-foreground text-sm">
										Hiện có <strong>{clipCount}</strong> đoạn nghe •{" "}
										<strong>{listeningCount}</strong> câu hỏi (trắc nghiệm &
										điền từ).
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

							{localDraft.parts[0].clips.map((clip, cIdx) => {
								const clipStartNumber = runningListeningNumber;
								runningListeningNumber += clip.questions.length;
								return (
									<ClipCard
										key={clip.id}
										clip={clip}
										clipIndex={cIdx}
										startQuestionNumber={clipStartNumber}
										canMoveUp={cIdx > 0}
										canMoveDown={cIdx < localDraft.parts[0].clips.length - 1}
										canRemove={localDraft.parts[0].clips.length > 1}
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
										onAddQuestion={(qType) =>
											setLocalDraft((prev) =>
												prev ? addClipQuestion(prev, cIdx, qType) : prev,
											)
										}
										onUpdateQuestion={(qIdx, patch) =>
											setLocalDraft((prev) =>
												prev
													? updateClipQuestion(prev, cIdx, qIdx, patch)
													: prev,
											)
										}
										onConvertQuestionType={(qIdx, nextType) =>
											setLocalDraft((prev) =>
												prev
													? convertClipQuestionType(prev, cIdx, qIdx, nextType)
													: prev,
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
					)}

					{activeTab === "vocab-grammar" && (
						<Card className="flex flex-col gap-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h2 className="font-semibold text-foreground text-lg">
										Phần 2: Ngữ pháp & Từ vựng (Grammar & Vocabulary)
									</h2>
									<p className="text-muted-foreground text-sm">
										Hiện có <strong>{vgCount}</strong> câu hỏi trắc nghiệm.
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
									Thêm câu hỏi G&V
								</Button>
							</div>

							<div className="space-y-3">
								{localDraft.parts[1].questions.map((question, qIdx) => (
									<QuestionCard
										key={question.id}
										question={question}
										displayNumber={vgStartNumber + qIdx}
										basePath={`parts.1.questions.${qIdx}`}
										canMoveUp={qIdx > 0}
										canMoveDown={
											qIdx < localDraft.parts[1].questions.length - 1
										}
										canRemove={localDraft.parts[1].questions.length > 1}
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
					)}

					{activeTab === "reading" && (
						<div className="space-y-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2 className="font-semibold text-foreground text-lg">
										Phần 3: Đọc hiểu (Reading)
									</h2>
									<p className="text-muted-foreground text-sm">
										Hiện có <strong>{passageCount}</strong> bài đọc •{" "}
										<strong>{readingCount}</strong> câu hỏi.
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									disabled={
										passageCount >= PLACEMENT_MAX_PASSAGES ||
										totalQuestions >= PLACEMENT_MAX_QUESTIONS
									}
									onClick={() =>
										setLocalDraft((prev) =>
											prev ? addReadingPassage(prev) : prev,
										)
									}
								>
									<Plus className="size-3.5" />
									Thêm bài đọc
								</Button>
							</div>

							{localDraft.parts[2].passages.map((passage, pIdx) => {
								const pStart = runningReadingNumber;
								runningReadingNumber += passage.questions.length;
								return (
									<ReadingPassageCard
										key={passage.id}
										passage={passage}
										passageIndex={pIdx}
										startQuestionNumber={pStart}
										canMoveUp={pIdx > 0}
										canMoveDown={pIdx < localDraft.parts[2].passages.length - 1}
										canRemove={localDraft.parts[2].passages.length > 1}
										issues={publishIssues}
										onUpdatePassage={(patch) =>
											setLocalDraft((prev) =>
												prev ? updateReadingPassage(prev, pIdx, patch) : prev,
											)
										}
										onMoveUp={() =>
											setLocalDraft((prev) =>
												prev ? moveReadingPassage(prev, pIdx, pIdx - 1) : prev,
											)
										}
										onMoveDown={() =>
											setLocalDraft((prev) =>
												prev ? moveReadingPassage(prev, pIdx, pIdx + 1) : prev,
											)
										}
										onRemove={() =>
											setLocalDraft((prev) =>
												prev ? removeReadingPassage(prev, pIdx) : prev,
											)
										}
										onAddQuestion={() =>
											setLocalDraft((prev) =>
												prev ? addReadingQuestion(prev, pIdx) : prev,
											)
										}
										onUpdateQuestion={(qIdx, patch) =>
											setLocalDraft((prev) =>
												prev
													? updateReadingQuestion(prev, pIdx, qIdx, patch)
													: prev,
											)
										}
										onMoveQuestion={(fromIdx, toIdx) =>
											setLocalDraft((prev) =>
												prev
													? moveReadingQuestion(prev, pIdx, fromIdx, toIdx)
													: prev,
											)
										}
										onRemoveQuestion={(qIdx) =>
											setLocalDraft((prev) =>
												prev ? removeReadingQuestion(prev, pIdx, qIdx) : prev,
											)
										}
									/>
								);
							})}
						</div>
					)}

					{activeTab === "writing" && (
						<WritingEditorCard
							writing={localDraft.parts[3]}
							issues={publishIssues}
							onChange={(patch) =>
								setLocalDraft((prev) =>
									prev ? updateWritingPart(prev, patch) : prev,
								)
							}
						/>
					)}

					{activeTab === "speaking" && (
						<SpeakingEditorSection
							tasks={localDraft.parts[4].tasks}
							issues={publishIssues}
							audioMap={audioMap}
							onAddTask={() =>
								setLocalDraft((prev) => (prev ? addSpeakingTask(prev) : prev))
							}
							onUpdateTask={(tIdx, patch) =>
								setLocalDraft((prev) =>
									prev ? updateSpeakingTask(prev, tIdx, patch) : prev,
								)
							}
							onMoveTask={(fromIdx, toIdx) =>
								setLocalDraft((prev) =>
									prev ? moveSpeakingTask(prev, fromIdx, toIdx) : prev,
								)
							}
							onRemoveTask={(tIdx) =>
								setLocalDraft((prev) =>
									prev ? removeSpeakingTask(prev, tIdx) : prev,
								)
							}
							onTaskAudioUploaded={(tIdx, uploaded) => {
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
										? updateSpeakingTask(prev, tIdx, {
												audioId: uploaded.audioId,
											})
										: prev,
								);
							}}
							onTaskAudioCleared={(tIdx) =>
								setLocalDraft((prev) =>
									prev
										? updateSpeakingTask(prev, tIdx, { audioId: null })
										: prev,
								)
							}
						/>
					)}

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
				listeningCount={listeningCount}
				clipCount={clipCount}
				vgCount={vgCount}
				readingCount={readingCount}
				passageCount={passageCount}
				speakingCount={speakingCount}
				nextVersion={publishedVersion + 1}
				publishing={publishing}
				onClose={() => setConfirmOpen(false)}
				onConfirm={() => void handleConfirmPublish()}
			/>

			<Modal
				open={reimportConfirmOpen}
				onClose={() => {
					if (!importingSeed && !publishing) setReimportConfirmOpen(false);
				}}
				title="Xác nhận nhập lại đề gốc mẫu"
				footer={
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							variant="outline"
							disabled={importingSeed || publishing}
							onClick={() => setReimportConfirmOpen(false)}
						>
							Hủy
						</Button>
						<Button
							variant="outline"
							disabled={importingSeed || publishing}
							onClick={() => void handleImportSeed()}
							data-testid="confirm-reimport-btn"
						>
							{importingSeed
								? (seedProgress ?? "Đang nhập...")
								: "Xác nhận ghi đè bản nháp"}
						</Button>
						<Button
							variant="primary"
							disabled={importingSeed || publishing}
							onClick={() => void handleImportSeed({ publishAfter: true })}
							data-testid="confirm-reimport-publish-btn"
						>
							{importingSeed || publishing
								? (seedProgress ?? "Đang xử lý...")
								: "Nhập lại & Phát hành ngay"}
						</Button>
					</div>
				}
			>
				<p className="text-muted-foreground text-sm leading-relaxed">
					Thao tác này sẽ thay thế toàn bộ câu hỏi và file âm thanh trong bản
					nháp hiện tại bằng bộ đề gốc 5 kỹ năng (40 câu + Writing + Speaking, 6
					audio giọng chuẩn (en-GB)) rồi lưu lại ngay. Bạn có thể chỉ lưu bản
					nháp để chỉnh sửa tiếp hoặc chọn{" "}
					<strong className="text-foreground">
						Nhập lại &amp; Phát hành ngay
					</strong>{" "}
					để cập nhật thẳng lên trang công khai.
				</p>
			</Modal>
		</div>
	);
}
