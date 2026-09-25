import { emptyComposer, emptyItem, isAutoSkill } from "./assignment-presets";
import type { ComposerValue } from "./prompt-composer";

/**
 * Pure composer field transitions for `/assignments/new` (phase-01 FR5).
 * `new.tsx` owns the interaction (window.confirm is hoisted OUT of the
 * setState updater — React StrictMode double-fires updaters, red-team #8);
 * this module owns the state math so it can be unit tested.
 */

export type StructuralChangeKind = "skill" | "part" | "type";

/**
 * Classify the structural change carried by a patch, or null when the patch
 * is not structural. ChipFilter re-fires onChange for the already-selected
 * option — equal values must classify as null so a stray click neither
 * confirms nor wipes composed content (#269).
 */
export function structuralChangeKind(
	current: ComposerValue,
	patch: Partial<ComposerValue>,
): StructuralChangeKind | null {
	if (patch.skill !== undefined && patch.skill !== current.skill)
		return "skill";
	if (patch.part !== undefined && patch.part !== current.part) return "part";
	if (patch.type !== undefined && patch.type !== current.type) return "type";
	return null;
}

/**
 * Authored material whose loss would hurt: composed question content.
 * Meta fields (title/source/band/note) never trigger a confirm on their own;
 * imageUrl alone keeps its silent #269 reset (a stray URL must not pin the
 * teacher into a dialog).
 */
export function hasAuthoringContent(value: ComposerValue): boolean {
	if (value.items.some((item) => item.stem.trim() || item.answer.trim()))
		return true;
	return Boolean(
		value.passage.trim() ||
			value.prompt.trim() ||
			value.intro.trim() ||
			value.transcript.trim() ||
			value.cueTopic.trim() ||
			value.cuePoints.trim(),
	);
}

/**
 * Apply a field patch exactly like the pre-grid editor did, plus the FR5
 * carry-over rule: `transcript` survives part/type changes within one skill;
 * `intro` still resets on every part/type change (TYPE_HINTS text is
 * type-specific — keeping it would re-open the #269 word-limit leak);
 * `imageUrl` keeps the #269 behavior of resetting on every part/type change.
 * Skill changes still go through `emptyComposer` (full wipe, including
 * transcript — it is only carried within one skill).
 */
export function applyComposerFieldChange(
	current: ComposerValue,
	patch: Partial<ComposerValue>,
): ComposerValue {
	if (patch.skill !== undefined && patch.skill !== current.skill) {
		return {
			...current,
			...patch,
			...emptyComposer(patch.skill, patch.type ?? current.type),
		};
	}
	const partChanged = patch.part !== undefined && patch.part !== current.part;
	const typeChanged = patch.type !== undefined && patch.type !== current.type;
	if (partChanged || typeChanged) {
		const merged = { ...current, ...patch };
		return {
			...merged,
			intro: "",
			// Transcript is a shared listening resource — carried across
			// part/type changes within the same skill (FR5).
			transcript: merged.transcript,
			cueTopic: "",
			cuePoints: "",
			// Diagram URLs belong to one prompt — never let them leak
			// into the next type (#269 red-team #5).
			imageUrl: "",
			items: isAutoSkill(merged.skill) ? [emptyItem(merged.type)] : [],
		};
	}
	return { ...current, ...patch };
}
