// @vitest-environment jsdom

import type { LessonMaterialView } from "@teacher-os/api/material-contracts";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionMaterialsModal } from "@/components/class-detail/session-materials-modal";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";

const directRow: LessonMaterialView = {
	id: "mat-direct",
	folderId: null,
	title: "Handout buổi 1",
	description: "",
	kind: "file",
	url: null,
	mimeType: "application/pdf",
	sizeBytes: 512,
	originalName: "handout.pdf",
	usageCount: 1,
	createdAt: "2026-11-01T00:00:00.000Z",
	updatedAt: "2026-11-01T00:00:00.000Z",
	position: 0,
	attachedAt: "2026-11-08T00:00:00.000Z",
};

function startSessionServer(body: unknown) {
	return startKernelServer(snapshotFixture(), (req) => {
		if (
			req.method === "GET" &&
			req.path === "/api/classes/cl-1/sessions/2026-11-10/materials"
		) {
			return { status: 200, body };
		}
		return undefined;
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

function renderModal() {
	return renderWithKernel(
		<SessionMaterialsModal
			classId="cl-1"
			dateISO="2026-11-10"
			sessionLabel="10/11"
			onClose={vi.fn()}
		/>,
	);
}

describe("SessionMaterialsModal", () => {
	it("lists direct materials with detach actions", async () => {
		startSessionServer({ items: [directRow] });
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const list = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(list).getByText("Handout buổi 1")).toBeTruthy();
		expect(
			within(list).getByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeTruthy();
		// Không có danh sách giáo trình khi server không trả.
		expect(
			within(dialog).queryByRole("list", { name: "Tài liệu từ giáo trình" }),
		).toBeNull();
	});

	it("renders curriculum materials read-only with a badge (#655)", async () => {
		startSessionServer({
			items: [directRow],
			curriculumMaterials: [
				{
					id: "mat-syllabus",
					title: "Cam 15 Test 1 Passage 1",
					description: "",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 2048,
					originalName: "cam15.pdf",
					position: 0,
				},
			],
		});
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const curriculum = await within(dialog).findByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(
			within(curriculum).getByText("Cam 15 Test 1 Passage 1"),
		).toBeTruthy();
		expect(within(curriculum).getByText("Từ giáo trình")).toBeTruthy();
		// Chỉ đọc: KHÔNG có nút gỡ trong danh sách giáo trình.
		expect(within(curriculum).queryByRole("button", { name: /Gỡ/ })).toBeNull();
		// Danh sách đính kèm trực tiếp giữ nguyên hành vi.
		expect(
			within(dialog).getByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeTruthy();
	});

	it("shows the empty state only when both lists are empty", async () => {
		startSessionServer({ items: [] });
		renderModal();

		await screen.findByRole("dialog", { name: "Tài liệu buổi 10/11" });
		expect(await screen.findByTestId("session-materials-empty")).toBeTruthy();
	});

	it("still shows the empty hint state for a fresh session", async () => {
		startSessionServer({
			items: [],
			curriculumMaterials: [
				{
					id: "mat-syllabus",
					title: "Cam 15 Test 1 Passage 1",
					description: "",
					kind: "file",
					url: null,
					mimeType: "application/pdf",
					sizeBytes: 2048,
					originalName: "cam15.pdf",
					position: 0,
				},
			],
		});
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		await within(dialog).findByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(within(dialog).queryByTestId("session-materials-empty")).toBeNull();
	});
});
