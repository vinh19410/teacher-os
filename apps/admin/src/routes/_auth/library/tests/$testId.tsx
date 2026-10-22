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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { libraryErrorMessage } from "@/components/library/library-error";
import {
	PartForm,
	type PartFormValue,
	partInputFromValue,
	partValueFromDto,
} from "@/components/library/part-form";
import { formatIssue } from "@/components/library/part-issues";
import { PartTabs } from "@/components/library/part-tabs";
import { PublishBar } from "@/components/library/publish-bar";
import {
	buildUpdatePayload,
	formatTimeLimit,
	TestHeaderForm,
	type TestHeaderFormValue,
} from "@/components/library/test-header-form";
import { isHttpError } from "@/lib/query-client";
import {
	deleteLibraryPart,
	libraryTestQueryOptions,
	setLibraryTestStatus,
	updateLibraryTest,
	upsertLibraryPart,
} from "@/lib/repos/library";

/**
 * Trang edit bộ đề (phase 6): header PATCH khi blur/lưu, tab theo slot
 * (Passage 1..3 / Section 1..4), form part từng tab + PUT, thanh xuất bản
 * với lý do chặn từ `validateTestReady` (một nguồn sự thật với server).
 * Rời trang khi còn thay đổi chưa lưu → xác nhận qua `useBlocker`.
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
		JSON.stringify(headerValue) !== JSON.stringify(savedHeader);
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
		onSuccess: () => {
			toast.success("Đã lưu thông tin bộ đề.");
			void queryClient.invalidateQueries({
				queryKey: ["admin", "library", "test", testId],
			});
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

	const [activeSlot, setActiveSlot] = useState<string | null>(null);
	const [initializedSlots, setInitializedSlots] = useState<ReadonlySet<string>>(
		new Set(),
	);

	const skill: LibrarySkill | null =
		detail && isLibrarySkill(detail.skill) ? detail.skill : null;
	const slots = skill ? ASSIGNMENT_TEST_PRESETS[skill].slots : [];
	const currentSlot =
		activeSlot && slots.some((slot) => slot.part === activeSlot)
			? activeSlot
			: (slots[0]?.part ?? null);

	const partsBySlot = useMemo(() => {
		const map = new Map<string, LibraryPartDto>();
		for (const part of detail?.parts ?? []) map.set(part.part, part);
		return map;
	}, [detail?.parts]);

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
		queryClient.invalidateQueries({
			queryKey: ["admin", "library", "test", testId],
		});

	const savePartMutation = useMutation({
		mutationFn: ({ slot, input }: { slot: string; input: LibraryPartInput }) =>
			upsertLibraryPart(testId, slot, input),
		onSuccess: async (_data, variables) => {
			const label =
				slots.find((entry) => entry.part === variables.slot)?.label ??
				variables.slot;
			toast.success(`Đã lưu ${label}.`);
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
	const effectiveParts = useMemo(() => {
		if (!skill) return [];
		const parts: LibraryPartInput[] = [];
		for (const slot of slots) {
			const draft = drafts.get(slot.part);
			if (draft?.dirty) {
				const built = partInputFromValue(slot.part, draft.value);
				// Draft hỏng schema: vẫn hiển thị qua lý do ở form part;
				// ở đây dùng bản đã lưu (nếu có) để không mất lý do khác.
				if (built.ok) {
					parts.push(built.input);
					continue;
				}
			}
			const saved = partsBySlot.get(slot.part);
			if (saved) {
				const built = partInputFromValue(slot.part, partValueFromDto(saved));
				if (built.ok) parts.push(built.input);
			}
		}
		return parts;
	}, [skill, slots, drafts, partsBySlot]);

	const readyIssues = useMemo(
		() => (skill ? validateTestReady(skill, effectiveParts) : []),
		[skill, effectiveParts],
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

	return (
		<section
			aria-label={`Chỉnh sửa bộ đề ${detail.title}`}
			className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-6"
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

			<div>
				<PartTabs
					slots={slots}
					active={currentSlot ?? ""}
					dirtySlots={dirtySlots}
					filledSlots={new Set(partsBySlot.keys())}
					onSelect={setActiveSlot}
				/>
				<div
					role="tabpanel"
					id={`panel-${currentSlot ?? ""}`}
					aria-labelledby={`tab-${currentSlot ?? ""}`}
					className="rounded-r-md rounded-b-md border border-t-0 p-5"
				>
					{currentSlot === null ? null : partsBySlot.has(currentSlot) ||
						activeInitialized ? (
						<PartForm
							key={`${currentSlot}:${activeSaved?.updatedAt ?? "draft"}`}
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
							onDraftChange={onDraftChange}
							onSave={(input) =>
								savePartMutation.mutateAsync({ slot: currentSlot, input })
							}
							onAudioChanged={() => void refresh()}
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
				</div>
			</div>

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
		</section>
	);
}
