// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DatePickerInput, TimeInput24h } from "./date-picker-input";

beforeAll(() => {
	if (typeof globalThis.ResizeObserver === "undefined") {
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	}
});

afterEach(() => {
	cleanup();
});

function StatefulDateHarness({
	initial = "2026-11-01",
	minDateISO = "2026-11-01",
	onInvalidChange,
	onChangeSpy,
}: {
	initial?: string;
	minDateISO?: string;
	onInvalidChange?: (invalid: boolean) => void;
	onChangeSpy?: (iso: string) => void;
}) {
	const [val, setVal] = useState(initial);
	return (
		<DatePickerInput
			id="test-date"
			data-testid="test-date-input"
			value={val}
			minDateISO={minDateISO}
			onChange={(iso) => {
				setVal(iso);
				onChangeSpy?.(iso);
			}}
			onInvalidChange={onInvalidChange}
		/>
	);
}

function StatefulTimeHarness({
	initial = "23:59",
	minTimeHHMM,
	onInvalidChange,
	onChangeSpy,
}: {
	initial?: string;
	minTimeHHMM?: string;
	onInvalidChange?: (invalid: boolean) => void;
	onChangeSpy?: (time: string) => void;
}) {
	const [val, setVal] = useState(initial);
	return (
		<TimeInput24h
			id="test-time"
			data-testid="test-time-input"
			value={val}
			minTimeHHMM={minTimeHHMM}
			onChange={(next) => {
				setVal(next);
				onChangeSpy?.(next);
			}}
			onInvalidChange={onInvalidChange}
		/>
	);
}

describe("DatePickerInput (#572)", () => {
	it("renders fixed dd/mm/yyyy text input with numeric inputMode, border-input, and forwarded ref", () => {
		const ref = createRef<HTMLInputElement>();
		render(
			<DatePickerInput
				id="due-date"
				data-testid="due-date-box"
				ref={ref}
				value="2026-11-06"
				onChange={vi.fn()}
			/>,
		);

		const input = screen.getByTestId("due-date-box") as HTMLInputElement;
		expect(input.type).toBe("text");
		expect(input.inputMode).toBe("numeric");
		expect(input.id).toBe("due-date");
		expect(input.value).toBe("06/11/2026");
		expect(input.className).toContain("border-input");
		expect(ref.current).toBe(input);

		const trigger = screen.getByRole("button", { name: "Chọn ngày" });
		expect(trigger.className).toContain(
			"focus-visible:shadow-[var(--focus-ring)]",
		);
	});

	it("preserves raw draft text while focused without self-echo caret jumps and normalizes on blur", () => {
		const onInvalid = vi.fn();
		const onChangeSpy = vi.fn();
		render(
			<StatefulDateHarness
				initial="2026-11-01"
				onInvalidChange={onInvalid}
				onChangeSpy={onChangeSpy}
			/>,
		);

		const input = screen.getByTestId("test-date-input") as HTMLInputElement;
		fireEvent.focus(input);

		// Partial typing flags invalid immediately without overwriting text
		fireEvent.change(input, { target: { value: "09/11" } });
		expect(input.value).toBe("09/11");
		expect(onInvalid).toHaveBeenLastCalledWith(true);

		// Typing 6/11/2027 emits ISO immediately while keeping "6/11/2027" while focused
		fireEvent.change(input, { target: { value: "6/11/2027" } });
		expect(onChangeSpy).toHaveBeenLastCalledWith("2027-11-06");
		expect(onInvalid).toHaveBeenLastCalledWith(false);
		expect(input.value).toBe("6/11/2027");

		fireEvent.blur(input);
		expect(input.value).toBe("06/11/2027");

		// Typing 8-digit "09112027" never jumps to 10/09; normalizes to "09/11/2027" on blur
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "09112027" } });
		expect(onChangeSpy).toHaveBeenLastCalledWith("2027-11-09");
		expect(input.value).toBe("09112027");
		fireEvent.blur(input);
		expect(input.value).toBe("09/11/2027");
	});

	it("clears cleanly to empty string and marks impossible dates (31/02/2026) invalid", () => {
		const onInvalid = vi.fn();
		const onChangeSpy = vi.fn();
		render(
			<StatefulDateHarness
				initial="2026-11-06"
				onInvalidChange={onInvalid}
				onChangeSpy={onChangeSpy}
			/>,
		);

		const input = screen.getByTestId("test-date-input") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "" } });
		expect(onChangeSpy).toHaveBeenLastCalledWith("");
		expect(onInvalid).toHaveBeenLastCalledWith(false);
		fireEvent.blur(input);
		expect(input.value).toBe("");

		// Impossible calendar date
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "31/02/2026" } });
		expect(onInvalid).toHaveBeenLastCalledWith(true);
		fireEvent.blur(input);
		expect(input.getAttribute("aria-invalid")).toBe("true");
		expect(input.value).toBe("31/02/2026");
	});

	it("opens calendar synced to typed year/month, disables days < minDateISO, uses z-[110] without <form>, and closes on Escape without bubbling to outer form", async () => {
		const outerFormKeyDown = vi.fn();
		const onChangeSpy = vi.fn();
		render(
			<form onKeyDown={outerFormKeyDown}>
				<StatefulDateHarness
					initial="2027-10-05"
					minDateISO="2027-10-05"
					onChangeSpy={onChangeSpy}
				/>
			</form>,
		);

		const input = screen.getByTestId("test-date-input") as HTMLInputElement;
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "09112027" } });
		fireEvent.blur(input);

		fireEvent.click(screen.getByRole("button", { name: "Chọn ngày" }));
		expect(screen.getByText("Tháng 11, 2027")).toBeTruthy();
		for (const wd of ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]) {
			expect(screen.getByText(wd)).toBeTruthy();
		}

		const dialog = screen.getByRole("dialog");
		expect(dialog.querySelector("form")).toBeNull();
		const positioner = document.body.querySelector(".z-\\[110\\]");
		expect(positioner).not.toBeNull();

		// Use a single 1-month step (2027-11 -> 2027-10) so jsdom ARIA queries stay fast under CI load
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Tháng trước" }),
		);
		expect(within(dialog).getByText("Tháng 10, 2027")).toBeTruthy();
		const oct4 = within(dialog).getByRole("button", {
			name: "04/10/2027",
		}) as HTMLButtonElement;
		const oct15 = within(dialog).getByRole("button", {
			name: "15/10/2027",
		}) as HTMLButtonElement;
		expect(oct4.disabled).toBe(true);
		expect(oct15.disabled).toBe(false);
		expect(oct15.className).toContain(
			"focus-visible:shadow-[var(--focus-ring)]",
		);

		// Select 15/10/2027 -> updates input & closes popover
		fireEvent.click(oct15);
		expect(onChangeSpy).toHaveBeenLastCalledWith("2027-10-15");
		expect(input.value).toBe("15/10/2027");
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Đóng lịch" })).toBeNull();
		});

		// Reopen -> synced to 2027-10, then press Escape -> closes popover without bubbling to outer form
		fireEvent.click(screen.getByRole("button", { name: "Chọn ngày" }));
		const reopenedDialog = screen.getByRole("dialog");
		expect(within(reopenedDialog).getByText("Tháng 10, 2027")).toBeTruthy();
		outerFormKeyDown.mockClear();
		fireEvent.keyDown(
			within(reopenedDialog).getByRole("button", { name: "15/10/2027" }),
			{
				key: "Escape",
			},
		);
		expect(outerFormKeyDown).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.queryByRole("button", { name: "Đóng lịch" })).toBeNull();
		});
	});
});

