import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	useBlocker,
	useParams,
} from "@tanstack/react-router";
import { ASSIGNMENT_TEST_PRESETS } from "@teacher-os/api/contracts";
import {
	isLibrarySkill,
	type LibraryPartDto,
	type LibraryPartInput,
	type LibrarySkill,
	validateTestReady,
} from "@teacher-os/api/library-contracts";
import { buttonVariants } from "@teacher-os/ui/components/web-kit/button";
import { Card } from "@teacher-os/ui/components/web-kit/card";
import { Check, Eye } from "lucide-react";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { AnswersCheckingPanel } from "@/components/library/answers-checking-panel";
import { buildAnswersOverview } from "@/components/library/answers-overview";
import { effectivePartsFor } from "@/components/library/effective-parts";
import { libraryErrorMessage } from "@/components/library/library-error";
import {
	PartForm,
	type PartFormValue,
	partInputFromValue,
	partValueFromDto,
	reconcilePartDraftsOnSaveSuccess,
} from "@/components/library/part-form";
import { formatIssue } from "@/components/library/part-issues";
import type {
	FocusTarget,
	PartFormHandle,
	PartViewState,
} from "@/components/library/part-view-state";
import { PublishBar } from "@/components/library/publish-bar";
import {
	areTestHeadersEqual,
	buildUpdatePayload,
	formatTimeLimit,
	reconcileHeaderOnSaveSuccess,
	TestHeaderForm,
	type TestHeaderFormValue,
} from "@/components/library/test-header-form";
import {
	type OutlineTarget,
	TestOutline,
} from "@/components/library/test-outline";
import { buildTestOutline } from "@/components/library/test-outline-model";
import { buildTestPreview } from "@/components/library/test-preview-model";
import { TestPreviewOverlay } from "@/components/library/test-preview-overlay";
import { isHttpError } from "@/lib/query-client";
import {
	deleteLibraryPart,
	libraryTestQueryOptions,
	setLibraryTestStatus,
	updateLibraryTest,
	upsertLibraryPart,
} from "@/lib/repos/library";

/**
 * Trang edit bộ đề (#424): bố cục hai cột — cây điều hướng bên trái, thẻ
 * Part đang chọn bên phải; toolbar "Lưu part" qua imperative handle của
 * PartForm; panel "Kiểm tra đáp án" chỉ đọc. Header vẫn PATCH khi blur.
 */

export const Route = createFileRoute("/_auth/library/tests/$testId")({
	component: EditTestRoute,
});

/** Header form value từ DTO để so sánh dirty và sync khi refetch. */
function headerFromDetail(detail: {
	title: string;
	description: string | null;
	skill: string;
	timeLimitSeconds: number;
	collection: string | null;
	testGroup: string | null;
}): TestHeaderFormValue {
	return {
		title: detail.title,
		description: detail.description ?? "",
		skill: isLibrarySkill(detail.skill) ? detail.skill : "reading",
		timeLimit: formatTimeLimit(detail.timeLimitSeconds),
		collection: detail.collection ?? "",
		testGroup: detail.testGroup ?? "",
	};
}

