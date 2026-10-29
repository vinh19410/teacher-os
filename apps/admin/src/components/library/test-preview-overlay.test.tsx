// @vitest-environment jsdom
import type { StudentQuizQuestion } from "@teacher-os/api/contracts";
import { buildQuizParts } from "@teacher-os/api/lib/quiz-parts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { PreviewTab } from "./test-preview-model";
import { TestPreviewOverlay } from "./test-preview-overlay";

const question = (stem: string, type = "note"): StudentQuizQuestion => ({
	stem,
	opts: null,
	pin: null,
	type,
});

const tab = (
	index: number,
	overrides: Partial<PreviewTab> = {},
): PreviewTab => ({
	part: `p${index}`,
	label: `Passage ${index}`,
	state: "ok",
	qStart: (index - 1) * 2 + 1,
	questionCount: 2,
	savedFallback: false,
	corrupt: false,
	view: {
		detail: {
			skill: "reading",
			type: "tfng",
			band: "7.0",
			intro: "",
			prompt: "",
			passage: index === 1 ? "<p>Đoạn đọc P1</p>" : "",
			cueTopic: "",
			cuePoints: "",
			audioName: "",
			imageUrl: "",
			optionBank: [],
		},
		parts: buildQuizParts(
			[question(`Câu ${index}.1 ____ CANARY-STEM`), question(`Câu ${index}.2`)],
			"note",
			"",
			(index - 1) * 2,
		),
		unsupportedGroupFlags: [],
	},
	...overrides,
});

const TRIGGER = {
	current: { focus: vi.fn() },
} as unknown as React.RefObject<HTMLButtonElement | null>;

interface Setup {
	container: HTMLDivElement;
	unmount: () => Promise<void>;
}

async function setup(tabs: PreviewTab[], initialPart: string | null) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const onClose = vi.fn();
	await act(async () => {
		root.render(
			<TestPreviewOverlay
				testTitle="Đề IELTS canary"
				tabs={tabs}
				initialPart={initialPart}
				onClose={onClose}
				triggerRef={TRIGGER}
			/>,
		);
	});
	return {
		container,
		onClose,
		unmount: async () => {
			await act(async () => root.unmount());
			container.remove();
		},
	} satisfies Setup & { onClose: ReturnType<typeof vi.fn> };
}

