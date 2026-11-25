// @vitest-environment jsdom

import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { MaterialPicker } from "@/components/materials/material-picker";
import { renderWithKernel, snapshotFixture } from "@/test/kernel-harness";
import {
	bankMaterialRow,
	startMaterialsBankServer,
} from "@/test/materials-harness";

const selectedRef: SyllabusBankMaterialRef = {
	id: "mat-2",
	title: "Listening drill",
	description: "",
	kind: "media",
	url: null,
	mimeType: "audio/mpeg",
	sizeBytes: 2048,
	originalName: "drill.mp3",
	position: 0,
};

interface UploadRecord {
	method: string;
	path: string;
	fileName: string;
	contentType: string;
}

function makeSelectedRefs(count: number): SyllabusBankMaterialRef[] {
	return Array.from({ length: count }, (_, index) => ({
		...selectedRef,
		id: `mat-existing-${index + 1}`,
		title: `Tài liệu có sẵn ${index + 1}`,
		originalName: `existing-${index + 1}.pdf`,
		position: index,
	}));
}

function startMultiUploadBankServer(
	onUpload: (
		req: UploadRecord,
	) =>
		| { status: number; body: unknown }
		| Promise<{ status: number; body: unknown }>,
) {
	const uploads: UploadRecord[] = [];
	const snapshot = snapshotFixture();
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = new URL(String(input));
			const method = (init?.method ?? "GET").toUpperCase();
			const jsonReply = (status: number, body: unknown) =>
				new Response(JSON.stringify(body), {
					status,
					headers: { "content-type": "application/json" },
				});
			if (method === "GET" && url.pathname === "/api/kernel") {
				return jsonReply(200, structuredClone(snapshot));
			}
			if (method === "GET" && url.pathname === "/api/materials/folders") {
				return jsonReply(200, { folders: [] });
			}
			if (method === "GET" && url.pathname === "/api/materials") {
				return jsonReply(200, { items: [bankMaterialRow] });
			}
			if (method === "PUT" && url.pathname.startsWith("/api/materials/files")) {
				const headers = (init?.headers ?? {}) as Record<string, string>;
				const record: UploadRecord = {
					method,
					path: url.pathname + url.search,
					fileName: decodeURIComponent(headers["X-File-Name"] ?? ""),
					contentType: headers["Content-Type"] ?? "",
				};
				uploads.push(record);
				const reply = await onUpload(record);
				return jsonReply(reply.status, reply.body);
			}
			return jsonReply(200, {});
		}),
	);
	return { uploads };
}

function ControlledMaterialPicker({
	initialSelected = [],
	onPickSpy,
	onRemoveSpy,
}: {
	initialSelected?: SyllabusBankMaterialRef[];
	onPickSpy?: (ref: SyllabusBankMaterialRef) => void;
	onRemoveSpy?: (id: string) => void;
}) {
	const [selected, setSelected] =
		useState<SyllabusBankMaterialRef[]>(initialSelected);
	return (
		<MaterialPicker
			selected={selected}
			onPick={(ref) => {
				onPickSpy?.(ref);
				setSelected((prev) =>
					prev.some((item) => item.id === ref.id) ? prev : [...prev, ref],
				);
			}}
			onRemove={(id) => {
				onRemoveSpy?.(id);
				setSelected((prev) => prev.filter((item) => item.id !== id));
			}}
		/>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	toastMock.success.mockReset();
	toastMock.error.mockReset();
});

