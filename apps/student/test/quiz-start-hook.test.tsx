// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@teacher-os/env/web", () => ({
	env: { VITE_SERVER_URL: "http://localhost:8000" },
}));

import { quizDetailQueryKey, useStartQuizAttempt } from "@/lib/repos/quiz";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function StartHookHarness({ testId }: { testId: string }) {
	const mutation = useStartQuizAttempt({ kind: "practice", testId });
	return (
		<button
			type="button"
			data-testid="start-hook-btn"
			disabled={mutation.isPending}
			onClick={() => mutation.mutate()}
		>
			{mutation.isPending ? "pending" : "idle"}
		</button>
	);
}

describe("useStartQuizAttempt — chờ invalidateQueries hoàn tất (#883)", () => {
	it("giữ isPending=true sau khi POST /attempts trả 201 cho tới khi refetch GET /quiz hoàn tất", async () => {
		const deferred: { resolve: () => void } = { resolve: () => {} };
		const refetchPromise = new Promise<void>((resolve) => {
			deferred.resolve = resolve;
		});

		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ attemptId: "att-1" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			}),
		);

		const qc = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		const source = { kind: "practice", testId: "test-pending-1" } as const;
		const key = quizDetailQueryKey(source);
		qc.setQueryData(key, { attempt: null });
		const invalidateSpy = vi
			.spyOn(qc, "invalidateQueries")
			.mockReturnValue(refetchPromise);

		render(
			<QueryClientProvider client={qc}>
				<StartHookHarness testId="test-pending-1" />
			</QueryClientProvider>,
		);

		const btn = screen.getByTestId("start-hook-btn") as HTMLButtonElement;
		expect(btn.textContent).toBe("idle");
		fireEvent.click(btn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledTimes(1);
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: key });
		});

		// POST đã resolve và invalidateQueries đã chạy, nhưng refetch chưa xong → vẫn phải pending.
		expect(btn.disabled).toBe(true);
		expect(btn.textContent).toBe("pending");

		deferred.resolve();
		await waitFor(() => {
			expect(btn.disabled).toBe(false);
			expect(btn.textContent).toBe("idle");
		});
	});
});
