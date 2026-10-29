// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { KernelAction } from "@/lib/data-actions";
import { useData } from "@/lib/data-store";
import {
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	studentRow,
} from "@/test/kernel-harness";

const reauth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/reauth", () => ({ reauth }));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const ACTION: KernelAction = {
	type: "update-class-notes",
	classId: "cl-1",
	notes: "ghi chú mới",
};

/** Minimal workspace: lists students and runs one write on demand. */
function Workspace() {
	const { data, dispatch, refresh } = useData();
	return (
		<div>
			<ul aria-label="students">
				{data.students.map((s) => (
					<li key={s.id}>{s.name}</li>
				))}
			</ul>
			<button
				type="button"
				onClick={async () => {
					const result = await dispatch(ACTION);
					document.body.dataset.result = result.kind;
				}}
			>
				write
			</button>
			<button
				type="button"
				onClick={async () => {
					document.body.dataset.refreshed = String(await refresh());
				}}
			>
				refresh
			</button>
		</div>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
	delete document.body.dataset.result;
	delete document.body.dataset.refreshed;
});

const oneStudent = () =>
	snapshotFixture({ students: [studentRow({ name: "Học viên Một" })] });

async function resultOfWrite(): Promise<string | undefined> {
	fireEvent.click(await screen.findByRole("button", { name: "write" }));
	await waitFor(() => expect(document.body.dataset.result).toBeDefined());
	return document.body.dataset.result;
}

describe("DataProvider first load", () => {
	it("renders the workspace only once the kernel snapshot has loaded", async () => {
		const server = startKernelServer(oneStudent());
		renderWithKernel(<Workspace />);
		expect(screen.queryByRole("list", { name: "students" })).toBeNull();
		expect(await screen.findByText("Học viên Một")).toBeTruthy();
		expect(server.credentials[0]).toBe("include");
	});

	it("shows an empty org as empty — no demo data", async () => {
		startKernelServer(snapshotFixture());
		renderWithKernel(<Workspace />);
		const list = await screen.findByRole("list", { name: "students" });
		expect(list.children).toHaveLength(0);
	});

	it("blocks with a retryable error instead of an empty workspace when the load fails", async () => {
		const server = startKernelServer(oneStudent());
		server.snapshotReply = () => ({ status: 503, body: {} });
		vi.spyOn(console, "error").mockImplementation(() => {});
		renderWithKernel(<Workspace />);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Không tải được dữ liệu");
		expect(screen.queryByRole("list", { name: "students" })).toBeNull();

		server.snapshotReply = undefined;
		fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
		expect(await screen.findByText("Học viên Một")).toBeTruthy();
	});

	it("offers no retry for a failure a retry cannot fix", async () => {
		const server = startKernelServer(oneStudent());
		server.snapshotReply = () => ({ status: 404, body: {} });
		vi.spyOn(console, "error").mockImplementation(() => {});
		renderWithKernel(<Workspace />);

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("Đăng nhập lại sẽ không khắc phục");
		expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull();
	});

	it("re-authenticates on a dead session instead of showing an error", async () => {
		const server = startKernelServer(oneStudent());
		server.snapshotReply = () => ({ status: 401, body: {} });
		vi.spyOn(console, "error").mockImplementation(() => {});
		const view = renderWithKernel(<Workspace />);
		await waitFor(() => expect(reauth).toHaveBeenCalled());
		expect(screen.queryByRole("alert")).toBeNull();
		expect(view.container.textContent).toBe("");
	});
});

describe("DataProvider writes", () => {
	it("sends the write with the session cookie and resolves refreshed with the new snapshot", async () => {
		const server = startKernelServer(oneStudent(), (_req, srv) => {
			srv.snapshot.students.push(
				studentRow({ id: "st-2", name: "Học viên Hai" }),
			);
			return undefined;
		});
		renderWithKernel(<Workspace />);
		expect(await resultOfWrite()).toBe("refreshed");
		expect(server.writes).toEqual([
			{
				method: "POST",
				path: "/api/classes/cl-1/notes",
				body: { notes: "ghi chú mới" },
			},
		]);
		expect(server.credentials.every((c) => c === "include")).toBe(true);
		expect(await screen.findByText("Học viên Hai")).toBeTruthy();
	});

	it("reports committed — and keeps the workspace mounted — when the write lands but the refresh fails", async () => {
		startKernelServer(oneStudent(), (_req, srv) => {
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Workspace />);
		expect(await resultOfWrite()).toBe("committed");
		expect(screen.getByText("Học viên Một")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("reports a rejected write as a definite failure", async () => {
		startKernelServer(oneStudent(), () => ({ status: 422, body: {} }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Workspace />);
		expect(await resultOfWrite()).toBe("definite-failure");
	});

	it("reports a lost response as outcome-unknown", async () => {
		startKernelServer(oneStudent(), () => {
			throw new TypeError("Failed to fetch");
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Workspace />);
		expect(await resultOfWrite()).toBe("outcome-unknown");
	});

	it("re-authenticates when a write hits a dead session", async () => {
		startKernelServer(oneStudent(), () => ({ status: 401, body: {} }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Workspace />);
		await resultOfWrite();
		expect(reauth).toHaveBeenCalled();
	});

	it("leaves outcome messaging to the caller — the provider itself never toasts", async () => {
		startKernelServer(oneStudent(), () => ({ status: 422, body: {} }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Workspace />);
		await resultOfWrite();
		expect(toast.error).not.toHaveBeenCalled();
		expect(toast.success).not.toHaveBeenCalled();
	});

	it("refresh() pulls the latest snapshot on demand", async () => {
		const server = startKernelServer(oneStudent());
		renderWithKernel(<Workspace />);
		await screen.findByText("Học viên Một");
		server.snapshot.students[0].name = "Tên mới";
		fireEvent.click(screen.getByRole("button", { name: "refresh" }));
		await waitFor(() => expect(document.body.dataset.refreshed).toBe("true"));
		expect(await screen.findByText("Tên mới")).toBeTruthy();
	});
});