describe("TimeInput24h (#572)", () => {
	it("emits normalized HH:mm immediately on 1-digit hour ('9:05') without jumping draft text, and renders filtered preset group", () => {
		const onInvalid = vi.fn();
		const onChangeSpy = vi.fn();
		render(
			<StatefulTimeHarness
				initial="23:59"
				minTimeHHMM="17:00"
				onInvalidChange={onInvalid}
				onChangeSpy={onChangeSpy}
			/>,
		);

		const input = screen.getByTestId("test-time-input") as HTMLInputElement;
		expect(input.value).toBe("23:59");

		// Presets group: 17:00 hidden (<= minTimeHHMM), 21:00 and 23:59 visible
		const group = screen.getByRole("group", { name: "Mốc giờ gợi ý" });
		expect(group).toBeTruthy();
		expect(screen.queryByRole("button", { name: "17:00" })).toBeNull();
		const chip21 = screen.getByRole("button", { name: "21:00" });
		const chip2359 = screen.getByRole("button", { name: "23:59" });
		expect(chip2359.getAttribute("aria-pressed")).toBe("true");
		expect(chip21.className).toContain(
			"focus-visible:shadow-[var(--focus-ring)]",
		);

		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "9:05" } });
		expect(onChangeSpy).toHaveBeenLastCalledWith("09:05");
		expect(onInvalid).toHaveBeenLastCalledWith(false);
		expect(input.value).toBe("9:05");

		fireEvent.blur(input);
		expect(input.value).toBe("09:05");

		// Invalid hour
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: "25:00" } });
		expect(onInvalid).toHaveBeenLastCalledWith(true);
		fireEvent.blur(input);
		expect(input.getAttribute("aria-invalid")).toBe("true");

		// Clicking preset clears invalid state
		fireEvent.click(chip21);
		expect(onChangeSpy).toHaveBeenLastCalledWith("21:00");
		expect(onInvalid).toHaveBeenLastCalledWith(false);
		expect(input.value).toBe("21:00");
	});
});
