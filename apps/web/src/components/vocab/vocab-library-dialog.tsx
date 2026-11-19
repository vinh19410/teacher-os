import type {
	VocabLibraryCourse,
	VocabLibraryDeck,
} from "@teacher-os/api/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { useData } from "@/lib/data-store";
import { getApiBaseUrl } from "@/lib/repos/api-base-url";
import {
	MAX_VOCAB_CLONE_DECKS_PER_BATCH,
	MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH,
	splitVocabCloneBatches,
} from "./vocab-clone-batches";
import { VocabTeacherDecksTab } from "./vocab-teacher-decks-tab";

const SEARCH_DEBOUNCE_MS = 300;

type DialogTab = "library" | "teacher";

interface CloneProgress {
	doneDecks: number;
	totalDecks: number;
	currentBatch: number;
	totalBatches: number;
}

const DIALOG_TABS: Array<{ id: DialogTab; label: string }> = [
	{ id: "library", label: "Thư viện hệ thống" },
	{ id: "teacher", label: "Bộ từ đã tạo" },
];

/**
 * Dialog 2 tab "Thêm từ thư viện":
 * - Tab 1 ("Thư viện hệ thống"): duyệt khóa học có sẵn, chọn bài học và clone qua
 *   `clone-vocab-library-decks` với giới hạn 1 lượt (`decks <= 50`, `decks + words <= 500`).
 * - Tab 2 ("Bộ từ đã tạo"): duyệt bộ từ do giáo viên tạo ở nguồn khác, lọc theo
 *   nguồn/nhóm/tìm kiếm, chọn cộng dồn không giới hạn 500 từ và tự động chia lượt gửi
 *   tuần tự qua `clone-vocab-teacher-decks`.
 */
