// @vitest-environment jsdom

import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	classRow,
	enrollmentRow,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
	syllabusRow,
} from "@/test/kernel-harness";
import { resetRouterState, routerState } from "@/test/router-mock";

vi.mock("@tanstack/react-router", async () =>
	(await import("@/test/router-mock")).routerMock(),
);

import { ClassesRoute, validateClassesSearch } from "./index";

beforeEach(() => {
	resetRouterState();
	startKernelServer(
		snapshotFixture({
			classes: [
				classRow({ id: "cl-1", name: "IELTS Writing", syllabusId: "sy-c" }),
				classRow({ id: "cl-2", name: "IELTS Speaking" }),
			],
			syllabi: [
				syllabusRow({
					id: "sy-c",
					name: "Writing 7.0 (bản lớp)",
					classId: "cl-1",
					sourceTemplateId: null,
				}),
			],
			students: [
				studentRow({ id: "st-1" }),
				studentRow({ id: "st-2", name: "Học viên Hai" }),
			],
			enrollments: [
				enrollmentRow({ id: "en-1", classId: "cl-1", studentId: "st-1" }),
				enrollmentRow({ id: "en-2", classId: "cl-1", studentId: "st-2" }),
			],
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function classCard(name: string): HTMLElement {
	return screen
		.getByRole("heading", { level: 3, name })
		.closest("button") as HTMLElement;
}

describe("classes list", () => {
	it("shows each class with its roster size from enrollments and its syllabus", async () => {
		renderWithKernel(<ClassesRoute />);
		await screen.findByRole("heading", { level: 3, name: "IELTS Writing" });
		const writing = classCard("IELTS Writing").textContent ?? "";
		expect(writing).toContain("2 học viên");
		expect(writing).toContain("Writing 7.0 (bản lớp)");
		const speaking = classCard("IELTS Speaking").textContent ?? "";
		expect(speaking).toContain("0 học viên");
		expect(speaking).toContain("chưa gán");
	});

	it("opens the clicked class", async () => {
		renderWithKernel(<ClassesRoute />);
		await screen.findByRole("heading", { level: 3, name: "IELTS Speaking" });
		fireEvent.click(classCard("IELTS Speaking"));
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/classes/$classId",
			params: { classId: "cl-2" },
		});
	});
});

describe("classes list header and filters", () => {
	it("counts active classes from the kernel and filters by Vietnamese chips", async () => {
		vi.unstubAllGlobals();
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "Lớp online", mode: "Online" }),
					classRow({ id: "cl-2", name: "Lớp offline", mode: "Offline" }),
					classRow({ id: "cl-3", name: "Lớp tạm dừng", status: "paused" }),
				],
			}),
		);
		renderWithKernel(<ClassesRoute />);
		expect(await screen.findByText("2 lớp đang hoạt động")).toBeTruthy();

		expect(chipLabels()).toEqual([
			"Tất cả",
			"Trực tuyến",
			"Trực tiếp",
			"Đang học",
			"Tạm dừng",
		]);

		fireEvent.click(screen.getByRole("button", { name: "Trực tiếp" }));
		expect(
			screen.getByRole("heading", { level: 3, name: "Lớp offline" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("heading", { level: 3, name: "Lớp online" }),
		).toBeNull();
		expect(routerState.navigate).toHaveBeenCalledWith({
			to: "/classes",
			search: { filter: "offline" },
			replace: true,
		});

		fireEvent.click(screen.getByRole("button", { name: "Đang học" }));
		expect(
			screen.queryByRole("heading", { level: 3, name: "Lớp tạm dừng" }),
		).toBeNull();
		expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);

		fireEvent.click(screen.getByRole("button", { name: "Tạm dừng" }));
		expect(
			screen.getByRole("heading", { level: 3, name: "Lớp tạm dừng" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("heading", { level: 3, name: "Lớp online" }),
		).toBeNull();
		expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(1);
		expect(routerState.navigate).toHaveBeenLastCalledWith({
			to: "/classes",
			search: { filter: "paused" },
			replace: true,
		});
	});

	it("restores active filter from URL search params and normalizes invalid filter (#694)", async () => {
		vi.unstubAllGlobals();
		routerState.search = { filter: "paused" };
		startKernelServer(
			snapshotFixture({
				classes: [
					classRow({ id: "cl-1", name: "Lớp online", mode: "Online" }),
					classRow({ id: "cl-3", name: "Lớp tạm dừng", status: "paused" }),
				],
			}),
		);
		renderWithKernel(<ClassesRoute />);
		expect(
			await screen.findByRole("heading", { level: 3, name: "Lớp tạm dừng" }),
		).toBeTruthy();
		expect(
			screen.queryByRole("heading", { level: 3, name: "Lớp online" }),
		).toBeNull();

		expect(validateClassesSearch({})).toEqual({});
		expect(validateClassesSearch({ filter: "paused" })).toEqual({
			filter: "paused",
		});
		expect(validateClassesSearch({ filter: "bogus" })).toEqual({});
	});
});

function chipLabels(): string[] {
	return within(screen.getByRole("group"))
		.getAllByRole("button")
		.map((b) => b.textContent ?? "");
}
