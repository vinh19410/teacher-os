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
	const parse = opts.parse ?? partInputFromValue;
	const parts: LibraryPartInput[] = [];
	for (const slot of slots) {
		const saved = partsBySlot.get(slot.part);
		const draft = drafts.get(slot.part);
		if (draft?.dirty) {
			const built = parse(slot.part, draft.value);
			// Draft hỏng schema: vẫn hiển thị qua lý do ở form part;
			// ở đây dùng bản đã lưu (nếu có) để không mất lý do khác.
			if (built.ok) {
				if (saved?.audio?.name) {
					built.input.audioName = saved.audio.name;
				}
				parts.push(built.input);
				continue;
			}
		}
		if (!saved) continue;
		const cached = opts.savedInputs?.get(slot.part);
		if (cached) {
			if (saved.audio?.name) cached.audioName = saved.audio.name;
			parts.push(cached);
			continue;
		}
		const built = parse(slot.part, partValueFromDto(saved));
		if (built.ok) {
			if (saved.audio?.name) {
				built.input.audioName = saved.audio.name;
			}
			parts.push(built.input);
		}
	}
	return parts;
}