export function VocabLibraryDialog({
	open,
	classId = null,
	onClose,
}: {
	open: boolean;
	classId?: string | null;
	onClose: () => void;
}) {
	const { data, dispatch, refresh } = useData();
	const targetClassId = classId ?? null;
	const isHubMode = targetClassId === null;
	const existingLibraryDeckIds = useMemo(() => {
		const ids = new Set<string>();
		for (const deck of data.vocabDecks) {
			if (
				(deck.classId ?? null) === targetClassId &&
				deck.sourceLibraryDeckId
			) {
				ids.add(deck.sourceLibraryDeckId);
			}
		}
		return ids;
	}, [data.vocabDecks, targetClassId]);

	const [activeTab, setActiveTab] = useState<DialogTab>("library");
	const [step, setStep] = useState<"courses" | "decks">("courses");
	const [courses, setCourses] = useState<VocabLibraryCourse[]>([]);
	const [selectedCourse, setSelectedCourse] =
		useState<VocabLibraryCourse | null>(null);
	const [decks, setDecks] = useState<VocabLibraryDeck[]>([]);
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(false);

	const [courseQuery, setCourseQuery] = useState("");
	const [deckQueryInput, setDeckQueryInput] = useState("");
	const [debouncedDeckQuery, setDebouncedDeckQuery] = useState("");

	const [selectedDecks, setSelectedDecks] = useState<Map<string, number>>(
		() => new Map(),
	);
	const [batchCapHint, setBatchCapHint] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);
	const [cloneProgress, setCloneProgress] = useState<CloneProgress | null>(
		null,
	);
	const [statusNotice, setStatusNotice] = useState<string | null>(null);

	const loadCourses = useCallback(async () => {
		setLoading(true);
		setLoadError(false);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab-library/courses`,
				{ credentials: "include" },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { courses: VocabLibraryCourse[] };
			setCourses(body.courses ?? []);
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, []);

	const loadDecks = useCallback(async (courseId: string) => {
		setLoading(true);
		setLoadError(false);
		try {
			const res = await fetch(
				`${getApiBaseUrl()}/api/kernel/vocab-library/courses/${courseId}/decks`,
				{ credentials: "include" },
			);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { decks: VocabLibraryDeck[] };
			setDecks(body.decks ?? []);
		} catch {
			setLoadError(true);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!open) return;
		setActiveTab("library");
		setStep("courses");
		setSelectedCourse(null);
		setDecks([]);
		setCourseQuery("");
		setDeckQueryInput("");
		setDebouncedDeckQuery("");
		setSelectedDecks(new Map());
		setBatchCapHint(null);
		setStatusNotice(null);
		setCloneProgress(null);
		setSubmitting(false);
		void loadCourses();
	}, [open, loadCourses]);

	useEffect(() => {
		if (deckQueryInput.trim().length === 0) {
			setDebouncedDeckQuery("");
			return;
		}
		const timer = window.setTimeout(() => {
			setDebouncedDeckQuery(deckQueryInput);
		}, SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [deckQueryInput]);

	const filteredCourses = useMemo(() => {
		const q = courseQuery.trim().toLowerCase();
		if (!q) return courses;
		return courses.filter(
			(c) =>
				c.name.toLowerCase().includes(q) ||
				(c.description?.toLowerCase().includes(q) ?? false) ||
				(c.target?.toLowerCase().includes(q) ?? false),
		);
	}, [courses, courseQuery]);

	const filteredDecks = useMemo(() => {
		const q = debouncedDeckQuery.trim().toLowerCase();
		if (!q) return decks;
		return decks.filter((d) => d.title.toLowerCase().includes(q));
	}, [decks, debouncedDeckQuery]);

	const selectedCount = selectedDecks.size;
	const totalWords = useMemo(() => {
		let sum = 0;
		for (const count of selectedDecks.values()) {
			sum += count;
		}
		return sum;
	}, [selectedDecks]);

	const teacherBatchPlan = useMemo(
		() =>
			splitVocabCloneBatches(
				[...selectedDecks.entries()].map(([id, wordCount]) => ({
					id,
					wordCount,
				})),
			),
		[selectedDecks],
	);

	const overCap =
		activeTab === "library"
			? selectedCount > MAX_VOCAB_CLONE_DECKS_PER_BATCH ||
				selectedCount + totalWords > MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH
			: teacherBatchPlan.oversizedDeckIds.length > 0;

	const handleRequestClose = () => {
		if (submitting) return;
		onClose();
	};

	const handleTabChange = (nextTabId: string) => {
		if (submitting) return;
		if (nextTabId !== "library" && nextTabId !== "teacher") return;
		if (nextTabId === activeTab) return;
		setActiveTab(nextTabId);
		setSelectedDecks(new Map());
		setBatchCapHint(null);
		setCloneProgress(null);
		setStatusNotice(null);
	};

	const handleSelectCourse = (course: VocabLibraryCourse) => {
		if (submitting) return;
		setSelectedCourse(course);
		setStep("decks");
		setDeckQueryInput("");
		setDebouncedDeckQuery("");
		setSelectedDecks(new Map());
		setBatchCapHint(null);
		setStatusNotice(null);
		void loadDecks(course.id);
	};

	const handleBackToCourses = () => {
		if (submitting) return;
		setStep("courses");
		setSelectedCourse(null);
		setDecks([]);
		setDeckQueryInput("");
		setDebouncedDeckQuery("");
		setSelectedDecks(new Map());
		setBatchCapHint(null);
		setStatusNotice(null);
	};

	const handleToggleDeck = (deck: { id: string; wordCount: number }) => {
		if (submitting) return;
		setBatchCapHint(null);
		setStatusNotice(null);
		setSelectedDecks((prev) => {
			const next = new Map(prev);
			if (next.has(deck.id)) {
				next.delete(deck.id);
			} else {
				next.set(deck.id, deck.wordCount);
			}
			return next;
		});
	};

	const handleSelectBatch = (
		items: ReadonlyArray<{ id: string; wordCount: number }>,
		unitLabel: string,
	) => {
		if (submitting) return;
		setStatusNotice(null);
		const allFilteredSelected =
			items.length > 0 && items.every((d) => selectedDecks.has(d.id));
		if (allFilteredSelected) {
			setSelectedDecks(new Map());
			setBatchCapHint(null);
			return;
		}

		const next = new Map<string, number>();
		let runningWords = 0;
		let skippedDueToCap = 0;

		for (const deck of items) {
			const nextCount = next.size + 1;
			const nextWords = runningWords + deck.wordCount;
			if (
				nextCount <= MAX_VOCAB_CLONE_DECKS_PER_BATCH &&
				nextCount + nextWords <= MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH
			) {
				next.set(deck.id, deck.wordCount);
				runningWords = nextWords;
			} else {
				skippedDueToCap += 1;
			}
		}

		setSelectedDecks(next);
		if (skippedDueToCap > 0) {
			setBatchCapHint(
				`Đã chọn tối đa ${next.size} ${unitLabel} cho 1 lượt — còn ${skippedDueToCap} ${unitLabel}, hãy thêm tiếp ở lượt sau.`,
			);
		} else {
			setBatchCapHint(null);
		}
	};

	const handleToggleTeacherFilteredSelection = (
		items: ReadonlyArray<{ id: string; wordCount: number }>,
	) => {
		if (submitting || items.length === 0) return;
		setBatchCapHint(null);
		setStatusNotice(null);
		setSelectedDecks((prev) => {
			const next = new Map(prev);
			const allSelected = items.every((item) => next.has(item.id));
			if (allSelected) {
				for (const item of items) {
					next.delete(item.id);
				}
			} else {
				for (const item of items) {
					next.set(item.id, item.wordCount);
				}
			}
			return next;
		});
	};

	const notifySuccessAndClose = (
		addedCount: number,
		dupCount: number,
		dupUnitLabel: string,
	) => {
		if (dupCount > 0) {
			toast.warning(
				isHubMode
					? `Đã thêm ${addedCount} bộ từ (${dupCount} ${dupUnitLabel} đã có trong hub từ trước).`
					: `Đã thêm ${addedCount} bộ từ (${dupCount} ${dupUnitLabel} đã có trong lớp từ trước).`,
			);
		} else {
			toast.success(
				isHubMode
					? `Đã thêm ${addedCount} bộ từ.`
					: `Đã thêm ${addedCount} bộ từ vào lớp.`,
			);
		}
		onClose();
	};

	const handleConfirmClone = async () => {
		if (selectedCount === 0 || overCap || submitting) return;
		setSubmitting(true);
		setStatusNotice(null);
		try {
			if (activeTab === "teacher") {
				const { batches } = teacherBatchPlan;
				if (batches.length === 0) return;

				if (batches.length === 1) {
					const onlyBatch = batches[0];
					if (!onlyBatch) return;
					const result = await dispatch({
						type: "clone-vocab-teacher-decks",
						payload: { classId: targetClassId, deckIds: onlyBatch.deckIds },
					});

					if (result.kind === "refreshed") {
						notifySuccessAndClose(
							result.updated ?? onlyBatch.deckIds.length,
							result.duplicates?.length ?? 0,
							"bộ từ",
						);
						return;
					}

					if (result.kind === "committed") {
						const msg =
							"Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang.";
						toast.warning(msg);
						setStatusNotice(msg);
						return;
					}

					if (result.kind === "definite-failure") {
						const msg = result.reason
							? `Không thể thêm bộ từ (${result.reason}).`
							: isHubMode
								? "Không thể thêm bộ từ."
								: "Không thể thêm bộ từ vào lớp.";
						toast.error(msg);
						setStatusNotice(msg);
						return;
					}

					const unknownMsg =
						"Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại.";
					toast.error(unknownMsg);
					setStatusNotice(unknownMsg);
					return;
				}

				const totalTargetDecks = batches.reduce(
					(sum, batch) => sum + batch.deckIds.length,
					0,
				);
				let doneDecks = 0;
				let totalAdded = 0;
				const duplicateIds = new Set<string>();
				const remaining = new Map(selectedDecks);

				for (let i = 0; i < batches.length; i++) {
					const batch = batches[i];
					if (!batch) continue;
					setCloneProgress({
						doneDecks,
						totalDecks: totalTargetDecks,
						currentBatch: i + 1,
						totalBatches: batches.length,
					});

					const res = await dispatch(
						{
							type: "clone-vocab-teacher-decks",
							payload: { classId: targetClassId, deckIds: batch.deckIds },
						},
						{ skipRefresh: true },
					);

					if (res.kind === "committed" || res.kind === "refreshed") {
						totalAdded += res.updated ?? batch.deckIds.length;
						for (const dup of res.duplicates ?? []) {
							duplicateIds.add(dup);
						}
						for (const id of batch.deckIds) {
							remaining.delete(id);
						}
						doneDecks += batch.deckIds.length;
						setSelectedDecks(new Map(remaining));
						continue;
					}

					setCloneProgress(null);
					if (doneDecks > 0) {
						await refresh();
					}

					const msg =
						doneDecks > 0
							? res.kind === "outcome-unknown"
								? `Đã thêm ${totalAdded}/${totalTargetDecks} bộ, nhưng không rõ kết quả mạng ở lượt tiếp theo (${remaining.size} bộ còn lại) — hãy kiểm tra danh sách bộ từ trước khi thử lại.`
								: `Đã thêm ${totalAdded}/${totalTargetDecks} bộ — còn ${remaining.size} bộ chưa thêm được${
										res.reason ? ` (${res.reason})` : ""
									}. Hãy bấm thêm lại cho phần còn lại.`
							: res.kind === "definite-failure"
								? res.reason
									? `Không thể thêm bộ từ (${res.reason}).`
									: isHubMode
										? "Không thể thêm bộ từ."
										: "Không thể thêm bộ từ vào lớp."
								: "Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại.";
					toast.error(msg);
					setStatusNotice(msg);
					return;
				}

				setCloneProgress(null);
				const refreshed = await refresh();
				if (!refreshed) {
					const msg =
						"Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang.";
					toast.warning(msg);
					setStatusNotice(msg);
					return;
				}

				notifySuccessAndClose(totalAdded, duplicateIds.size, "bộ từ");
				return;
			}

			const deckIds = [...selectedDecks.keys()];
			const result = await dispatch({
				type: "clone-vocab-library-decks",
				payload: { classId: targetClassId, deckIds },
			});

			if (result.kind === "refreshed") {
				notifySuccessAndClose(
					result.updated ?? deckIds.length,
					result.duplicates?.length ?? 0,
					"bài",
				);
				return;
			}

			if (result.kind === "committed") {
				const msg =
					"Đã lưu nhưng chưa xác nhận danh sách — vui lòng tải lại trang.";
				toast.warning(msg);
				setStatusNotice(msg);
				return;
			}

			if (result.kind === "definite-failure") {
				const msg = result.reason
					? `Không thể thêm bộ từ (${result.reason}).`
					: isHubMode
						? "Không thể thêm bộ từ."
						: "Không thể thêm bộ từ vào lớp.";
				toast.error(msg);
				setStatusNotice(msg);
				return;
			}

			const unknownMsg =
				"Không rõ kết quả mạng — hãy kiểm tra danh sách bộ từ trước khi thử lại.";
			toast.error(unknownMsg);
			setStatusNotice(unknownMsg);
		} finally {
			setCloneProgress(null);
			setSubmitting(false);
		}
	};

	const showConfirmButton =
		(activeTab === "library" && step === "decks") || activeTab === "teacher";

	return (
		<Modal
			open={open}
			onClose={handleRequestClose}
			title={
				activeTab === "library" && step === "decks"
					? `Thêm từ thư viện · ${selectedCourse?.name ?? ""}`
					: "Thêm từ thư viện"
			}
			footer={
				<div className="flex w-full flex-col gap-2">
					{overCap ? (
						<p
							data-testid="vocab-library-cap-warning"
							className="font-mono text-primary text-xs"
						>
							{activeTab === "library"
								? `Vượt giới hạn 1 lượt (tối đa ${MAX_VOCAB_CLONE_DECKS_PER_BATCH} bộ và tổng số bộ + từ ≤ ${MAX_VOCAB_CLONE_STATEMENTS_PER_BATCH}). Vui lòng bỏ chọn bớt bài.`
								: "Có bộ từ vượt giới hạn 499 từ/bộ và không thể sao chép. Vui lòng bỏ chọn bộ từ đó."}
						</p>
					) : null}
					{batchCapHint ? (
						<p
							data-testid="vocab-library-batch-hint"
							className="font-mono text-primary text-xs"
						>
							{batchCapHint}
						</p>
					) : null}
					{submitting && cloneProgress ? (
						<p
							data-testid="vocab-library-batch-progress"
							aria-live="polite"
							className="font-mono text-muted-foreground text-xs tabular-nums"
						>
							Đang thêm {cloneProgress.doneDecks}/{cloneProgress.totalDecks} bộ
							(lượt {cloneProgress.currentBatch}/{cloneProgress.totalBatches}
							)...
						</p>
					) : null}
					{statusNotice ? (
						<p
							data-testid="vocab-library-status-notice"
							className="font-mono text-primary text-xs"
						>
							{statusNotice}
						</p>
					) : null}
					<div className="flex flex-wrap items-center justify-between gap-3">
						<span
							data-testid="vocab-library-selection-summary"
							aria-live={submitting && cloneProgress ? "off" : "polite"}
							className="font-mono text-muted-foreground text-xs tabular-nums"
						>
							Đã chọn {selectedCount} bộ · {totalWords} từ
							{activeTab === "teacher" && teacherBatchPlan.batches.length > 1
								? ` (${teacherBatchPlan.batches.length} lượt gửi)`
								: ""}
						</span>
						<div className="flex items-center gap-2">
							<Button
								variant="secondary"
								type="button"
								disabled={submitting}
								onClick={handleRequestClose}
							>
								Hủy
							</Button>
							{showConfirmButton ? (
								<Button
									type="button"
									data-testid="vocab-library-confirm-btn"
									disabled={selectedCount === 0 || overCap || submitting}
									onClick={() => void handleConfirmClone()}
								>
									{submitting
										? "Đang thêm..."
										: isHubMode
											? "Thêm bộ từ"
											: "Thêm vào lớp"}
								</Button>
							) : null}
						</div>
					</div>
				</div>
			}
		>
			<div>
				<Tabs
					tabs={DIALOG_TABS}
					active={activeTab}
					onChange={handleTabChange}
					className="mb-4 max-w-full [&>button]:px-2.5 [&>button]:text-xs sm:[&>button]:px-3 sm:[&>button]:text-sm"
				/>

				{activeTab === "teacher" ? (
					<VocabTeacherDecksTab
						targetClassId={targetClassId}
						vocabDecks={data.vocabDecks}
						vocabGroups={data.vocabGroups}
						classes={data.classes}
						selectedDecks={selectedDecks}
						disabled={submitting}
						onToggleDeck={handleToggleDeck}
						onToggleFilteredSelection={handleToggleTeacherFilteredSelection}
					/>
				) : step === "courses" ? (
					<div className="space-y-3" data-testid="vocab-library-courses-step">
						<Input
							data-testid="vocab-library-course-search"
							value={courseQuery}
							onChange={(e) => setCourseQuery(e.target.value)}
							placeholder="Tìm khóa học từ vựng..."
							aria-label="Tìm khóa học từ vựng"
						/>

						{loading ? (
							<p className="py-6 text-center font-mono text-muted-foreground text-xs">
								Đang tải danh mục khóa học...
							</p>
						) : loadError ? (
							<div className="space-y-2 py-6 text-center">
								<p className="text-primary text-sm">
									Không tải được danh mục thư viện từ vựng.
								</p>
								<Button
									size="sm"
									variant="secondary"
									type="button"
									onClick={() => void loadCourses()}
								>
									Thử lại
								</Button>
							</div>
						) : filteredCourses.length === 0 ? (
							<p className="py-6 text-center text-muted-foreground text-sm">
								Không tìm thấy khóa học phù hợp.
							</p>
						) : (
							<div className="max-h-[380px] divide-y divide-border overflow-y-auto rounded-md border border-border">
								{filteredCourses.map((course) => (
									<div
										key={course.id}
										data-testid={`vocab-library-course-${course.id}`}
										className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
									>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-foreground text-sm">
												{course.name}
											</p>
											{course.description || course.target ? (
												<p className="mt-0.5 truncate text-muted-foreground text-xs">
													{[course.description, course.target]
														.filter(Boolean)
														.join(" · ")}
												</p>
											) : null}
										</div>
										<div className="flex flex-none items-center gap-3">
											<span className="font-mono text-[11px] text-muted-foreground">
												{course.deckCount} bài
											</span>
											<Button
												size="sm"
												variant="secondary"
												type="button"
												data-testid={`vocab-library-select-course-${course.id}`}
												onClick={() => handleSelectCourse(course)}
											>
												Chọn
											</Button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				) : (
					<div className="space-y-3" data-testid="vocab-library-decks-step">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Button
								size="sm"
								variant="ghost"
								type="button"
								data-testid="vocab-library-back-btn"
								onClick={handleBackToCourses}
							>
								← Quay lại danh sách khóa
							</Button>
							{filteredDecks.length > 0 ? (
								<Button
									size="sm"
									variant="secondary"
									type="button"
									data-testid="vocab-library-select-all"
									onClick={() => handleSelectBatch(filteredDecks, "bài")}
								>
									Chọn theo lượt
								</Button>
							) : null}
						</div>

						<Input
							data-testid="vocab-library-deck-search"
							value={deckQueryInput}
							onChange={(e) => setDeckQueryInput(e.target.value)}
							placeholder="Tìm bài học theo tiêu đề..."
							aria-label="Tìm bài học theo tiêu đề"
						/>

						{loading ? (
							<p className="py-6 text-center font-mono text-muted-foreground text-xs">
								Đang tải danh sách bài học...
							</p>
						) : loadError ? (
							<div className="space-y-2 py-6 text-center">
								<p className="text-primary text-sm">
									Không tải được danh sách bài học của khóa này.
								</p>
								<Button
									size="sm"
									variant="secondary"
									type="button"
									onClick={() =>
										selectedCourse
											? void loadDecks(selectedCourse.id)
											: undefined
									}
								>
									Thử lại
								</Button>
							</div>
						) : filteredDecks.length === 0 ? (
							<p className="py-6 text-center text-muted-foreground text-sm">
								Không có bài học nào khớp từ khóa.
							</p>
						) : (
							<div className="max-h-[340px] divide-y divide-border overflow-y-auto rounded-md border border-border">
								{filteredDecks.map((deck) => {
									const checked = selectedDecks.has(deck.id);
									const alreadyInClass = existingLibraryDeckIds.has(deck.id);
									return (
										<label
											key={deck.id}
											data-testid={`vocab-library-deck-${deck.id}`}
											className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition-colors duration-150 ${
												checked ? "rounded-md bg-muted" : "hover:bg-muted/50"
											}`}
										>
											<div className="flex min-w-0 flex-1 items-center gap-3">
												<input
													type="checkbox"
													data-testid={`vocab-library-deck-checkbox-${deck.id}`}
													checked={checked}
													onChange={() => handleToggleDeck(deck)}
													className="size-4 accent-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
												/>
												<div className="min-w-0 flex-1">
													<div className="flex flex-wrap items-center gap-2">
														<span
															className={`truncate font-medium text-sm ${
																checked ? "text-primary" : "text-foreground"
															}`}
														>
															{deck.title}
														</span>
														{alreadyInClass ? (
															<span
																data-testid={`vocab-library-existing-chip-${deck.id}`}
																className="rounded rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] text-primary uppercase tracking-widest"
															>
																{isHubMode
																	? "Đã có trong hub"
																	: "Đã có trong lớp"}
															</span>
														) : null}
													</div>
												</div>
											</div>
											<span className="flex-none font-mono text-[11px] text-muted-foreground">
												{deck.wordCount} từ
											</span>
										</label>
									);
								})}
							</div>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
}
