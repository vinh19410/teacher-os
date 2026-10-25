import type {
	LibraryPartDto,
	LibraryPartInput,
} from "@teacher-os/api/library-contracts";
import {
	type PartFormValue,
	partInputFromValue,
	partValueFromDto,
} from "./part-form";

/**
 * Trạng thái resolve của một slot (C4 — một bản luật duy nhất cho preview
 * và ready overlay; red-team RT3/RT12).
 */
export type EffectivePartState =
	| "ok"
	| "saved-fallback"
	| "draft-invalid"
	| "empty";

export interface EffectivePart {
	slot: string;
	/** null = không có nội dung hợp lệ để render (`draft-invalid`/`empty`). */
	input: LibraryPartInput | null;
	state: EffectivePartState;
}

/**
 * Luật chọn draft/saved cho MỘT slot: draft ĐANG dirty và parse đạt → dùng
 * bản nháp (`ok`); draft hỏng schema → lùi về bản đã lưu nếu có
 * (`saved-fallback`), không có thì `draft-invalid` (input null); draft sạch
 * hoặc chưa từng mở → bản đã lưu (`ok`) hoặc `empty` (input null).
 *
 * `effectivePartsFor` gọi hàm này cho từng slot — không nhân đôi luật.
 */
export function resolveEffectivePart(
	slot: string,
	saved: LibraryPartDto | undefined,
	draft: { dirty: boolean; value: PartFormValue } | undefined,
	opts: {
		/** Bản đã parse cache theo slot (từ `partsBySlot`). */
		savedInputs?: ReadonlyMap<string, LibraryPartInput>;
		/** Seam cho test đếm lần gọi; mặc định parse thật. */
		parse?: typeof partInputFromValue;
	} = {},
): EffectivePart {
	const parse = opts.parse ?? partInputFromValue;
	if (draft?.dirty) {
		const built = parse(slot, draft.value);
		// Draft hỏng schema: vẫn hiển thị qua lý do ở form part;
		// ở đây dùng bản đã lưu (nếu có) để không mất lý do khác.
		if (built.ok) {
			if (saved?.audio?.name) {
				built.input.audioName = saved.audio.name;
			}
			return { slot, input: built.input, state: "ok" };
		}
		if (!saved) return { slot, input: null, state: "draft-invalid" };
		const cached = opts.savedInputs?.get(slot);
		if (cached) {
			if (saved.audio?.name) cached.audioName = saved.audio.name;
			return { slot, input: cached, state: "saved-fallback" };
		}
		const builtSaved = parse(slot, partValueFromDto(saved));
		if (builtSaved.ok) {
			if (saved.audio?.name) {
				builtSaved.input.audioName = saved.audio.name;
			}
			return { slot, input: builtSaved.input, state: "saved-fallback" };
		}
		// Saved cũng hỏng (hiện tượng #425): không có gì render được.
		return { slot, input: null, state: "draft-invalid" };
	}
	if (!saved) return { slot, input: null, state: "empty" };
	const cached = opts.savedInputs?.get(slot);
	if (cached) {
		if (saved.audio?.name) cached.audioName = saved.audio.name;
		return { slot, input: cached, state: "ok" };
	}
	const built = parse(slot, partValueFromDto(saved));
	if (built.ok) {
		if (saved.audio?.name) {
			built.input.audioName = saved.audio.name;
		}
		return { slot, input: built.input, state: "ok" };
	}
	// Saved corrupt không draft: slot này render được gì thì render, không có
	// thì rỗng — form part là nơi báo lỗi chi tiết.
	return { slot, input: null, state: "empty" };
}

/**
 * Khối derived "ready overlay" của trang soạn đề (trước đây nằm trong
 * `$testId.tsx`, tách ra để unit-test được — issue #426 F3).
 *
 * Với mỗi slot: draft ĐANG dirty và parse đạt → dùng bản nháp; draft hỏng
 * schema → lùi về bản đã lưu (nếu có) để không mất lý do khác; slot trống →
 * bỏ qua. `savedInputs` cho phép dùng bản đã parse cache theo `partsBySlot`
 * (memo per-slot: keystroke chỉ parse đúng 1 part đang sửa).
 *
 * LƯU Ý: phần tử của mảng trả về có thể là object dùng chung từ
 * `savedInputs` (override `audioName` idempotent) — caller KHÔNG được mutate.
 */
export function effectivePartsFor(
	slots: ReadonlyArray<{ part: string }>,
	partsBySlot: ReadonlyMap<string, LibraryPartDto>,
	drafts: ReadonlyMap<string, { dirty: boolean; value: PartFormValue }>,
	opts: {
		/** Bản đã parse cache theo slot (từ `partsBySlot`). */
		savedInputs?: ReadonlyMap<string, LibraryPartInput>;
		/** Seam cho test đếm lần gọi; mặc định parse thật. */
		parse?: typeof partInputFromValue;
	} = {},
): LibraryPartInput[] {
	const parts: LibraryPartInput[] = [];
	for (const slot of slots) {
		const resolved = resolveEffectivePart(
			slot.part,
			partsBySlot.get(slot.part),
			drafts.get(slot.part),
			opts,
		);
		if (resolved.input) parts.push(resolved.input);
	}
	return parts;
}
