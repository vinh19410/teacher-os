// @vitest-environment jsdom

import {
	cleanup,
	fireEvent,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type KernelRequest,
	renderWithKernel,
	snapshotFixture,
	startKernelServer,
	type WriteHandler,
} from "@/test/kernel-harness";
import { GradeModal } from "./grade-modal";

const assignmentRow = (id: string, title: string) => ({
	id,
	studentId: "st-1",
	title,
	type: "Writing Task 2",
	due: "20/10",
	status: "submitted",
	scores: null,
});

/** Each test grades its own assignment ids: unresolved comment operations
 * are remembered per assignment for the whole page session. */
function snapshotWith(...ids: string[]) {
	return snapshotFixture({
		assignments: ids.map((id) => assignmentRow(id, `Essay ${id}`)) as never,
	});
}

const isGrade = (req: KernelRequest) => req.path.endsWith("/grade");
const isComment = (req: KernelRequest) => req.path === "/api/comment-bank";
const commentIds = (writes: KernelRequest[]) =>
	writes
		.filter(isComment)
		.map((w) => (w.body as { operationId: string }).operationId);

function score(dialog: HTMLElement, label: string, value: string) {
	fireEvent.change(within(dialog).getByLabelText(label), {
		target: { value },
	});
}

function comment(dialog: HTMLElement, text: string) {
	fireEvent.change(within(dialog).getByLabelText("Nhận xét"), {
		target: { value: text },
	});
}

function save(dialog: HTMLElement) {
	fireEvent.click(within(dialog).getByRole("button", { name: "Lưu & duyệt" }));
}

