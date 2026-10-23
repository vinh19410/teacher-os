import {
	ASSIGNMENT_PART_TYPES,
	ASSIGNMENT_TEST_PRESETS,
	assignmentQuestionSchema,
} from "@teacher-os/api/contracts";
import {
	type LibraryPartDto,
	type LibraryPartInput,
	type LibraryPartIssue,
	type LibraryQuestionGroup,
	type LibrarySkill,
	libraryPartUpsertSchema,
	libraryQuestionGroupSchema,
	validatePartForReady,
} from "@teacher-os/api/library-contracts";
import {
	emptyItem,
	type QuestionItem,
	qStartOf,
} from "@teacher-os/ui/components/assignments/editor/assignment-presets";
import { QuestionKeyEditor } from "@teacher-os/ui/components/assignments/editor/question-key-editor";
import {
	Button,
	buttonVariants,
} from "@teacher-os/ui/components/web-kit/button";
import { Field, Select } from "@teacher-os/ui/components/web-kit/field";
import {
	forwardRef,
	useEffect,
	useId,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { CardTabs } from "./card-tabs";
import type { GroupCardTab } from "./group-card";
import {
	addGroup,
	moveGroup,
	patchGroup,
	removeGroup,
	setGroupItems,
} from "./group-model";
import { PartContentFields } from "./part-content-fields";
import { PartGroupsPanel } from "./part-groups-panel";
import { formatIssue, messageLabel } from "./part-issues";
import {
	type FocusTarget,
	firstIssueFocusPlan,
	focusKeyOf,
	focusRowId,
	type PartFormHandle,
	type PartTabId,
	type PartViewState,
	type SaveFocusPlan,
	viewStateOnMoveGroup,
	viewStateOnRemoveGroup,
} from "./part-view-state";

export interface PartFormValue {
	type: string;
	title: string;
	band: string;
	source: string;
	intro: string;
	passage: string;
	transcript: string;
	imageUrl: string;
	questions: QuestionItem[];
	groups: LibraryQuestionGroup[];
	optionBank: string[];
	note: string;
}

export const BAND_OPTIONS = ["6.0", "6.5", "7.0", "7.5"] as const;

/** Dạng bài hợp lệ của slot theo catalog skill. */
export function slotTypes(
	skill: LibrarySkill,
	slot: string,
): readonly string[] {
	return ASSIGNMENT_PART_TYPES[skill]?.types[slot] ?? [];
}

/** Part mới chưa có dữ liệu — 1 câu rỗng để giáo viên gõ ngay. */
export function emptyPartValue(
	skill: LibrarySkill,
	slot: string,
): PartFormValue {
	const type = slotTypes(skill, slot)[0] ?? "";
	return {
		type,
		title: "",
		band: "6.0",
		source: "",
		intro: "",
		passage: "",
		transcript: "",
		imageUrl: "",
		questions: type ? [emptyItem(type)] : [],
		groups: [],
		optionBank: [],
		note: "",
	};
}

/** questions trên wire là `unknown[]` — chuẩn hóa từng câu qua schema gốc. */
export function normalizeQuestions(raw: unknown[]): QuestionItem[] {
	return raw.map((question) => {
		const parsed = assignmentQuestionSchema.safeParse(question);
		if (parsed.success) {
			// zod output cho phép undefined (nullish) — đút về đúng hình dạng
			// `AssignmentQuestion` (opts/pin: null tường minh) để dirty-compare
			// và QuestionKeyEditor nhận nguyên văn.
			const item: QuestionItem & {
				explanation?: string;
				answerSet?: string;
			} = {
				stem: parsed.data.stem,
				opts: parsed.data.opts ?? null,
				answer: parsed.data.answer,
				alts: parsed.data.alts,
				type: parsed.data.type ?? null,
				pin: parsed.data.pin ?? null,
			};
			if (typeof parsed.data.explanation === "string") {
				item.explanation = parsed.data.explanation;
			}
			if (typeof parsed.data.answerSet === "string") {
				item.answerSet = parsed.data.answerSet;
			}
			return item;
		}
		const fallbackType =
			typeof question === "object" &&
			question !== null &&
			"type" in question &&
			typeof question.type === "string"
				? question.type
				: "";
		return emptyItem(fallbackType);
	});
}

/** groups trên wire là unknown[] — rebuild theo thứ tự key cố định để
 * canonical (JSON.stringify) ổn định giữa group client-dựng và server-xuất
 * (khác key order → dirty "vĩnh viễn"). Group lỗi → bỏ qua. */
export function normalizeGroups(raw: unknown): LibraryQuestionGroup[] {
	if (!Array.isArray(raw)) return [];
	const groups: LibraryQuestionGroup[] = [];
	for (const entry of raw) {
		const parsed = libraryQuestionGroupSchema.safeParse(entry);
		if (!parsed.success) continue;
		const group = parsed.data;
		groups.push({
			id: group.id,
			type: group.type,
			instruction: group.instruction,
			startIndex: group.startIndex,
			count: group.count,
			optionBank: group.optionBank,
			answersInline: group.answersInline,
			splitContent: group.splitContent,
			dragDrop: group.dragDrop,
		});
	}
	return groups;
}

export function partValueFromDto(dto: LibraryPartDto): PartFormValue {
	return {
		type: dto.type,
		title: dto.title,
		band: dto.band,
		source: dto.source,
		intro: dto.intro,
		passage: dto.passage,
		transcript: dto.transcript,
		imageUrl: dto.imageUrl,
		questions: normalizeQuestions(dto.questions),
		groups: normalizeGroups(dto.groups),
		optionBank: dto.optionBank,
		note: dto.note,
	};
}

/** Chuẩn hóa value về hình dạng cố định để so sánh dirty/JSON ổn định. */
function canonicalPartValue(value: PartFormValue): string {
	return JSON.stringify({
		type: value.type,
		title: value.title,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		groups: value.groups,
		optionBank: value.optionBank,
		note: value.note,
	});
}

/** So sánh canonical 2 bản PartFormValue theo toàn bộ nội dung. */
export function arePartValuesEqual(
	a: PartFormValue,
	b: PartFormValue,
): boolean {
	return canonicalPartValue(a) === canonicalPartValue(b);
}

/** Dirty so với bản đã lưu (null = so với part rỗng của slot). */
export function isPartDirty(
	skill: LibrarySkill,
	slot: string,
	saved: LibraryPartDto | null,
	value: PartFormValue,
): boolean {
	const baseline = saved
		? partValueFromDto(saved)
		: emptyPartValue(skill, slot);
	return !arePartValuesEqual(baseline, value);
}

/**
 * Reconcile map drafts khi save part thành công.
 * - Nếu draft hiện tại khớp snapshot đã gửi: xóa draft để form remount theo bản server.
 * - Nếu người dùng đã gõ thêm ký tự mới (khác snapshot): giữ lại draft với dirty=true
 *   để không mất dữ liệu và useBlocker tiếp tục cảnh báo.
 */
export function reconcilePartDraftsOnSaveSuccess(
	drafts: ReadonlyMap<string, { dirty: boolean; value: PartFormValue }>,
	slot: string,
	snapshot: PartFormValue,
): ReadonlyMap<string, { dirty: boolean; value: PartFormValue }> {
	const currentDraft = drafts.get(slot);
	if (!currentDraft) return drafts;
	if (arePartValuesEqual(currentDraft.value, snapshot)) {
		const next = new Map(drafts);
		next.delete(slot);
		return next;
	}
	if (!currentDraft.dirty) {
		const next = new Map(drafts);
		next.set(slot, { ...currentDraft, dirty: true });
		return next;
	}
	return drafts;
}

export type BuiltPartPayload =
	| { ok: true; input: LibraryPartInput }
	| { ok: false; errors: Record<string, string> };

const FIELD_ERROR_TEXT: Record<string, string> = {
	type: "Dạng bài không hợp lệ cho part này.",
	title: "Tiêu đề part 1–200 ký tự.",
	band: "Chọn band 6.0 / 6.5 / 7.0 / 7.5.",
	source: "Nguồn tối đa 200 ký tự.",
	passage: "Passage tối đa 20.000 ký tự.",
	transcript: "Transcript tối đa 10.000 ký tự.",
	intro: "Hướng dẫn tối đa 2000 ký tự.",
	note: "Ghi chú tối đa 2000 ký tự.",
	imageUrl: "Ảnh phải là URL https hợp lệ (tối đa 500 ký tự).",
	questions: "Tối đa 40 câu hỏi.",
	optionBank: "Ngân hàng đáp án tối đa 8 mục.",
	groups: "Dữ liệu nhóm câu không hợp lệ.",
};

/** Build input PUT theo ĐÚNG `libraryPartUpsertSchema` (phase 2). */
export function partInputFromValue(
	slot: string,
	value: PartFormValue,
): BuiltPartPayload {
	const parsed = libraryPartUpsertSchema.safeParse({
		part: slot,
		type: value.type,
		title: value.title,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		groups: value.groups,
		optionBank: value.optionBank,
		note: value.note,
	});
	if (!parsed.success) {
		const errors: Record<string, string> = {};
		for (const issue of parsed.error.issues) {
			// Lỗi tầng nhóm giữ path đầy đủ ("groups.1.optionBank") để
			// GroupCard tra đúng field; field khác giữ key cấp 1 như cũ.
			const key =
				issue.path[0] === "groups"
					? issue.path.join(".")
					: typeof issue.path[0] === "string"
						? issue.path[0]
						: "title";
			if (!errors[key]) {
				// Message superRefine (path[0] trùng key field cũ) phải được dịch
				// bởi MESSAGE_LABELS trước — FIELD_ERROR_TEXT[path[0]] là text của
				// field khác (review RS-F2: "answer set..." hiện thành "Tối đa 40
				// câu hỏi.").
				errors[key] =
					messageLabel(issue.message) ?? FIELD_ERROR_TEXT[key] ?? issue.message;
			}
		}
		return { ok: false, errors };
	}
	return { ok: true, input: parsed.data };
}

/**
 * `canSave` — cùng hàm validate với server (phase 2). Title rỗng KHÔNG phải
 * điều kiện ready phía server, nên thay tạm title nháp để zod không che các
 * lý do thật (passage/audio/questions). Parse hỏng vì lý do cấu trúc
 * (vd > 40 câu) vẫn được xếp vào issues.
 */
export function partReadyIssues(
	skill: LibrarySkill,
	slot: string,
	value: PartFormValue,
	savedAudioName?: string,
): LibraryPartIssue[] {
	const draftTitle = value.title.trim() || "(chưa đặt tiêu đề part)";
	const parsed = libraryPartUpsertSchema.safeParse({
		part: slot,
		type: value.type,
		title: draftTitle,
		band: value.band,
		source: value.source,
		intro: value.intro,
		passage: value.passage,
		transcript: value.transcript,
		imageUrl: value.imageUrl,
		questions: value.questions,
		groups: value.groups,
		optionBank: value.optionBank,
		note: value.note,
		audioName: savedAudioName ?? "",
	});
	if (!parsed.success) {
		return parsed.error.issues.map((issue) => ({
			// Lỗi tầng nhóm giữ path đầy đủ ("groups.1.optionBank") để hiển
			// thị đúng field của nhóm; key khác giữ cấp 1 như cũ.
			path:
				issue.path[0] === "groups"
					? issue.path.join(".")
					: typeof issue.path[0] === "string"
						? issue.path[0]
						: "title",
			message:
				messageLabel(issue.message) ??
				FIELD_ERROR_TEXT[issue.path[0] as string] ??
				issue.message,
		}));
	}
	return validatePartForReady(skill, parsed.data);
}

export interface PartFormProps {
	skill: LibrarySkill;
	slot: string;
	slotLabel: string;
	testId: string;
	/** Part đã lưu trên server (null = slot trống). */
	saved: LibraryPartDto | null;
	/** Đề đang `ready`: khóa xóa part/audio, nội dung vẫn sửa được. */
	testReady: boolean;
	saving: boolean;
	/** Nháp đang soạn của slot (state lift ở parent) — form bị remount sau
	 * khi lưu / upload audio (key theo `saved.updatedAt`) sẽ khôi phục nội
	 * dung đang gõ thay vì reset về bản đã lưu. */
	initialValue?: PartFormValue;
	/** #424 Task 3.4 — số câu đầu của part theo fold từ trang; vắng mặt thì
	 * fallback `qStartOf(skill, slot)` (render độc lập trong test). */
	qStart?: number;
	/** #424 Task 3.4 — cây điều hướng yêu cầu focus nhóm/câu (consume-once
	 * theo nonce; trang reset null qua `onFocusConsumed`). */
	focusTarget?: FocusTarget | null;
	onFocusConsumed?: (nonce: number) => void;
	/** Báo vị trí soạn (tab/nhóm/hàng) + view-state lên trang sau mọi thay
	 * đổi — cây tô `aria-current` và giữ view qua remount. */
	onActivePositionChange?: (pos: {
		group: number | null;
		question: number | null;
		view?: PartViewState;
	}) => void;
	/** Khôi phục view-state sau remount (trang giữ `viewStateBySlot`). */
	initialView?: PartViewState;
	/** Báo dirty + giá trị nháp lên parent (tab chấm đỏ, ready-check). */
	onDraftChange: (
		slot: string,
		draft: { dirty: boolean; value: PartFormValue },
	) => void;
	onSave: (
		input: LibraryPartInput,
		snapshot: PartFormValue,
	) => Promise<unknown>;
	/** Sau khi audio upload/xóa thành công — parent refetch detail. */
	onAudioChanged: () => void;
	onDelete: () => void;
	deleting: boolean;
}

export const PartForm = forwardRef<PartFormHandle, PartFormProps>(
	function PartForm(
		{
			skill,
			slot,
			slotLabel,
			testId,
			saved,
			testReady,
			initialValue,
			qStart,
			focusTarget,
			onFocusConsumed,
			onActivePositionChange,
			initialView,
			onDraftChange,
			onSave,
			onAudioChanged,
			onDelete,
			deleting,
		},
		ref,
	) {
		const uid = useId();
		const [value, setValue] = useState<PartFormValue>(
			() =>
				initialValue ??
				(saved ? partValueFromDto(saved) : emptyPartValue(skill, slot)),
		);
		const [view, setView] = useState<PartViewState>(
			() =>
				initialView ?? {
					partTab: "content",
					openGroup: value.groups.length > 0 ? 0 : null,
					groupTabs: {},
					openRowByGroup: {},
				},
		);
		// Id đích cuộn chờ commit: scroll trong rAF có thể chạy TRƯỚC khi
		// setView commit (hàng còn nằm trong subtree `hidden` → scrollIntoView
		// no-op, không retry — kongming wave-5). Layout effect chạy ngay sau
		// commit nên `hidden` đã được gỡ.
		const pendingScrollId = useRef<string | null>(null);
		useLayoutEffect(() => {
			const id = pendingScrollId.current;
			if (id === null) return;
			pendingScrollId.current = null;
			document.getElementById(id)?.scrollIntoView({ block: "start" });
		}, [view]);

		const [showErrors, setShowErrors] = useState(false);
		const [live, setLive] = useState("");

		// Dirty so với bản đã lưu: memo baseline + canonical STRING (#426 F3,
		// kongming gate #3 — arePartValuesEqual stringify CẢ HAI đối số nên
		// memo object không đỡ được passage 20k mỗi render; baseline stringify
		// 1 lần/baseline, mỗi render chỉ stringify value).
		const baseline = useMemo(
			() => (saved ? partValueFromDto(saved) : emptyPartValue(skill, slot)),
			[saved, skill, slot],
		);
		const baselineKey = useMemo(() => canonicalPartValue(baseline), [baseline]);
		const dirty = baselineKey !== canonicalPartValue(value);
		useEffect(() => {
			onDraftChange(slot, { dirty, value });
			// saved đổi (remount bằng key nên không xảy ra trong một mount) —
			// deps đủ để reporter luôn bắn trạng thái nháp mới nhất.
		}, [dirty, slot, onDraftChange, value]);

		// Vị trí soạn hiện hành (tab/nhóm/hàng) báo lên trang — cây điều
		// hướng tô aria-current đúng và trang giữ view-state qua remount.
		useEffect(() => {
			onActivePositionChange?.({
				group: view.openGroup,
				question:
					view.openGroup !== null
						? (view.openRowByGroup[view.openGroup] ?? null)
						: null,
				view,
			});
		}, [view, onActivePositionChange]);

		const patch = (next: Partial<PartFormValue>) =>
			setValue((previous) => ({ ...previous, ...next }));

		const partQStart = qStart ?? qStartOf(skill, slot);
		const slotIndex =
			(ASSIGNMENT_TEST_PRESETS[skill]?.slots ?? []).findIndex(
				(entry) => entry.part === slot,
			) + 1;
		const issues =
			showErrors || testReady
				? partReadyIssues(skill, slot, value, saved?.audio?.name)
				: [];
		const errorFor = (field: string): string | undefined =>
			showErrors
				? issues.find((issue) => issue.path === field)?.message
				: undefined;
		const questionIssueCount = issues.filter((issue) =>
			issue.path.startsWith("questions"),
		).length;

		const applyFocusPlan = (plan: SaveFocusPlan) => {
			setView((previous) => {
				const next: PartViewState = {
					...previous,
					partTab: plan.partTab,
					groupTabs: { ...previous.groupTabs },
					openRowByGroup: { ...previous.openRowByGroup },
				};
				if (plan.group !== undefined) {
					next.openGroup = plan.group;
					next.groupTabs[plan.group] = plan.groupTab ?? "questions";
					if (plan.row !== undefined) {
						next.openRowByGroup[plan.group] = plan.row;
					}
				}
				return next;
			});
			pendingScrollId.current =
				plan.fieldKey !== undefined
					? `${uid}-${plan.fieldKey}`
					: plan.group !== undefined && plan.row !== undefined
						? `group-${slot}-${plan.group}-q${plan.row}`
						: plan.group !== undefined
							? `group-${slot}-${plan.group}`
							: null;
		};

		const handleSave = async (): Promise<boolean> => {
			const built = partInputFromValue(slot, value);
			if (!built.ok) {
				setShowErrors(true);
				setLive("Chưa lưu được — kiểm tra các trường có lỗi.");
				const plan = firstIssueFocusPlan(built.errors, value);
				if (plan) applyFocusPlan(plan);
				return false;
			}
			try {
				await onSave(built.input, value);
				setShowErrors(false);
				setLive("Đã lưu part.");
				return true;
			} catch {
				setLive("Chưa lưu được part — xem thông báo lỗi.");
				return false;
			}
		};

		// Không dep array — handle mới mỗi render để không đóng băng closure
		// `value` (F2); toolbar giữ handle qua ref luôn thấy bản mới nhất.
		useImperativeHandle(ref, () => ({ save: handleSave }));

		// focusTarget consume-once theo key serialized; nonce tăng mỗi lần
		// bấm cây. Sau remount, trang đã reset focusTarget=null qua
		// onFocusConsumed nên instance mới không re-fire (key rỗng).
		const consumedFocusKey = useRef("");
		useEffect(() => {
			if (!focusTarget) return;
			const key = focusKeyOf(focusTarget);
			if (key === "" || key === consumedFocusKey.current) return;
			consumedFocusKey.current = key;
			const gi = focusTarget.group;
			// Part phẳng (không nhóm): id hàng của AnswerKeyGrid là `${slot}-q${n}`
			// (partId={slot}), không có prefix `group-…`; không đặt openRowByGroup
			// vì chế độ phẳng không có hàng thu gọn (kongming wave-3/4 F2).
			const flat = value.groups.length === 0;
			setView((previous) => ({
				...previous,
				partTab: "questions",
				openGroup: gi,
				groupTabs: { ...previous.groupTabs, [gi]: "questions" },
				openRowByGroup:
					flat || focusTarget.question === undefined
						? previous.openRowByGroup
						: { ...previous.openRowByGroup, [gi]: focusTarget.question },
			}));
			pendingScrollId.current = focusRowId(
				slot,
				gi,
				focusTarget.question,
				flat,
			);
			onFocusConsumed?.(focusTarget.nonce);
		}, [focusTarget, slot, onFocusConsumed]);

		const setGroupTab = (gi: number, tab: GroupCardTab) =>
			setView((previous) => ({
				...previous,
				groupTabs: { ...previous.groupTabs, [gi]: tab },
			}));

		const setOpenRow = (gi: number, row: number | null) =>
			setView((previous) => ({
				...previous,
				openRowByGroup: { ...previous.openRowByGroup, [gi]: row },
			}));

		const toggleGroup = (gi: number) =>
			setView((previous) => ({
				...previous,
				openGroup: previous.openGroup === gi ? null : gi,
			}));

		const handleAddGroup = () => {
			const type = value.groups.at(-1)?.type ?? value.type;
			const next = addGroup(value, type);
			const gi = next.groups.length - 1;
			setValue(next);
			// Nhóm mới tự mở ở tab Câu hỏi, hàng đầu mở sẵn.
			setView((previous) => ({
				...previous,
				partTab: "questions",
				openGroup: gi,
				groupTabs: { ...previous.groupTabs, [gi]: "questions" },
				openRowByGroup: { ...previous.openRowByGroup, [gi]: 0 },
			}));
		};

		const handleRemoveGroup = (gi: number) => {
			const next = removeGroup(value, gi);
			setValue(next);
			setView((previous) =>
				viewStateOnRemoveGroup(previous, gi, next.groups.length),
			);
		};

		const handleMoveGroup = (gi: number, dir: -1 | 1) => {
			setValue(moveGroup(value, gi, dir));
			setView((previous) => viewStateOnMoveGroup(previous, gi, dir));
		};

		const handleGroupItems = (gi: number, items: QuestionItem[]) => {
			setValue((previous) => setGroupItems(previous, gi, items));
			setView((previous) => {
				const row = previous.openRowByGroup[gi] ?? null;
				const clamped = row === null ? null : Math.min(row, items.length - 1);
				return clamped === row
					? previous
					: {
							...previous,
							openRowByGroup: { ...previous.openRowByGroup, [gi]: clamped },
						};
			});
		};

		const hasGroups = value.groups.length > 0;

		return (
			<section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
				<header className="flex flex-wrap items-center gap-3">
					<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-primary-foreground text-xs">
						{slotIndex}
					</span>
					<div className="min-w-0">
						<h3 className="font-semibold text-base">
							{value.title.trim() || slotLabel}
						</h3>
						<p aria-hidden="true" className="text-muted-foreground text-xs">
							{hasGroups
								? `${value.groups.length} nhóm, ${value.questions.length} câu`
								: `${value.questions.length} câu`}
						</p>
					</div>
					{saved && (
						<button
							type="button"
							disabled={testReady || deleting}
							title={
								testReady
									? "Đề đã xuất bản — hãy hạ về nháp để xóa part."
									: undefined
							}
							onClick={() => {
								if (
									window.confirm(
										`Xóa nội dung ${slotLabel}? Câu hỏi và audio (nếu có) sẽ bị xóa vĩnh viễn.`,
									)
								) {
									onDelete();
								}
							}}
							className={buttonVariants({
								variant: "destructive",
								size: "sm",
								className: testReady ? "pointer-events-none opacity-50" : "",
							})}
						>
							{deleting ? "Đang xóa…" : "Xóa part"}
						</button>
					)}
					{dirty && (
						<span className="flex items-center gap-1.5 text-amber-600 text-xs">
							<span
								aria-hidden="true"
								className="inline-block size-2 rounded-full bg-amber-500"
							/>
							Có thay đổi chưa lưu
						</span>
					)}
					<p
						aria-live="polite"
						role="status"
						className="text-muted-foreground text-xs"
					>
						{live}
					</p>
				</header>

				<CardTabs
					tabs={[
						{ id: "content", label: "Nội dung" },
						{
							id: "questions",
							label: "Câu hỏi",
							// Acceptance #424: badge đếm số NHÓM khi part có nhóm;
							// part phẳng đếm số câu.
							count:
								value.groups.length > 0
									? value.groups.length
									: value.questions.length,
						},
					]}
					active={view.partTab}
					onSelect={(id) =>
						setView((previous) => ({
							...previous,
							partTab: id as PartTabId,
						}))
					}
					idPrefix={`${uid}-part`}
					aria-label={`Các tab ${slotLabel}`}
				/>

				<div
					id={`${uid}-part-panel-content`}
					role="tabpanel"
					aria-labelledby={`${uid}-part-tab-content`}
					hidden={view.partTab !== "content"}
				>
					<PartContentFields
						uid={uid}
						skill={skill}
						slot={slot}
						slotLabel={slotLabel}
						testId={testId}
						value={value}
						saved={saved}
						testReady={testReady}
						showErrors={showErrors}
						errorFor={errorFor}
						patch={patch}
						onAudioChanged={onAudioChanged}
					/>
				</div>

				<div
					id={`${uid}-part-panel-questions`}
					role="tabpanel"
					aria-labelledby={`${uid}-part-tab-questions`}
					hidden={view.partTab !== "questions"}
					className="flex flex-col gap-4"
				>
					{!hasGroups && (
						<>
							<Field
								label="Dạng bài"
								required
								htmlFor={`${uid}-type`}
								error={showErrors ? errorFor("type") : undefined}
							>
								<Select
									id={`${uid}-type`}
									value={value.type}
									onChange={(event) => {
										const type = event.target.value;
										// Đổi dạng: câu giữ nội dung (stem/answer), chỉ câu
										// rỗng mới nhận shape của dạng mới (same as web composer).
										patch({
											type,
											questions: value.questions.map((question) =>
												question.stem || question.answer
													? question
													: emptyItem(type),
											),
										});
									}}
								>
									{slotTypes(skill, slot).map((type) => (
										<option key={type} value={type}>
											{type}
										</option>
									))}
								</Select>
							</Field>
							<QuestionKeyEditor
								skill={skill}
								partId={slot}
								typeId={value.type}
								intro={value.intro}
								items={value.questions as QuestionItem[]}
								showErrors={showErrors}
								status={testReady ? "ready" : "draft"}
								imageUrl={value.imageUrl}
								optionBank={value.optionBank}
								onIntroChange={(intro) => patch({ intro })}
								onImageUrlChange={(imageUrl) => patch({ imageUrl })}
								onItemsChange={(questions) => patch({ questions })}
								onBankChange={(optionBank) => patch({ optionBank })}
								imageUrlError={errorFor("imageUrl")}
								optionBankError={errorFor("optionBank")}
								questionsError={
									questionIssueCount > 0
										? `${questionIssueCount} câu hỏi chưa đạt điều kiện xuất bản — xem chi tiết ở danh sách lý do.`
										: undefined
								}
								qStartOverride={partQStart}
								showExplanation
							/>
							<div>
								<Button
									type="button"
									variant="outline"
									onClick={() => setValue(addGroup(value, value.type))}
								>
									Chia thành nhiều nhóm câu
								</Button>
							</div>
						</>
					)}
					{hasGroups && (
						<PartGroupsPanel
							skill={skill}
							slot={slot}
							value={value}
							view={view}
							qStart={partQStart}
							showErrors={showErrors}
							testReady={testReady}
							errorFor={errorFor}
							onToggleGroup={toggleGroup}
							onSetGroupTab={setGroupTab}
							onSetOpenRow={setOpenRow}
							onPatchGroup={(gi, groupPatch) =>
								setValue((previous) => patchGroup(previous, gi, groupPatch))
							}
							onGroupItemsChange={handleGroupItems}
							onMoveGroup={handleMoveGroup}
							onRemoveGroup={handleRemoveGroup}
							onAddGroup={handleAddGroup}
							onImageUrlChange={(imageUrl) => patch({ imageUrl })}
						/>
					)}
				</div>

				{showErrors && issues.length > 0 && (
					<div
						role="alert"
						className="rounded-md border border-destructive/40 bg-destructive/5 p-3"
					>
						<p className="font-medium text-destructive text-sm">
							{slotLabel} chưa đạt điều kiện lưu/xuất bản:
						</p>
						<ul className="mt-1 list-disc pl-5 text-destructive text-xs">
							{issues.map((issue) => (
								<li key={`${issue.path}:${issue.message}`}>
									{formatIssue(issue, skill)}
								</li>
							))}
						</ul>
					</div>
				)}

				{testReady && (
					<p className="text-muted-foreground text-xs">
						Đề đã xuất bản: vẫn sửa được nội dung (server sẽ kiểm tra lại luật
						«ready» khi lưu), nhưng phải hạ về nháp để xóa part hoặc audio.
					</p>
				)}
			</section>
		);
	},
);
