// @vitest-environment jsdom

import type { LessonMaterialView } from "@teacher-os/api/material-contracts";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionMaterialsModal } from "@/components/class-detail/session-materials-modal";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
} from "@/test/kernel-harness";

vi.mock(
	"@teacher-os/ui/components/document-preview/blob-document-view",
	() => ({
		BlobDocumentThumbnail: (props: {
			blobUrl: string;
			mimeType: string;
			label: string;
		}) => (
			<div
				data-testid="blob-document-thumbnail"
				data-url={props.blobUrl}
				data-mime={props.mimeType}
				data-label={props.label}
			/>
		),
		BlobDocumentView: (props: {
			blobUrl: string;
			mimeType: string;
			label: string;
		}) => (
			<div
				data-testid="blob-document-view"
				data-url={props.blobUrl}
				data-mime={props.mimeType}
				data-label={props.label}
			/>
		),
	}),
);

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

function startSessionServer(body: unknown, role = "teacher") {
	const server = startKernelServer(
		snapshotFixture({ viewer: { role, canAccessFinance: false } }),
		(req) => {
			if (
				req.method === "GET" &&
				req.path === "/api/classes/cl-1/sessions/2026-11-10/materials"
			) {
				return { status: 200, body };
			}
			return undefined;
		},
	);
	const kernelFetch = globalThis.fetch;
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			if (
				(init?.method ?? "GET").toUpperCase() === "GET" &&
				/^\/api\/materials\/[^/]+\/file$/.test(url.pathname)
			) {
				return new Response(new Blob(["%PDF"], { type: "application/pdf" }), {
					status: 200,
					headers: { "content-type": "application/pdf" },
				});
			}
			return kernelFetch(input, init);
		}),
	);
	return server;
}

const createObjectURL = vi.fn(() => "blob:session-preview");
const revokeObjectURL = vi.fn();

beforeEach(() => {
	URL.createObjectURL = createObjectURL;
	URL.revokeObjectURL = revokeObjectURL;
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	createObjectURL.mockClear();
	revokeObjectURL.mockClear();
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
	it("lists direct materials with inline preview and detach actions", async () => {
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
		// Thumbnail inline tự hiển thị ở đầu hàng và bấm vào mở modal phóng to.
		expect(
			await within(list).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(list).getByRole("button", { name: "Xem trước Handout buổi 1" }),
		).toBeTruthy();
		expect(
			within(dialog).queryByRole("list", { name: "Tài liệu từ giáo trình" }),
		).toBeNull();
	});

	it("renders curriculum materials read-only with inline preview, download link, and badge (#655)", async () => {
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
		expect(
			await within(curriculum).findByTestId("blob-document-thumbnail"),
		).toBeTruthy();
		expect(
			within(curriculum).getByRole("button", {
				name: "Xem trước Cam 15 Test 1 Passage 1",
			}),
		).toBeTruthy();
		expect(
			within(curriculum).getByRole("link", {
				name: "Tải xuống Cam 15 Test 1 Passage 1",
			}),
		).toBeTruthy();
		expect(within(curriculum).queryByRole("button", { name: /Gỡ/ })).toBeNull();
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

	it("hides attach, upload, and detach controls for ta while keeping open actions and curriculum list (#646)", async () => {
		startSessionServer(
			{
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
			},
			"ta",
		);
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const list = await within(dialog).findByRole("list", {
			name: "Tài liệu đã gắn",
		});
		expect(within(list).getByText("Handout buổi 1")).toBeTruthy();
		expect(
			within(list).getByRole("link", { name: "Tải xuống Handout buổi 1" }),
		).toBeTruthy();
		expect(
			within(dialog).queryByRole("button", { name: "Chọn từ ngân hàng" }),
		).toBeNull();
		expect(
			within(dialog).queryByRole("button", { name: "Tải lên mới" }),
		).toBeNull();
		expect(
			within(dialog).queryByLabelText("Chọn file tải lên cho buổi học"),
		).toBeNull();
		expect(
			within(list).queryByRole("button", { name: "Gỡ Handout buổi 1" }),
		).toBeNull();
		const curriculum = within(dialog).getByRole("list", {
			name: "Tài liệu từ giáo trình",
		});
		expect(
			within(curriculum).getByText("Cam 15 Test 1 Passage 1"),
		).toBeTruthy();

		cleanup();
		startSessionServer({ items: [] }, "ta");
		renderModal();
		const emptyDialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		const emptyEl = await within(emptyDialog).findByTestId(
			"session-materials-empty",
		);
		expect(emptyEl.textContent).toBe("Chưa có tài liệu nào cho buổi này.");
	});

	it("closes only the expanded preview dialog on Escape, keeping the session dialog open", async () => {
		startSessionServer({ items: [directRow] });
		renderModal();

		const dialog = await screen.findByRole("dialog", {
			name: "Tài liệu buổi 10/11",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", {
				name: "Xem trước Handout buổi 1",
			}),
		);
		expect(
			await screen.findByRole("dialog", { name: "Handout buổi 1" }),
		).toBeTruthy();

		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog", { name: "Handout buổi 1" })).toBeNull();
		expect(
			screen.getByRole("dialog", { name: "Tài liệu buổi 10/11" }),
		).toBeTruthy();
	});
});
