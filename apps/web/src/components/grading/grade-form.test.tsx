// @vitest-environment jsdom
import type {
	QuizAttemptGrade,
	QuizGradeInput,
} from "@teacher-os/api/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GradeForm } from "./grade-form";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function sliderFor(criterion: string): HTMLInputElement {
	return document.getElementById(`grade-${criterion}`) as HTMLInputElement;
}

function choose(scores: Record<string, string>) {
	for (const [key, value] of Object.entries(scores)) {
		fireEvent.change(sliderFor(key), { target: { value } });
	}
}

describe("GradeForm (#319)", () => {
	test("Writing task1 hiện Task Achievement, task2 hiện Task Response", () => {
		render(
			<GradeForm
				skill="writing"
				part="task1"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		expect(screen.getByText("Task Achievement")).toBeTruthy();
		expect(screen.getByText("Coherence & Cohesion")).toBeTruthy();
		cleanup();

		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		expect(screen.getByText("Task Response")).toBeTruthy();
	});

	test("Speaking hiện Pronunciation và không có nhãn Writing", () => {
		render(
			<GradeForm
				skill="speaking"
				part="part2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		expect(screen.getByText("Pronunciation")).toBeTruthy();
		expect(screen.queryByText("Task Response")).toBeNull();
		expect(screen.queryByText("Task Achievement")).toBeNull();
	});

	test("Mỗi tiêu chí là range 0–9 bước 0.5 (#331)", () => {
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		for (const key of ["task", "coherence", "lexical", "grammar"]) {
			const slider = sliderFor(key);
			expect(slider.tagName).toBe("INPUT");
			expect(slider.type).toBe("range");
			expect(slider.min).toBe("0");
			expect(slider.max).toBe("9");
			expect(slider.step).toBe("0.5");
		}
	});

	test("Chưa chấm: thanh mờ, aria-valuetext Chưa chấm, Lưu disable", () => {
		const onOverallChange = vi.fn();
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
				onOverallChange={onOverallChange}
			/>,
		);
		for (const key of ["task", "coherence", "lexical", "grammar"]) {
			const slider = sliderFor(key);
			expect(slider.getAttribute("aria-valuetext")).toBe("Chưa chấm");
			expect(slider.getAttribute("data-unset")).toBe("true");
		}
		expect(onOverallChange).toHaveBeenCalledWith("—");
		expect(
			(screen.getByRole("button", { name: "Lưu điểm" }) as HTMLButtonElement)
				.disabled,
		).toBe(true);
	});

	test("Bấm vị trí placeholder khi chưa chọn vẫn ghi 4.5 (#331)", () => {
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		fireEvent.pointerUp(sliderFor("task"));
		expect(sliderFor("task").getAttribute("aria-valuetext")).toBe("4.5");
		expect(sliderFor("task").getAttribute("data-unset")).toBeNull();
	});

	test("Đổi slider cập nhật aria-valuetext theo formatBand (#331)", () => {
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		fireEvent.change(sliderFor("task"), { target: { value: "6" } });
		expect(sliderFor("task").getAttribute("aria-valuetext")).toBe("6.0");
		expect(sliderFor("task").getAttribute("data-unset")).toBeNull();
	});

	test("Ban đầu nút Lưu disable và band tổng là —", () => {
		const onOverallChange = vi.fn();
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
				onOverallChange={onOverallChange}
			/>,
		);
		const save = screen.getByRole("button", { name: "Lưu điểm" });
		expect((save as HTMLButtonElement).disabled).toBe(true);
		expect(onOverallChange).toHaveBeenCalledWith("—");
	});

	test("Đủ 4 tiêu chí: band 6.5 live và nút enable", () => {
		const onOverallChange = vi.fn();
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
				onOverallChange={onOverallChange}
			/>,
		);
		choose({ task: "6", coherence: "6.5", lexical: "6", grammar: "6.5" });
		expect(onOverallChange).toHaveBeenLastCalledWith("6.5");
		const save = screen.getByRole("button", { name: "Lưu điểm" });
		expect((save as HTMLButtonElement).disabled).toBe(false);
	});

	test("Submit gọi onSave đúng payload", () => {
		const onSave = vi.fn();
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error={null}
				savedAt={null}
				onSave={onSave}
			/>,
		);
		choose({ task: "6", coherence: "6.5", lexical: "6", grammar: "6.5" });
		fireEvent.click(screen.getByRole("button", { name: "Lưu điểm" }));
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave).toHaveBeenCalledWith({
			scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6.5 },
			feedback: "",
		} satisfies QuizGradeInput);
	});

	test("Đã chấm: form điền sẵn điểm, nhận xét và band", () => {
		const initial: QuizAttemptGrade = {
			scores: { fluency: 7, lexical: 7, grammar: 7, pronunciation: 8 },
			band: 7.5,
			feedback: "Tốt",
			gradedAt: "2026-10-05T00:00:00.000Z",
		};
		const onOverallChange = vi.fn();
		render(
			<GradeForm
				skill="speaking"
				part="part2"
				initial={initial}
				saving={false}
				error={null}
				savedAt={null}
				onSave={() => {}}
				onOverallChange={onOverallChange}
			/>,
		);
		expect(sliderFor("fluency").value).toBe("7");
		expect(sliderFor("pronunciation").value).toBe("8");
		expect(onOverallChange).toHaveBeenCalledWith("7.5");
		expect(
			(document.getElementById("grade-feedback") as HTMLTextAreaElement).value,
		).toBe("Tốt");
		const save = screen.getByRole("button", { name: "Lưu điểm" });
		expect((save as HTMLButtonElement).disabled).toBe(false);
	});

	test("Lỗi lưu hiện role alert", () => {
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving={false}
				error="Không lưu được điểm. Thử lại."
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toBe(
			"Không lưu được điểm. Thử lại.",
		);
	});

	test("saving=true đổi nhãn nút và giữ disable", () => {
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={null}
				saving
				error={null}
				savedAt={null}
				onSave={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: "Đang lưu…" })).toBeTruthy();
	});

	test("TOS-33: TA (canPublish=false) khóa nút Chốt trả bài kèm tooltip nhưng vẫn Lưu bản nháp được", () => {
		const onSave = vi.fn();
		const onSaveDraft = vi.fn();
		render(
			<GradeForm
				skill="writing"
				part="task2"
				initial={{
					scores: { task: 6, coherence: 6.5, lexical: 6, grammar: 6 },
					band: 6,
					feedback: "Nháp",
					gradedAt: "",
				}}
				saving={false}
				error={null}
				savedAt={null}
				onSave={onSave}
				draftMode={true}
				canPublish={false}
				onSaveDraft={onSaveDraft}
			/>,
		);
		const publishBtn = screen.getByTestId("publish-grade") as HTMLButtonElement;
		const draftBtn = screen.getByTestId("save-draft") as HTMLButtonElement;
		expect(publishBtn.disabled).toBe(true);
		expect(publishBtn.getAttribute("title")).toBe(
			"Chỉ Giáo viên đứng lớp được chốt trả bài",
		);
		expect(draftBtn.disabled).toBe(false);
		fireEvent.click(draftBtn);
		expect(onSaveDraft).toHaveBeenCalledTimes(1);
		fireEvent.click(publishBtn);
		expect(onSave).not.toHaveBeenCalled();
	});
});
