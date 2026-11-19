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
import { VocabTeacherDecksTab } from "./vocab-teacher-decks-tab";

const MAX_CLONE_DECKS = 50;
const MAX_CLONE_STATEMENTS = 500;
const SEARCH_DEBOUNCE_MS = 300;

type DialogTab = "library" | "teacher";

const DIALOG_TABS: Array<{ id: DialogTab; label: string }> = [
	{ id: "library", label: "Thư viện hệ thống" },
	{ id: "teacher", label: "Bộ từ đã tạo" },
];

/**
 * Dialog 2 tab "Thêm từ thư viện":
 * - Tab 1 ("Thư viện hệ thống"): duyệt khóa học có sẵn, chọn bài học và clone qua
 *   `clone-vocab-library-decks`.
 * - Tab 2 ("Bộ từ đã tạo"): duyệt bộ từ do giáo viên tạo ở nguồn khác, lọc theo
 *   nguồn/tìm kiếm, chọn nhiều và clone qua `clone-vocab-teacher-decks`.
 * Cả hai tab dùng chung kiểm tra giới hạn `decks <= 50` và `decks + words <= 500` ở footer.
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
	const { data, dispatch } = useData();
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

	const overCap =
		selectedCount > MAX_CLONE_DECKS ||
		selectedCount + totalWords > MAX_CLONE_STATEMENTS;

	const handleTabChange = (nextTabId: string) => {
		if (submitting) return;
		if (nextTabId !== "library" && nextTabId !== "teacher") return;
		if (nextTabId === activeTab) return;
		setActiveTab(nextTabId);
		setSelectedDecks(new Map());
		setBatchCapHint(null);
		setStatusNotice(null);
	};

	const handleSelectCourse = (course: VocabLibraryCourse) => {
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
				nextCount <= MAX_CLONE_DECKS &&
				nextCount + nextWords <= MAX_CLONE_STATEMENTS
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

	const handleConfirmClone = async () => {
		if (selectedCount === 0 || overCap || submitting) return;
		setSubmitting(true);
		setStatusNotice(null);
		try {
			const deckIds = [...selectedDecks.keys()];
			const result = await dispatch(
				activeTab === "teacher"
					? {
							type: "clone-vocab-teacher-decks",
							payload: { classId: targetClassId, deckIds },
						}
					: {
							type: "clone-vocab-library-decks",
							payload: { classId: targetClassId, deckIds },
						},
			);

			if (result.kind === "refreshed") {
				const addedCount = result.updated ?? deckIds.length;
				const dupCount = result.duplicates?.length ?? 0;
				const dupUnitLabel = activeTab === "teacher" ? "bộ từ" : "bài";
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
			setSubmitting(false);
		}
	};

	const showConfirmButton =
		(activeTab === "library" && step === "decks") || activeTab === "teacher";

	return (
		<Modal
			open={open}
			onClose={onClose}
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
							Vượt giới hạn 1 lượt (tối đa {MAX_CLONE_DECKS} bộ và tổng số bộ +
							từ ≤ {MAX_CLONE_STATEMENTS}). Vui lòng bỏ chọn bớt bài.
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
							aria-live="polite"
							className="font-mono text-muted-foreground text-xs tabular-nums"
						>
							Đã chọn {selectedCount} bộ · {totalWords} từ
						</span>
						<div className="flex items-center gap-2">
							<Button variant="secondary" type="button" onClick={onClose}>
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
						classes={data.classes}
						selectedDecks={selectedDecks}
						onToggleDeck={handleToggleDeck}
						onSelectBatch={(items) => handleSelectBatch(items, "bộ từ")}
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
