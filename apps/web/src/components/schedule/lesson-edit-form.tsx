import { lessonEditSchema } from "@teacher-os/api/contracts";
import { type FormEvent, useMemo, useState } from "react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { Lesson } from "@/lib/mock-data";
import { dayNames } from "@/lib/mock-data";

/** The five full-replace fields — exactly the contract schema's shape. */
export type LessonEditValues = z.infer<typeof lessonEditSchema>;

/**
 * Edit form for one scheduled lesson (#56). The API is full-replace (omitted
 * optionals reset to ""), so the form echoes ALL five fields from the lesson
 * and always submits all five. DOM inputs give strings; day/dur are coerced
 * with Number() before validating against the shared contract schema.
 * Validation is reactive (recomputed from current values), so fixing an
 * invalid field re-enables the save button — a sticky error flag would brick
 * the form after one failed submit.
 */
export function LessonEditForm({
	lesson,
	saving,
	submitBlocked,
	onSubmit,
	onCancel,
}: {
	lesson: Lesson;
	saving: boolean;
	/** Set when a previous submit settled as committed/unknown — the shared
	 * hook blocks blind replays until a reconcile succeeds. */
	submitBlocked: boolean;
	onSubmit: (values: LessonEditValues) => void;
	onCancel: () => void;
}) {
	const [day, setDay] = useState(String(lesson.day));
	// Some browsers/OS settings report "HH:MM:SS" from <input type="time"> —
	// the contract regex wants exactly HH:MM, so trim defensively.
	const [time, setTime] = useState(lesson.time.slice(0, 5));
	const [dur, setDur] = useState(String(lesson.dur));
	const [topic, setTopic] = useState(lesson.topic);
	const [zoom, setZoom] = useState(lesson.zoom);
	const [attempted, setAttempted] = useState(false);

	const parsed = useMemo(
		() =>
			lessonEditSchema.safeParse({
				day: Number(day),
				time: time.slice(0, 5),
				dur: Number(dur),
				topic,
				zoom,
			}),
		[day, time, dur, topic, zoom],
	);
	const valid = parsed.success;

	function submit(e: FormEvent) {
		e.preventDefault();
		setAttempted(true);
		if (!parsed.success) return; // message renders below; recompute is reactive
		onSubmit(parsed.data);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-4">
			<div className="grid grid-cols-2 gap-3">
				<Field label="Thứ">
					<Select
						value={day}
						onChange={(e) => setDay(e.target.value)}
						disabled={saving}
						autoFocus
					>
						{dayNames.map((dn, i) => (
							<option key={dn} value={String(i + 1)}>
								{dn}
							</option>
						))}
					</Select>
				</Field>
				<Field label="Giờ (HH:MM)">
					<Input
						type="time"
						value={time}
						onChange={(e) => setTime(e.target.value)}
						disabled={saving}
					/>
				</Field>
				<Field label="Thời lượng (phút)">
					<Input
						type="number"
						min="1"
						max="1440"
						value={dur}
						onChange={(e) => setDur(e.target.value)}
						disabled={saving}
					/>
				</Field>
				<Field label="Link Zoom/Meet">
					<Input
						type="text"
						placeholder="https://… hoặc để trống"
						value={zoom}
						onChange={(e) => setZoom(e.target.value)}
						disabled={saving}
					/>
				</Field>
			</div>
			<Field label="Chủ đề">
				<Input
					type="text"
					value={topic}
					onChange={(e) => setTopic(e.target.value)}
					disabled={saving}
				/>
			</Field>
			{attempted && !parsed.success && (
				<div
					role="alert"
					className="text-danger text-muted-foreground text-xs tabular-nums"
				>
					{parsed.error.issues[0]?.message ?? "Dữ liệu chưa hợp lệ."}
				</div>
			)}
			<div className="flex justify-end gap-2 border-border border-t border-solid pt-4">
				<Button
					type="button"
					variant="secondary"
					size="sm"
					disabled={saving}
					onClick={onCancel}
				>
					Hủy
				</Button>
				<Button
					type="submit"
					size="sm"
					disabled={saving || submitBlocked || !valid}
				>
					{saving ? "Đang lưu…" : "Lưu"}
				</Button>
			</div>
		</form>
	);
}