function EditTestRoute() {
	const { testId } = useParams({ from: "/_auth/library/tests/$testId" });
	const queryClient = useQueryClient();
	const query = useQuery(libraryTestQueryOptions(testId));
	const detail = query.data;

	// --- Header metadata ---
	const [headerValue, setHeaderValue] = useState<TestHeaderFormValue | null>(
		null,
	);
	const [headerShowErrors, setHeaderShowErrors] = useState(false);
	const savedHeader = useMemo(
		() => (detail ? headerFromDetail(detail) : null),
		[detail],
	);
	const headerDirty =
		headerValue !== null &&
		savedHeader !== null &&
		!areTestHeadersEqual(headerValue, savedHeader);
	// Ref để effect sync không đè bản nháp header đang soạn khi detail
	// refetch vì lý do khác (lưu part, đổi trạng thái).
	const headerDirtyRef = useRef(headerDirty);
	headerDirtyRef.current = headerDirty;
	// Sync khi refetch sau mutation (đổi trên server thắng).
	useEffect(() => {
		if (!savedHeader || headerDirtyRef.current) return;
		setHeaderValue(savedHeader);
	}, [savedHeader]);

	const headerMutation = useMutation({
		mutationFn: (patch: TestHeaderFormValue) => {
			const built = buildUpdatePayload(patch);
			if (!built.ok) throw new Error("invalid");
			return updateLibraryTest(testId, built.payload);
		},
		onSuccess: (updated, variables) => {
			toast.success("Đã lưu thông tin bộ đề.");
			setHeaderValue(
				(prev) =>
					reconcileHeaderOnSaveSuccess(
						prev,
						variables,
						headerFromDetail(updated),
					).nextValue,
			);
			void refresh();
		},
		onError: (error) => {
			if (error instanceof Error && error.message === "invalid") return;
			toast.error(libraryErrorMessage(error));
		},
	});

	const saveHeader = (next: TestHeaderFormValue) => {
		const built = buildUpdatePayload(next);
		if (!built.ok) {
			setHeaderShowErrors(true);
			toast.error("Thông tin bộ đề chưa hợp lệ — kiểm tra các trường lỗi.");
			return;
		}
		headerMutation.mutate(next);
	};

	// --- Part drafts: dirty + giá trị hiện tại do PartForm báo lên ---
	const [drafts, setDrafts] = useState<
		ReadonlyMap<string, { dirty: boolean; value: PartFormValue }>
	>(new Map());
	const onDraftChange = useCallback(
		(slot: string, draft: { dirty: boolean; value: PartFormValue }) => {
			setDrafts((previous) => {
				const existing = previous.get(slot);
				if (
					existing &&
					existing.dirty === draft.dirty &&
					existing.value === draft.value
				) {
					return previous;
				}
				const next = new Map(previous);
				next.set(slot, draft);
				return next;
			});
		},
		[],
	);
	const dirtySlots = useMemo(() => {
		const slots = new Set<string>();
		for (const [slot, draft] of drafts) {
			if (draft.dirty) slots.add(slot);
		}
		return slots;
	}, [drafts]);

	// --- Điều hướng (#424 A4): selection/activePosition/focusTarget/view-state
	const [selection, setSelection] = useState<{ part: string } | null>(null);
	const [activePosition, setActivePosition] = useState<{
		group: number | null;
		question: number | null;
	}>({ group: null, question: null });
	const [viewStateBySlot, setViewStateBySlot] = useState<
		ReadonlyMap<string, PartViewState>
	>(new Map());
	const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
	const focusNonceRef = useRef(0);
	const partFormRef = useRef<PartFormHandle>(null);
	const [answersOpen, setAnswersOpen] = useState(false);
	// Overlay Xem trước (#433): mở trên dữ liệu đã lưu + bản nháp; trong lúc
	// mở, autosave header qua blur được HOÃN (red-team RT4 — blur vào overlay
	// không được sinh PATCH ngầm).
	const [previewOpen, setPreviewOpen] = useState(false);
	const previewOpenRef = useRef(false);
	previewOpenRef.current = previewOpen;
	const previewTriggerRef = useRef<HTMLButtonElement>(null);
	// Dưới lg cây nằm trên cột phải, thu gọn mặc định; guard matchMedia cho
	// môi trường test thiếu implementation (precedent annotatable-essay).
	const [outlineCollapsed, setOutlineCollapsed] = useState(() => {
		if (typeof window.matchMedia !== "function") return true;
		return !window.matchMedia("(min-width: 1024px)").matches;
	});
	const [initializedSlots, setInitializedSlots] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const skill: LibrarySkill | null =
		detail && isLibrarySkill(detail.skill) ? detail.skill : null;
	const slots = skill ? ASSIGNMENT_TEST_PRESETS[skill].slots : [];
	const currentSlot =
		selection && slots.some((slot) => slot.part === selection.part)
			? selection.part
			: (slots[0]?.part ?? null);

	const partsBySlot = useMemo(() => {
		const map = new Map<string, LibraryPartDto>();
		for (const part of detail?.parts ?? []) map.set(part.part, part);
		return map;
	}, [detail?.parts]);

	// Callback identity ổn định (PartForm effect phụ thuộc): đọc slot qua ref.
	const currentSlotRef = useRef<string | null>(null);
	currentSlotRef.current = currentSlot;
	const handleActivePositionChange = useCallback(
		(pos: {
			group: number | null;
			question: number | null;
			view?: PartViewState;
		}) => {
			setActivePosition((previous) =>
				previous.group === pos.group && previous.question === pos.question
					? previous
					: { group: pos.group, question: pos.question },
			);
			const slot = currentSlotRef.current;
			const view = pos.view;
			if (!slot || !view) return;
			setViewStateBySlot((previous) => {
				if (previous.get(slot) === view) return previous;
				const next = new Map(previous);
				next.set(slot, view);
				return next;
			});
		},
		[],
	);
	const handleFocusConsumed = useCallback(() => setFocusTarget(null), []);
	const jumpTo = useCallback(
		(target: OutlineTarget) => {
			if (target.part !== currentSlot) {
				setSelection({ part: target.part });
				// activePosition là của part cũ — reset để cây không tô sai.
				setActivePosition({ group: null, question: null });
			}
			if (target.group === undefined) return;
			focusNonceRef.current += 1;
			setFocusTarget({
				group: target.group,
				question: target.question,
				nonce: focusNonceRef.current,
			});
		},
		[currentSlot],
	);

	// --- Blocker: rời trang khi còn thay đổi chưa lưu ---
	const hasUnsaved =
		dirtySlots.size > 0 || (headerDirty && headerValue !== null);
	useBlocker({
		shouldBlockFn: async () => {
			if (!hasUnsaved) return false;
			return !window.confirm(
				"Còn thay đổi chưa lưu. Rời trang bây giờ sẽ mất các thay đổi này — tiếp tục?",
			);
		},
	});

	// --- Mutations ---
	const refresh = () =>
		// Invalidate cả prefix list: trang edit không để cache list stale
		// 60s sau publish/unpublish/lưu part (trước đây e2e phải reload).
		queryClient.invalidateQueries({
			queryKey: ["admin", "library"],
		});

	const savePartMutation = useMutation({
		mutationFn: ({
			slot,
			input,
		}: {
			slot: string;
			input: LibraryPartInput;
			snapshot: PartFormValue;
		}) => upsertLibraryPart(testId, slot, input),
		onSuccess: async (_data, variables) => {
			const label =
				slots.find((entry) => entry.part === variables.slot)?.label ??
				variables.slot;
			toast.success(`Đã lưu ${label}.`);
			setDrafts((previous) =>
				reconcilePartDraftsOnSaveSuccess(
					previous,
					variables.slot,
					variables.snapshot,
				),
			);
			await refresh();
		},
		onError: (error) => {
			if (isHttpError(error) && error.status === 400) {
				toast.error("Nội dung part chưa hợp lệ — kiểm tra các trường lỗi.");
				return;
			}
			toast.error(libraryErrorMessage(error));
		},
	});

	const deletePartMutation = useMutation({
		mutationFn: (slot: string) => deleteLibraryPart(testId, slot),
		onSuccess: async (_data, slot) => {
			toast.success("Đã xóa part.");
			setInitializedSlots((previous) => {
				const next = new Set(previous);
				next.delete(slot);
				return next;
			});
			setDrafts((previous) => {
				if (!previous.has(slot)) return previous;
				const next = new Map(previous);
				next.delete(slot);
				return next;
			});
			// Review RF-F3: view-state của nội dung cũ không được sống sót qua
			// xóa part — part tạo lại sẽ mount với initialView sai nhóm/tab.
			setViewStateBySlot((previous) => {
				if (!previous.has(slot)) return previous;
				const next = new Map(previous);
				next.delete(slot);
				return next;
			});
			if (selection?.part === slot) {
				setActivePosition({ group: null, question: null });
			}
			await refresh();
		},
		onError: (error) => {
			// Server chặn xóa part trên đề ready bằng 409 NOT_READY.
			toast.error(libraryErrorMessage(error));
		},
	});

	const statusMutation = useMutation({
		mutationFn: (status: "draft" | "ready") =>
			setLibraryTestStatus(testId, status),
		onSuccess: async () => {
			await refresh();
		},
		onError: (error) => {
			// Lý do NOT_READY hiển thị trong PublishBar từ error payload.
			toast.error(libraryErrorMessage(error));
		},
	});

	// --- Ready check toàn đề: bản đã lưu + overlay bản nháp đang sửa ---
	// #426 F3: bản đã lưu parse 1 LẦN theo partsBySlot (memo per-slot) —
	// keystroke chỉ parse đúng part đang sửa qua `effectivePartsFor`.
	const savedInputsBySlot = useMemo(() => {
		const inputs = new Map<string, LibraryPartInput>();
		if (!skill) return inputs;
		for (const slot of slots) {
			const saved = partsBySlot.get(slot.part);
			if (!saved) continue;
			const built = partInputFromValue(slot.part, partValueFromDto(saved));
			if (built.ok) {
				if (saved.audio?.name) built.input.audioName = saved.audio.name;
				inputs.set(slot.part, built.input);
			}
		}
		return inputs;
	}, [skill, slots, partsBySlot]);
	// Gõ phím khẩn: dirtySlots/toolbar dùng `drafts` tươi; các derived nặng
	// (ready overlay, cây, bảng đáp án) tính theo `deferredDrafts` để không
	// chặn frame gõ (RT-4: qStart trễ ~1 frame là cosmetic — publish vẫn
	// re-validate server-side).
	const deferredDrafts = useDeferredValue(drafts);
	const effectiveParts = useMemo(
		() =>
			skill
				? effectivePartsFor(slots, partsBySlot, deferredDrafts, {
						savedInputs: savedInputsBySlot,
					})
				: [],
		[skill, slots, partsBySlot, deferredDrafts, savedInputsBySlot],
	);

	const readyIssues = useMemo(
		() => (skill ? validateTestReady(skill, effectiveParts) : []),
		[skill, effectiveParts],
	);

	// --- Cây đề + bảng đáp án: cùng nguồn resolvePartValues (đánh số fold) ---
	const sections = useMemo(
		() =>
			skill ? buildTestOutline(skill, slots, partsBySlot, deferredDrafts) : [],
		[skill, slots, partsBySlot, deferredDrafts],
	);
	const answerRows = useMemo(
		() =>
			skill
				? buildAnswersOverview({
						skill,
						slots,
						partsBySlot,
						drafts: deferredDrafts,
					})
				: [],
		[skill, slots, partsBySlot, deferredDrafts],
	);
	// Tabs Xem trước: chỉ tính khi overlay đang mở, theo deferredDrafts (plan
	// phase 2 — mở overlay không chặn frame gõ).
	const previewTabs = useMemo(
		() =>
			previewOpen && skill
				? buildTestPreview({
						skill,
						slots,
						partsBySlot,
						drafts: deferredDrafts,
						savedInputs: savedInputsBySlot,
					})
				: null,
		[previewOpen, skill, slots, partsBySlot, deferredDrafts, savedInputsBySlot],
	);

	if (query.isPending) {
		return (
			<section
				aria-label="Đang tải"
				className="p-6 text-muted-foreground text-sm"
			>
				Đang tải bộ đề…
			</section>
		);
	}
	if (query.isError || !detail || !skill) {
		return (
			<section aria-label="Lỗi" className="flex flex-col gap-3 p-6">
				<p className="text-destructive text-sm">
					{isHttpError(query.error) && query.error.status === 404
						? "Bộ đề không tồn tại hoặc đã bị xóa."
						: "Không tải được bộ đề. Vui lòng thử lại."}
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						className={buttonVariants({ variant: "outline", size: "sm" })}
						onClick={() => void query.refetch()}
					>
						Thử lại
					</button>
					<Link
						to="/library/tests"
						className={buttonVariants({ variant: "ghost", size: "sm" })}
					>
						← Thư viện đề
					</Link>
				</div>
			</section>
		);
	}

	const activeSaved = currentSlot
		? (partsBySlot.get(currentSlot) ?? null)
		: null;
	const activeInitialized =
		currentSlot !== null && initializedSlots.has(currentSlot);
	// Red-team F2: nút "Lưu part" ràng buộc đúng điều kiện PartForm được
	// mount (slot có bản lưu HOẶC đã bấm "Thêm nội dung") — trống thì disable.
	const partFormMounted =
		currentSlot !== null &&
		(partsBySlot.has(currentSlot) || initializedSlots.has(currentSlot));
	const currentQStart =
		currentSlot === null
			? undefined
			: (sections.find((section) => section.part === currentSlot)?.qStart ??
				undefined);

	return (
		<section
			aria-label={`Chỉnh sửa bộ đề ${detail.title}`}
			className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 p-6"
		>
			<div>
				<Link
					to="/library/tests"
					className="text-muted-foreground text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
				>
					← Thư viện đề
				</Link>
				<h1 className="mt-2 font-semibold text-xl">{detail.title}</h1>
				<p className="text-muted-foreground text-sm">
					{skill === "reading" ? "Reading" : "Listening"} ·{" "}
					{formatTimeLimit(detail.timeLimitSeconds)}
				</p>
			</div>

			<PublishBar
				status={detail.status === "ready" ? "ready" : "draft"}
				issues={readyIssues}
				busy={statusMutation.isPending}
				skill={skill}
				onPublish={() =>
					statusMutation.mutateAsync("ready").then(() => undefined)
				}
				onUnpublish={() =>
					statusMutation.mutateAsync("draft").then(() => undefined)
				}
			/>

			<Card className="gap-4 p-5">
				<div className="flex items-center justify-between gap-3">
					<h2 className="font-semibold text-base">Thông tin bộ đề</h2>
					{headerDirty && (
						<span className="flex items-center gap-1.5 text-amber-600 text-xs">
							<span
								aria-hidden="true"
								className="inline-block size-2 rounded-full bg-amber-500"
							/>
							Có thay đổi chưa lưu
						</span>
					)}
				</div>
				{headerValue && (
					// Blur ra ngoài khối form → PATCH tự động (spec: PATCH khi
					// blur/lưu); nút «Lưu thông tin» là đường lưu tường minh.
					// biome-ignore lint/a11y/noStaticElementInteractions: onBlur nhóm trường, không phải điều khiển tương tác
					<div
						onBlur={(event) => {
							if (event.currentTarget.contains(event.relatedTarget)) return;
							// RT4: blur vào overlay Xem trước không PATCH — hoãn đến
							// khi overlay đóng, blur tiếp theo vẫn lưu như cũ.
							// relatedTarget: mousedown nút Xem trước blur header
							// TRƯỚC khi onClick kịp set previewOpen (race blur→click).
							if (
								previewOpenRef.current ||
								event.relatedTarget === previewTriggerRef.current
							) {
								return;
							}
							if (headerValue && headerDirty) saveHeader(headerValue);
						}}
					>
						<TestHeaderForm
							value={headerValue}
							showErrors={headerShowErrors}
							skillLocked
							idPrefix="edit"
							onChange={(patch) =>
								setHeaderValue((previous) =>
									previous ? { ...previous, ...patch } : previous,
								)
							}
						/>
					</div>
				)}
				<div className="flex justify-end">
					<button
						type="button"
						className={buttonVariants({ size: "sm" })}
						disabled={!headerDirty || headerMutation.isPending}
						onClick={() => {
							if (headerValue) saveHeader(headerValue);
						}}
					>
						{headerMutation.isPending ? "Đang lưu…" : "Lưu thông tin"}
					</button>
				</div>
			</Card>

			<div
				role="toolbar"
				aria-label="Thao tác soạn đề"
				className="flex flex-wrap items-center gap-2"
			>
				<button
					type="button"
					className={buttonVariants({ size: "sm" })}
					disabled={!partFormMounted || savePartMutation.isPending}
					onClick={() => {
						void partFormRef.current?.save();
					}}
				>
					{savePartMutation.isPending ? "Đang lưu…" : "Lưu part"}
				</button>
				<button
					type="button"
					className={buttonVariants({ variant: "outline", size: "sm" })}
					aria-expanded={answersOpen}
					onClick={() => setAnswersOpen((open) => !open)}
				>
					<Check aria-hidden="true" className="size-4" />
					Kiểm tra đáp án
				</button>
				<button
					ref={previewTriggerRef}
					type="button"
					className={buttonVariants({ variant: "outline", size: "sm" })}
					aria-haspopup="dialog"
					aria-expanded={previewOpen}
					// RT4 (Safari): mousedown không focus button trên Safari nên
					// relatedTarget = null, blur header bắn PATCH trước khi onClick
					// kịp set previewOpen — chặn mặc định để focus ở nguyên chỗ.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => setPreviewOpen(true)}
				>
					<Eye aria-hidden="true" className="size-4" />
					Xem trước
				</button>
				{dirtySlots.size > 0 && (
					<span className="flex items-center gap-1.5 text-amber-600 text-xs">
						<span
							aria-hidden="true"
							className="inline-block size-2 rounded-full bg-amber-500"
						/>
						Có thay đổi chưa lưu
					</span>
				)}
			</div>

			<div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
				<aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto">
					<TestOutline
						sections={sections}
						active={{
							part: currentSlot ?? "",
							group: activePosition.group ?? undefined,
							question: activePosition.question ?? undefined,
						}}
						onSelect={jumpTo}
						collapsed={outlineCollapsed}
						onCollapsedChange={setOutlineCollapsed}
					/>
				</aside>

				<Card className="gap-4 p-5">
					{currentSlot !== null &&
					(partsBySlot.has(currentSlot) || activeInitialized) ? (
						<PartForm
							key={`${currentSlot}:${activeSaved?.updatedAt ?? "draft"}`}
							ref={partFormRef}
							skill={skill}
							slot={currentSlot}
							slotLabel={
								slots.find((slot) => slot.part === currentSlot)?.label ??
								currentSlot
							}
							testId={testId}
							saved={activeSaved}
							testReady={detail.status === "ready"}
							saving={savePartMutation.isPending}
							// Form remount khi refetch (lưu part, upload audio) —
							// khôi phục nháp đang soạn thay vì reset về bản đã lưu.
							initialValue={drafts.get(currentSlot)?.value}
							// Số câu đầu theo fold của cả đề (cùng nguồn với cây).
							qStart={currentQStart}
							focusTarget={focusTarget}
							onFocusConsumed={handleFocusConsumed}
							onActivePositionChange={handleActivePositionChange}
							initialView={viewStateBySlot.get(currentSlot)}
							onDraftChange={onDraftChange}
							onSave={(input, snapshot) =>
								savePartMutation.mutateAsync({
									slot: currentSlot,
									input,
									snapshot,
								})
							}
							onAudioChanged={() => {
								setDrafts((previous) => {
									if (currentSlot === null) return previous;
									const current = previous.get(currentSlot);
									if (!current || current.dirty) return previous;
									const next = new Map(previous);
									next.delete(currentSlot);
									return next;
								});
								void refresh();
							}}
							onDelete={() => deletePartMutation.mutate(currentSlot)}
							deleting={deletePartMutation.isPending}
						/>
					) : (
						<div className="flex flex-col items-center gap-3 py-10 text-center">
							<p className="font-medium text-sm">
								Chưa có nội dung cho{" "}
								{slots.find((slot) => slot.part === currentSlot)?.label}.
							</p>
							<p className="text-muted-foreground text-sm">
								Thêm nội dung để bắt đầu soạn câu hỏi cho part này.
							</p>
							<button
								type="button"
								className={buttonVariants({ size: "sm" })}
								onClick={() =>
									setInitializedSlots((previous) => {
										if (currentSlot === null) return previous;
										const next = new Set(previous);
										next.add(currentSlot);
										return next;
									})
								}
							>
								Thêm nội dung
							</button>
						</div>
					)}
				</Card>
			</div>

			{answersOpen && (
				<AnswersCheckingPanel
					rows={answerRows}
					onJump={(target) =>
						jumpTo({
							part: target.part,
							group: target.group,
							question: target.question,
						})
					}
				/>
			)}

			{readyIssues.length > 0 && detail.status !== "ready" && (
				<div className="rounded-md border bg-muted/40 p-3">
					<p className="font-medium text-sm">
						Còn {readyIssues.length} việc để bộ đề đủ điều kiện xuất bản:
					</p>
					<ul className="mt-1 list-disc pl-5 text-muted-foreground text-xs">
						{readyIssues.slice(0, 8).map((issue) => (
							<li key={`${issue.path}:${issue.message}`}>
								{formatIssue(issue, skill)}
							</li>
						))}
					</ul>
				</div>
			)}

			{previewOpen && previewTabs && (
				<TestPreviewOverlay
					testTitle={detail.title}
					tabs={previewTabs}
					initialPart={currentSlot}
					onClose={() => {
						setPreviewOpen(false);
						// RT4: blur vào overlay đã HOÃN lưu header — flush đúng một
						// lần khi đóng (điều kiện dirty đánh giá tại thời điểm này).
						if (headerValue && headerDirty) saveHeader(headerValue);
					}}
					triggerRef={previewTriggerRef}
				/>
			)}
		</section>
	);
}