async function openGrade(id: string, onWrite?: WriteHandler) {
	const server = startKernelServer(snapshotWith(id), onWrite);
	const onClose = vi.fn();
	renderWithKernel(<GradeModal open onClose={onClose} assignmentId={id} />);
	const dialog = await screen.findByRole("dialog");
	return { server, dialog, onClose };
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("GradeModal", () => {
	it("saves the scores, then the comment, then closes", async () => {
		const { server, dialog, onClose } = await openGrade("as-ok");
		score(dialog, "Task Response", "7.5");
		comment(dialog, "Mạch lạc, cần thêm ví dụ.");
		save(dialog);

		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes.map((w) => w.path)).toEqual([
			"/api/assignments/as-ok/grade",
			"/api/comment-bank",
		]);
		expect(server.writes[0].body).toEqual({
			scores: { task: 7.5, coherence: 6, lexical: 6, grammar: 6 },
		});
		expect(server.writes[1].body).toMatchObject({
			text: "Mạch lạc, cần thêm ví dụ.",
		});
	});

	it("rejects a score outside 0–9 without writing", async () => {
		const { server, dialog } = await openGrade("as-range");
		score(dialog, "Grammar", "10");
		save(dialog);
		// The browser's own range check stops the submit (the form validates
		// natively); the field reports why.
		const grammar = within(dialog).getByLabelText(
			"Grammar",
		) as HTMLInputElement;
		expect(grammar.validity.rangeOverflow).toBe(true);
		await new Promise((r) => setTimeout(r, 0));
		expect(server.writes).toEqual([]);
		expect(screen.getByRole("dialog")).toBe(dialog);
	});

	it("keeps the typed scores open for a retry when the grade is rejected", async () => {
		const { server, dialog, onClose } = await openGrade(
			"as-grade-fail",
			() => ({
				status: 422,
				body: {},
			}),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		score(dialog, "Lexical", "8");
		comment(dialog, "Tốt");
		save(dialog);

		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Không lưu được điểm — thử lại.",
		);
		expect(
			(within(dialog).getByLabelText("Lexical") as HTMLInputElement).value,
		).toBe("8");
		expect(server.writes.filter(isComment)).toEqual([]);
		expect(onClose).not.toHaveBeenCalled();
	});

	it("after a saved grade but rejected comment, retries only the comment under a fresh id", async () => {
		let rejectComment = true;
		const { server, dialog, onClose } = await openGrade("as-partial", (req) =>
			isComment(req) && rejectComment ? { status: 422, body: {} } : undefined,
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		comment(dialog, "Cần cải thiện coherence");
		save(dialog);

		expect((await within(dialog).findByRole("alert")).textContent).toBe(
			"Điểm đã lưu, nhưng nhận xét chưa lưu — thử lại.",
		);
		// The grade is saved: scores can no longer change under it.
		expect(
			(within(dialog).getByLabelText("Task Response") as HTMLInputElement)
				.disabled,
		).toBe(true);

		rejectComment = false;
		await waitFor(() =>
			expect(
				(
					within(dialog).getByRole("button", {
						name: "Lưu & duyệt",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		);
		save(dialog);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

		expect(server.writes.filter(isGrade)).toHaveLength(1);
		const [first, retry] = commentIds(server.writes);
		expect(retry).toBeDefined();
		// Nothing was committed under the rejected id, so it is not reused.
		expect(retry).not.toBe(first);
	});

	it("replays a comment with a lost response under the same id so the server dedupes it", async () => {
		let loseComment = true;
		const server = startKernelServer(snapshotWith("as-lost"), (req) => {
			if (isComment(req) && loseComment) throw new TypeError("Failed to fetch");
			return undefined;
		});
		vi.spyOn(console, "warn").mockImplementation(() => {});
		renderWithKernel(<Reopenable assignmentId="as-lost" />);

		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		let dialog = screen.getByRole("dialog");
		comment(dialog, "Nhận xét lần 1");
		save(dialog);
		await within(dialog).findByRole("button", { name: "Tải lại & kiểm tra" });
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Lưu & duyệt",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));

		loseComment = false;
		fireEvent.click(screen.getByRole("button", { name: "open" }));
		dialog = screen.getByRole("dialog");
		comment(dialog, "Nhận xét lần 1");
		save(dialog);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

		const [lost, replay] = commentIds(server.writes);
		expect(replay).toBe(lost);
	});

	it("starts every open from default scores, including after switching assignment", async () => {
		const server = startKernelServer(snapshotWith("as-a", "as-b"));
		renderWithKernel(<Reopenable assignmentId="as-a" next="as-b" />);

		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		let dialog = screen.getByRole("dialog");
		score(dialog, "Task Response", "8.5");
		comment(dialog, "Dành cho bài A");
		fireEvent.click(within(dialog).getByRole("button", { name: "Hủy" }));

		fireEvent.click(screen.getByRole("button", { name: "next" }));
		fireEvent.click(screen.getByRole("button", { name: "open" }));
		dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("Essay as-b");
		expect(
			(within(dialog).getByLabelText("Task Response") as HTMLInputElement)
				.value,
		).toBe("6.0");
		expect(
			(within(dialog).getByLabelText("Nhận xét") as HTMLTextAreaElement).value,
		).toBe("");
		save(dialog);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0]).toMatchObject({
			path: "/api/assignments/as-b/grade",
			body: { scores: { task: 6, coherence: 6, lexical: 6, grammar: 6 } },
		});
	});

	it("drops assignment A's scores when the route switches to B under an open dialog", async () => {
		const server = startKernelServer(snapshotWith("as-c", "as-d"));
		renderWithKernel(<Reopenable assignmentId="as-c" next="as-d" />);
		fireEvent.click(await screen.findByRole("button", { name: "open" }));
		score(screen.getByRole("dialog"), "Coherence", "8.5");

		fireEvent.click(screen.getByRole("button", { name: "next" }));
		const dialog = screen.getByRole("dialog");
		await waitFor(() => expect(dialog.textContent).toContain("Essay as-d"));
		expect(
			(within(dialog).getByLabelText("Coherence") as HTMLInputElement).value,
		).toBe("6.0");
		save(dialog);
		await waitFor(() => expect(server.writes).toHaveLength(1));
		expect(server.writes[0]).toMatchObject({
			path: "/api/assignments/as-d/grade",
			body: { scores: { coherence: 6 } },
		});
	});

	it("blocks a replay after a committed grade and closes once reconciled", async () => {
		const { server, dialog, onClose } = await openGrade(
			"as-committed",
			(_req, srv) => {
				srv.snapshotReply = () => ({ status: 503, body: {} });
				return undefined;
			},
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		save(dialog);
		const reload = await within(dialog).findByRole("button", {
			name: "Tải lại",
		});
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Lưu & duyệt",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);

		server.snapshotReply = undefined;
		fireEvent.click(reload);
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(server.writes).toHaveLength(1);
	});

	it("ignores Escape while saving", async () => {
		let land: () => void = () => {};
		const { dialog, onClose } = await openGrade(
			"as-escape",
			() =>
				new Promise((resolve) => {
					land = () => resolve(undefined);
				}),
		);
		save(dialog);
		await within(dialog).findByRole("button", { name: "Đang lưu…" });
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).not.toHaveBeenCalled();
		land();
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
	});
});

/** Mirrors the assignment route: the modal stays mounted, `open` toggles and
 * the assignment id can change underneath it. */
function Reopenable({
	assignmentId,
	next,
}: {
	assignmentId: string;
	next?: string;
}) {
	const [open, setOpen] = useState(false);
	const [id, setId] = useState(assignmentId);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				open
			</button>
			{next && (
				<button type="button" onClick={() => setId(next)}>
					next
				</button>
			)}
			<GradeModal
				open={open}
				onClose={() => setOpen(false)}
				assignmentId={id}
			/>
		</>
	);
}
