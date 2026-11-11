// @vitest-environment jsdom

import type { SyllabusBankMaterialRef } from "@teacher-os/api/material-contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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
});