describe("MaterialPicker", () => {
	it("picks a bank material from the browse modal", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		startMaterialsBankServer();
		renderWithKernel(
			<MaterialPicker selected={[]} onPick={onPick} onRemove={onRemove} />,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		const dialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Gắn Reading pack" }),
		);

		await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
		// Projection an toàn: đủ field hiển thị, position để sắp xếp chips.
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "mat-1",
				title: "Reading pack",
				kind: "file",
			}),
		);
		// Chọn xong modal vẫn mở để chọn tiếp nhiều tài liệu.
		expect(
			screen.getByRole("dialog", { name: "Chọn từ ngân hàng tài liệu" }),
		).toBeTruthy();
	});

	it("renders chips for selected materials and removes on ×", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		startMaterialsBankServer();
		renderWithKernel(
			<MaterialPicker
				selected={[selectedRef]}
				onPick={onPick}
				onRemove={onRemove}
			/>,
		);

		await screen.findByText("Listening drill");
		fireEvent.click(screen.getByRole("button", { name: "Gỡ Listening drill" }));
		expect(onRemove).toHaveBeenCalledWith("mat-2");
		expect(onPick).not.toHaveBeenCalled();
	});

	it("uploads a file to the bank root path and picks the created material", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		const server = startMaterialsBankServer();
		renderWithKernel(
			<MaterialPicker selected={[]} onPick={onPick} onRemove={onRemove} />,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Tải file lên" }),
		);
		const input = screen.getByLabelText("Chọn file tải lên ngân hàng tài liệu");
		fireEvent.change(input, {
			target: {
				files: [
					new File(["pdf-bytes"], "essay.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
		expect(onPick).toHaveBeenCalledWith(
			expect.objectContaining({ id: "mat-uploaded", title: "Reading pack" }),
		);
		// Đường upload là NGÂN HÀNG (/materials/files), không phải đường theo buổi.
		const upload = server.writes.find(
			(req) =>
				req.method === "PUT" && req.path.startsWith("/api/materials/files"),
		);
		expect(upload).toBeTruthy();
	});

	it("hides the browse modal after closing and keeps the chips", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		startMaterialsBankServer();
		renderWithKernel(
			<MaterialPicker
				selected={[selectedRef]}
				onPick={onPick}
				onRemove={onRemove}
			/>,
		);

		fireEvent.click(
			await screen.findByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		// Escape đóng modal (tránh trùng nút "Đóng" header + footer).
		fireEvent.keyDown(document, { key: "Escape" });

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Chọn từ ngân hàng tài liệu" }),
			).toBeNull(),
		);
		expect(screen.getByText("Listening drill")).toBeTruthy();
	});

	it("hides bank file upload for ta while keeping bank browser and chip selection (#646)", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		startMaterialsBankServer(
			[bankMaterialRow],
			snapshotFixture({ viewer: { role: "ta", canAccessFinance: false } }),
		);
		renderWithKernel(
			<MaterialPicker
				selected={[selectedRef]}
				onPick={onPick}
				onRemove={onRemove}
			/>,
		);

		expect(
			await screen.findByRole("button", { name: "Chọn từ ngân hàng" }),
		).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Tải file lên" })).toBeNull();
		expect(
			screen.queryByLabelText("Chọn file tải lên ngân hàng tài liệu"),
		).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Gỡ Listening drill" }));
		expect(onRemove).toHaveBeenCalledWith("mat-2");

		fireEvent.click(screen.getByRole("button", { name: "Chọn từ ngân hàng" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Gắn Reading pack" }),
		);
		await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));

		cleanup();
		startMaterialsBankServer(
			[],
			snapshotFixture({ viewer: { role: "ta", canAccessFinance: false } }),
		);
		renderWithKernel(
			<MaterialPicker selected={[]} onPick={onPick} onRemove={onRemove} />,
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Chọn từ ngân hàng" }),
		);
		const emptyDialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		expect(
			await within(emptyDialog).findByText(
				"Ngân hàng tài liệu của trung tâm hiện chưa có học liệu nào.",
			),
		).toBeTruthy();
	});

	it("uploads multiple valid files in one selection, picks each with incrementing positions, and lets teacher dismiss summary", async () => {
		const onPickSpy = vi.fn();
		const resolvers = new Map<
			string,
			(reply: { status: number; body: unknown }) => void
		>();
		const { uploads } = startMultiUploadBankServer(
			(req) =>
				new Promise((resolve) => {
					resolvers.set(req.fileName, resolve);
				}),
		);
		renderWithKernel(<ControlledMaterialPicker onPickSpy={onPickSpy} />);

		const input = (await screen.findByLabelText(
			"Chọn file tải lên ngân hàng tài liệu",
		)) as HTMLInputElement;
		expect(input.multiple).toBe(true);

		fireEvent.change(input, {
			target: {
				files: [
					new File(["%PDF-1"], "bai-doc-1.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "bai-doc-2.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() => expect(resolvers.size).toBe(2));
		const uploadingBtn = screen.getByRole("button", {
			name: "Đang tải lên (0/2)…",
		}) as HTMLButtonElement;
		expect(uploadingBtn.disabled).toBe(true);
		expect(uploadingBtn.getAttribute("aria-busy")).toBe("true");
		const browseBtn = screen.getByRole("button", {
			name: "Chọn từ ngân hàng",
		}) as HTMLButtonElement;
		expect(browseBtn.disabled).toBe(true);

		resolvers.get("bai-doc-1.pdf")?.({
			status: 200,
			body: {
				material: {
					...bankMaterialRow,
					id: "mat-up-1",
					title: "Bài đọc 1",
					originalName: "bai-doc-1.pdf",
				},
			},
		});
		expect(
			await screen.findByRole("button", { name: "Đang tải lên (1/2)…" }),
		).toBeTruthy();

		resolvers.get("bai-doc-2.pdf")?.({
			status: 200,
			body: {
				material: {
					...bankMaterialRow,
					id: "mat-up-2",
					title: "Bài đọc 2",
					originalName: "bai-doc-2.pdf",
				},
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 2 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(2);
		for (const req of uploads) {
			expect(req.method).toBe("PUT");
			expect(req.path).toBe("/api/materials/files");
		}
		expect(onPickSpy).toHaveBeenCalledTimes(2);
		expect(onPickSpy).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				id: "mat-up-1",
				title: "Bài đọc 1",
				position: 0,
			}),
		);
		expect(onPickSpy).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				id: "mat-up-2",
				title: "Bài đọc 2",
				position: 1,
			}),
		);

		const selectedList = screen.getByRole("list", {
			name: "Tài liệu đã chọn",
		});
		expect(within(selectedList).getByText("Bài đọc 1")).toBeTruthy();
		expect(within(selectedList).getByText("Bài đọc 2")).toBeTruthy();

		const queueList = screen.getByRole("list", {
			name: "Hàng đợi tải lên",
		});
		expect(within(queueList).getByText("bai-doc-1.pdf")).toBeTruthy();
		expect(within(queueList).getByText("bai-doc-2.pdf")).toBeTruthy();
		expect(screen.getByText("Đã tải xong 2/2 file.")).toBeTruthy();

		const dismissBtn = screen.getByRole("button", {
			name: "Ẩn tiến độ tải lên",
		});
		expect(dismissBtn.textContent).toBe("Ẩn");
		fireEvent.click(dismissBtn);
		expect(screen.queryByRole("list", { name: "Hàng đợi tải lên" })).toBeNull();
	});

	it("blocks upload upfront without sending requests when valid files exceed remaining cap slots", async () => {
		const onPick = vi.fn();
		const onRemove = vi.fn();
		const { uploads } = startMultiUploadBankServer(() => ({
			status: 200,
			body: { material: bankMaterialRow },
		}));
		renderWithKernel(
			<MaterialPicker
				selected={makeSelectedRefs(19)}
				onPick={onPick}
				onRemove={onRemove}
			/>,
		);

		const input = await screen.findByLabelText(
			"Chọn file tải lên ngân hàng tài liệu",
		);
		fireEvent.change(input, {
			target: {
				files: [
					new File(["%PDF-1"], "extra-1.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "extra-2.pdf", { type: "application/pdf" }),
				],
			},
		});

		const alert = await screen.findByRole("alert");
		expect(alert.textContent).toContain("tối đa 1 tài liệu nữa");
		expect(alert.textContent).toContain("19/20");
		expect(uploads).toHaveLength(0);
		expect(onPick).not.toHaveBeenCalled();
		expect(screen.queryByRole("list", { name: "Hàng đợi tải lên" })).toBeNull();
	});

	it("uploads only valid files in a mixed batch when valid count fits remaining cap slots", async () => {
		const onPickSpy = vi.fn();
		const { uploads } = startMultiUploadBankServer((req) => ({
			status: 200,
			body: {
				material: {
					...bankMaterialRow,
					id: "mat-fit",
					title: "Tài liệu hợp lệ",
					originalName: req.fileName,
				},
			},
		}));
		renderWithKernel(
			<ControlledMaterialPicker
				initialSelected={makeSelectedRefs(19)}
				onPickSpy={onPickSpy}
			/>,
		);

		const input = await screen.findByLabelText(
			"Chọn file tải lên ngân hàng tài liệu",
		);
		fireEvent.change(input, {
			target: {
				files: [
					new File(["%PDF-1"], "fit.pdf", { type: "application/pdf" }),
					new File(["<html>"], "khong-ho-tro.html", { type: "text/html" }),
				],
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 1 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(1);
		expect(uploads[0]?.fileName).toBe("fit.pdf");
		expect(uploads[0]?.path).toBe("/api/materials/files");
		expect(onPickSpy).toHaveBeenCalledTimes(1);
		expect(onPickSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "mat-fit",
				title: "Tài liệu hợp lệ",
				position: 19,
			}),
		);

		const queueList = screen.getByRole("list", {
			name: "Hàng đợi tải lên",
		});
		expect(within(queueList).getByText("fit.pdf")).toBeTruthy();
		expect(within(queueList).getByText("khong-ho-tro.html")).toBeTruthy();
		expect(within(queueList).getByText("Đã tải")).toBeTruthy();
		expect(within(queueList).getByText("Không hợp lệ")).toBeTruthy();
		expect(screen.getByRole("alert").textContent).toMatch(
			/Định dạng chưa hỗ trợ/,
		);
	});

	it("retries only the failed file after a partial server failure and picks it on recovery", async () => {
		const onPickSpy = vi.fn();
		let failSecond = true;
		const { uploads } = startMultiUploadBankServer((req) => {
			if (req.fileName === "loi.pdf" && failSecond) {
				return { status: 500, body: {} };
			}
			return {
				status: 200,
				body: {
					material: {
						...bankMaterialRow,
						id: req.fileName === "ok.pdf" ? "mat-ok" : "mat-retry",
						title: req.fileName === "ok.pdf" ? "Bài ổn" : "Bài thử lại",
						originalName: req.fileName,
					},
				},
			};
		});
		renderWithKernel(<ControlledMaterialPicker onPickSpy={onPickSpy} />);

		const input = await screen.findByLabelText(
			"Chọn file tải lên ngân hàng tài liệu",
		);
		fireEvent.change(input, {
			target: {
				files: [
					new File(["%PDF-1"], "ok.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "loi.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 1 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(2);
		expect(onPickSpy).toHaveBeenCalledTimes(1);
		expect(onPickSpy).toHaveBeenCalledWith(
			expect.objectContaining({ id: "mat-ok", title: "Bài ổn", position: 0 }),
		);
		expect(screen.getByRole("alert").textContent).toMatch(/Không lưu được/);

		failSecond = false;
		toastMock.success.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Thử lại 1 file lỗi" }));

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 2 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(3);
		expect(uploads[2]?.fileName).toBe("loi.pdf");
		expect(onPickSpy).toHaveBeenCalledTimes(2);
		expect(onPickSpy).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				id: "mat-retry",
				title: "Bài thử lại",
				position: 1,
			}),
		);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByRole("button", { name: /Thử lại/ })).toBeNull();
		expect(screen.getByText("Đã tải xong 2/2 file.")).toBeTruthy();
	});

	it("blocks retrying a failed file when selected count reaches the cap and recovers after removing a chip", async () => {
		const onPickSpy = vi.fn();
		let failSecond = true;
		const { uploads } = startMultiUploadBankServer((req) => {
			if (req.fileName === "loi.pdf" && failSecond) {
				return { status: 500, body: {} };
			}
			return {
				status: 200,
				body: {
					material: {
						...bankMaterialRow,
						id: req.fileName === "ok.pdf" ? "mat-ok" : "mat-retry",
						title: req.fileName === "ok.pdf" ? "Bài ổn" : "Bài thử lại",
						originalName: req.fileName,
					},
				},
			};
		});
		renderWithKernel(
			<ControlledMaterialPicker
				initialSelected={makeSelectedRefs(18)}
				onPickSpy={onPickSpy}
			/>,
		);

		const input = await screen.findByLabelText(
			"Chọn file tải lên ngân hàng tài liệu",
		);
		fireEvent.change(input, {
			target: {
				files: [
					new File(["%PDF-1"], "ok.pdf", { type: "application/pdf" }),
					new File(["%PDF-2"], "loi.pdf", { type: "application/pdf" }),
				],
			},
		});

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 1 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(2);

		// Chọn thêm 1 tài liệu từ ngân hàng để chạm đúng trần 20/20 trước khi thử lại.
		fireEvent.click(screen.getByRole("button", { name: "Chọn từ ngân hàng" }));
		const dialog = await screen.findByRole("dialog", {
			name: "Chọn từ ngân hàng tài liệu",
		});
		fireEvent.click(
			await within(dialog).findByRole("button", { name: "Gắn Reading pack" }),
		);
		fireEvent.keyDown(document, { key: "Escape" });
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Chọn từ ngân hàng tài liệu" }),
			).toBeNull(),
		);

		fireEvent.click(screen.getByRole("button", { name: "Thử lại 1 file lỗi" }));
		const alerts = screen.getAllByRole("alert");
		expect(alerts).toHaveLength(1);
		expect(alerts[0]?.textContent).toBe(
			"Tối đa 20 tài liệu cho một buổi/bài — gỡ bớt để chọn thêm.",
		);
		expect(uploads).toHaveLength(2);

		// Gỡ bớt 1 chip để mở lại slot rồi thử lại file lỗi.
		fireEvent.click(screen.getByRole("button", { name: "Gỡ Reading pack" }));
		failSecond = false;
		toastMock.success.mockClear();
		fireEvent.click(screen.getByRole("button", { name: "Thử lại 1 file lỗi" }));

		await waitFor(() =>
			expect(toastMock.success).toHaveBeenCalledWith(
				"Đã tải lên 2 file vào ngân hàng tài liệu.",
			),
		);
		expect(uploads).toHaveLength(3);
		expect(uploads[2]?.fileName).toBe("loi.pdf");
		expect(onPickSpy).toHaveBeenLastCalledWith(
			expect.objectContaining({
				id: "mat-retry",
				title: "Bài thử lại",
				position: 19,
			}),
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});
});
