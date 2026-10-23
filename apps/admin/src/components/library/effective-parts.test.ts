import type { LibraryPartDto } from "@teacher-os/api/library-contracts";
import { describe, expect, it, vi } from "vitest";
import { effectivePartsFor } from "./effective-parts";
import { partInputFromValue, partValueFromDto } from "./part-form";

const SLOTS = [{ part: "s1" }, { part: "s2" }, { part: "s3" }, { part: "s4" }];

function makeDto(slot: string, index: number): LibraryPartDto {
	return {
		id: `part-${index}`,
		testId: "t1",
		part: slot,
		type: "form",
		title: `Section ${index}`,
		band: "6.5",
		source: "",
		intro: "",
		passage: "",
		transcript: "<p>T</p>",
		imageUrl: "",
		questions: [
			{ stem: "Q1", opts: null, answer: "1", alts: "", type: null, pin: null },
		],
		optionBank: [],
		groups: [],
		groupsCorrupt: false,
		note: "",
		audio: {
			name: `${slot}.mp3`,
			type: "audio/mpeg",
			size: 1,
			uploadedAt: "2026-10-02T00:00:00.000Z",
		},
		updatedAt: "2026-10-02T00:00:00.000Z",
	};
}

const partsBySlot = new Map(
	SLOTS.map((slot, index) => [slot.part, makeDto(slot.part, index)]),
);
function buildInput(slot: string, index: number) {
	const built = partInputFromValue(
		slot,
		partValueFromDto(makeDto(slot, index)),
	);
	if (!built.ok) throw new Error(`fixture parse failed: ${slot}`);
	return built.input;
}

const savedInputs = new Map(
	SLOTS.map((slot, index) => [slot.part, buildInput(slot.part, index)]),
);

describe("effectivePartsFor", () => {
	it("draft dirty parse đạt → overlay lên bản đã lưu, giữ audioName của saved", () => {
		const dirty = {
			...partValueFromDto(makeDto("s1", 0)),
			passage: "<p>đang soạn</p>",
		};
		const parts = effectivePartsFor(
			SLOTS,
			partsBySlot,
			new Map([["s1", { dirty: true, value: dirty }]]),
			{ savedInputs },
		);
		expect(parts.map((p) => p.part)).toEqual(["s1", "s2", "s3", "s4"]);
		expect(parts[0]?.passage).toBe("<p>đang soạn</p>");
		expect(parts[0]?.audioName).toBe("s1.mp3");
	});

	it("draft hỏng schema → lùi về bản đã lưu của slot đó", () => {
		const broken = { ...partValueFromDto(makeDto("s1", 0)), title: "" };
		const parts = effectivePartsFor(
			SLOTS,
			partsBySlot,
			new Map([["s1", { dirty: true, value: broken }]]),
			{ savedInputs },
		);
		expect(parts.map((p) => p.part)).toEqual(["s1", "s2", "s3", "s4"]);
		expect(parts[0]?.title).toBe("Section 0");
	});

	it("slot trống (không saved, không draft) → bỏ qua; dirty không có saved vẫn overlay", () => {
		const dirty = {
			...partValueFromDto(makeDto("s3", 2)),
			passage: "<p>soạn mới</p>",
		};
		const parts = effectivePartsFor(
			SLOTS,
			new Map([
				["s1", makeDto("s1", 0)],
				["s2", makeDto("s2", 1)],
			]),
			new Map([["s3", { dirty: true, value: dirty }]]),
		);
		// s1/s2 từ bản lưu, s3 chỉ có nháp, s4 trống hoàn toàn → bỏ qua.
		expect(parts.map((p) => p.part)).toEqual(["s1", "s2", "s3"]);
		expect(parts[2]?.passage).toBe("<p>soạn mới</p>");
	});

	it("1 dirty + 3 saved (có savedInputs) → parse ĐÚNG 1 lần (#426 F3)", () => {
		const parse = vi.fn(partInputFromValue);
		const dirty = {
			...partValueFromDto(makeDto("s1", 0)),
			passage: "<p>gõ phím</p>",
		};
		effectivePartsFor(
			SLOTS,
			partsBySlot,
			new Map([["s1", { dirty: true, value: dirty }]]),
			{ savedInputs, parse },
		);
		expect(parse).toHaveBeenCalledTimes(1);
	});

	it("không có savedInputs → parse cho cả slot đã lưu (hành vi cũ)", () => {
		const parse = vi.fn(partInputFromValue);
		effectivePartsFor(SLOTS, partsBySlot, new Map(), { parse });
		expect(parse).toHaveBeenCalledTimes(4);
	});
});
