// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { Route } from "./$assignmentId";

const AssignmentDetail = (
	Route as unknown as { component: () => React.ReactNode }
).component;

beforeEach(() => {
	resetRouterState();
	routerState.params = { assignmentId: "as-1" };
	startKernelServer(
		snapshotFixture({
			students: [studentRow({ id: "st-1", name: "Học viên Một" })],
			assignments: [
				{
					id: "as-1",
					studentId: "st-1",
					title: "Essay — Education",
					type: "Writing Task 2",
					due: "20/10",
					status: "submitted",
					scores: null,
				},
			] as never,
			commentBank: [
				{ id: "cb-1", tag: "coherence", text: "Nối ý giữa các đoạn." },
				{ id: "cb-2", tag: "grammar", text: "Ôn lại mạo từ a/an." },
			],
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("assignment detail → comment bank", () => {
	it("lists the org's saved comments and appends a picked one to the draft", async () => {
		renderWithKernel(<AssignmentDetail />);
		const draft = (await screen.findByRole("textbox")) as HTMLTextAreaElement;
		const before = draft.value;

		fireEvent.click(
			screen.getByRole("button", { name: /Ôn lại mạo từ a\/an\./ }),
		);
		expect(draft.value).toBe(`${before}\nÔn lại mạo từ a/an.`);
		fireEvent.click(
			screen.getByRole("button", { name: /Nối ý giữa các đoạn\./ }),
		);
		expect(draft.value.split("\n").slice(-2)).toEqual([
			"Ôn lại mạo từ a/an.",
			"Nối ý giữa các đoạn.",
		]);
	});

	it("grades this assignment from its own page", async () => {
		renderWithKernel(<AssignmentDetail />);
		fireEvent.click(await screen.findByRole("button", { name: /Chấm/ }));
		expect(
			within(screen.getByRole("dialog")).getByText(
				/Chấm bài — Essay — Education/,
			),
		).toBeTruthy();
	});
});
