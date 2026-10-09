/**
 * Shared behavioral contract for kernel form modals. Every write modal must:
 * - close only after the write landed AND the snapshot refreshed;
 * - stay open (input kept, retry possible) when the server rejects the write;
 * - after a committed/unknown outcome, block a blind replay of a write that
 *   may already be saved, and close once a reconcile confirms it;
 * - ignore close requests (Escape) while the write is in flight.
 */
import type { KernelSnapshot } from "@teacher-os/api/contracts";
import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
	type KernelRequest,
	renderWithKernel,
	startKernelServer,
} from "./kernel-harness";

export interface KernelFormContract {
	snapshot: () => KernelSnapshot;
	render: (onClose: () => void) => ReactElement;
	/** Bring the form to a submittable state. */
	fill?: (dialog: HTMLElement) => void | Promise<void>;
	/** Accessible name of the submit button. */
	submit: string;
	/** The one write the submit must send (body matched as a subset). */
	expectedWrite: Partial<KernelRequest> & { path: string };
}

async function openDialog(contract: KernelFormContract, onClose: () => void) {
	renderWithKernel(contract.render(onClose));
	const dialog = await screen.findByRole("dialog");
	await contract.fill?.(dialog);
	return dialog;
}

function submitButton(dialog: HTMLElement, name: string): HTMLButtonElement {
	return within(dialog).getByRole("button", { name }) as HTMLButtonElement;
}

export function itFollowsTheKernelFormContract(contract: KernelFormContract) {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("sends its write and closes only after the refreshed snapshot", async () => {
		const server = startKernelServer(contract.snapshot());
		const onClose = vi.fn();
		const dialog = await openDialog(contract, onClose);
		fireEvent.click(submitButton(dialog, contract.submit));

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toHaveLength(1);
		expect(server.writes[0]).toMatchObject({
			method: "POST",
			...contract.expectedWrite,
		});
		// The close came after the post-write refetch, not before it.
		expect(server.snapshotLoads).toBe(2);
	});

	it("stays open with an error and allows a retry when the write is rejected", async () => {
		startKernelServer(contract.snapshot(), () => ({ status: 422, body: {} }));
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const onClose = vi.fn();
		const dialog = await openDialog(contract, onClose);
		fireEvent.click(submitButton(dialog, contract.submit));

		expect(
			(await within(dialog).findAllByRole("alert")).length,
		).toBeGreaterThan(0);
		await waitFor(() =>
			expect(submitButton(dialog, contract.submit).disabled).toBe(false),
		);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("blocks a blind replay after a committed write, then closes once reconciled", async () => {
		const server = startKernelServer(contract.snapshot(), (_req, srv) => {
			srv.snapshotReply = () => ({ status: 503, body: {} });
			return undefined;
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const onClose = vi.fn();
		const dialog = await openDialog(contract, onClose);
		fireEvent.click(submitButton(dialog, contract.submit));

		const reload = await within(dialog).findByRole("button", {
			name: "Tải lại",
		});
		expect(submitButton(dialog, contract.submit).disabled).toBe(true);
		expect(onClose).not.toHaveBeenCalled();

		server.snapshotReply = undefined;
		fireEvent.click(reload);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toHaveLength(1);
	});

	it("ignores Escape while the write is in flight", async () => {
		let land: () => void = () => {};
		startKernelServer(
			contract.snapshot(),
			() =>
				new Promise((resolve) => {
					land = () => resolve(undefined);
				}),
		);
		const onClose = vi.fn();
		const dialog = await openDialog(contract, onClose);
		fireEvent.click(submitButton(dialog, contract.submit));
		await waitFor(() =>
			expect(submitButton(dialog, contract.submit).disabled).toBe(true),
		);

		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();

		land();
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});
}