describe("TestPreviewOverlay (#433)", () => {
	it("mặc định tab initialPart, focus nút Đóng, render paper + navigator", async () => {
		const setup1 = await setup([tab(1), tab(2)], "p2");
		try {
			expect(document.activeElement).toBe(
				setup1.container.querySelector("button[aria-modal], header button"),
			);
			expect(setup1.container.textContent).toContain("Passage 2");
			// Paper tab 2 render câu của tab đó với số toàn đề (qOffset=2) —
			// stem bị ô cloze ngắt giữa chuỗi, assert từng phần.
			expect(setup1.container.textContent).toContain("CANARY-STEM");
			expect(
				setup1.container.querySelector('[aria-label="Điền đáp án câu 3"]'),
			).not.toBeNull();
			expect(
				setup1.container.querySelector('[data-testid="navigator-progress"]'),
			).not.toBeNull();
			expect(
				setup1.container
					.querySelector('[role="dialog"]')
					?.getAttribute("aria-label"),
			).toBe("Xem trước bộ đề Đề IELTS canary");
		} finally {
			await setup1.unmount();
		}
	});

	it("Esc đóng overlay; focus trả về nút Xem trước (triggerRef)", async () => {
		const setup2 = await setup([tab(1)], "p1");
		try {
			await act(async () => {
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
			});
			expect(setup2.onClose).toHaveBeenCalledTimes(1);
		} finally {
			await setup2.unmount();
		}
		expect(TRIGGER.current?.focus).toHaveBeenCalled();
	});

	it("chuyển tab bằng click và phím mũi tên; tab trống hiện trạng thái rỗng", async () => {
		const setup3 = await setup(
			[tab(1), { ...tab(2), state: "empty", view: null }],
			"p1",
		);
		try {
			const tabButtons = () => [
				...setup3.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
			];
			await act(async () => {
				tabButtons()[1]?.click();
			});
			expect(setup3.container.textContent).toContain(
				"Part này chưa có nội dung.",
			);
			// Mũi tên trái quay lại tab 1 (vòng).
			const tablist = setup3.container.querySelector('[role="tablist"]');
			if (!tablist) throw new Error("không tìm thấy tablist");
			await act(async () => {
				tablist.dispatchEvent(
					new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }),
				);
			});
			expect(setup3.container.textContent).toContain("CANARY-STEM");
			expect(
				setup3.container.querySelector('[aria-label="Điền đáp án câu 1"]'),
			).not.toBeNull();
		} finally {
			await setup3.unmount();
		}
	});

	it("gõ đáp án chỉ ghi state cục bộ — 0 lần fetch (RT4)", async () => {
		const fetchSpy = vi.fn();
		vi.stubGlobal("fetch", fetchSpy);
		try {
			const setup4 = await setup([tab(1)], "p1");
			try {
				const input = setup4.container.querySelector<HTMLInputElement>(
					'input[aria-label="Điền đáp án câu 1"]',
				);
				if (!input) throw new Error("không tìm thấy ô cloze");
				await act(async () => {
					Object.getOwnPropertyDescriptor(
						HTMLInputElement.prototype,
						"value",
					)?.set?.call(input, "NOT GIVEN");
					input.dispatchEvent(new Event("input", { bubbles: true }));
				});
				expect(input.value).toBe("NOT GIVEN");
				expect(fetchSpy).not.toHaveBeenCalled();
			} finally {
				await setup4.unmount();
			}
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("đáp án không sống sót qua unmount — mở lại trống (D3)", async () => {
		const render1 = await setup([tab(1)], "p1");
		let input = render1.container.querySelector<HTMLInputElement>(
			'input[aria-label="Điền đáp án câu 1"]',
		);
		if (!input) throw new Error("không tìm thấy ô cloze");
		await act(async () => {
			Object.getOwnPropertyDescriptor(
				HTMLInputElement.prototype,
				"value",
			)?.set?.call(input, "TRUE");
			input?.dispatchEvent(new Event("input", { bubbles: true }));
		});
		await render1.unmount();
		const render2 = await setup([tab(1)], "p1");
		try {
			input = render2.container.querySelector<HTMLInputElement>(
				'input[aria-label="Điền đáp án câu 1"]',
			);
			expect(input?.value ?? "").toBe("");
		} finally {
			await render2.unmount();
		}
	});

	it("banner nêu tên part fallback và tab nháp lỗi có suffix + trạng thái riêng (RT12)", async () => {
		const render6 = await setup(
			[
				{ ...tab(1), state: "saved-fallback", savedFallback: true },
				{ ...tab(2), state: "draft-invalid", view: null },
			],
			"p1",
		);
		try {
			expect(render6.container.textContent).toContain(
				"«Passage 1» đang hiển thị bản ĐÃ LƯU",
			);
			// RT12: banner nêu tên cả part draft-invalid, không chỉ tab suffix.
			expect(render6.container.textContent).toContain(
				"«Passage 2» bản nháp lỗi schema",
			);
			expect(render6.container.textContent).toContain("Passage 2 · nháp lỗi");
			const tabButtons = [
				...render6.container.querySelectorAll<HTMLButtonElement>(
					'[role="tab"]',
				),
			];
			await act(async () => {
				tabButtons[1]?.click();
			});
			expect(render6.container.textContent).toContain(
				"Bản nháp hiện không hợp lệ nên chưa hiện trong xem trước.",
			);
		} finally {
			await render6.unmount();
		}
	});
});
