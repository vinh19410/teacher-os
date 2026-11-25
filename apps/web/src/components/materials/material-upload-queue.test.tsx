// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type MaterialUploadBatchSettledOutcome,
	type MaterialUploadQueueItem,
	MaterialUploadQueueList,
	useMaterialUploadQueue,
} from "@/components/materials/material-upload-queue";
import { HttpError } from "@/lib/kernel-load-state";
import {
	createUploadQueueItem,
	summarizeUploadQueue,
} from "@/lib/material-upload-queue";
import { reauth } from "@/lib/reauth";
import { materialsAllQueryKey } from "@/lib/repos/materials";

vi.mock("@/lib/reauth", () => ({
	reauth: vi.fn(),
}));

interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeFile(
	name: string,
	options: { type?: string; size?: number; lastModified?: number } = {},
): File {
	const file = new File(["content"], name, {
		type: options.type ?? "application/pdf",
		lastModified: options.lastModified ?? 1_700_000_000_000,
	});
	if (options.size !== undefined) {
		Object.defineProperty(file, "size", { value: options.size });
	}
	return file;
}

function createWrapper(queryClient: QueryClient) {
	return function Wrapper({ children }: { children: ReactNode }) {
		return (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);
	};
}

interface HarnessControls {
	addFiles: (
		files: readonly File[],
		options?: { replaceIfOnlyInvalid?: boolean },
	) => void;
	startUpload: () => Promise<unknown>;
	uploadFilesNow: (files: readonly File[]) => Promise<unknown>;
	retryFailed: () => Promise<unknown>;
	clear: () => void;
}

function QueueHarness({
	upload,
	onFileUploaded,
	onBatchSettled,
	onDismiss,
	allowRemove = true,
	suppressAlert = false,
	concurrency,
	controlsRef,
}: {
	upload: (input: { file: File; mimeType: string }) => Promise<string>;
	onFileUploaded?: (result: string, item: MaterialUploadQueueItem) => void;
	onBatchSettled?: (outcome: MaterialUploadBatchSettledOutcome<string>) => void;
	onDismiss?: () => void;
	allowRemove?: boolean;
	suppressAlert?: boolean;
	concurrency?: number;
	controlsRef: { current: HarnessControls | null };
}) {
	const queue = useMaterialUploadQueue<string>({
		upload,
		onFileUploaded,
		onBatchSettled,
		concurrency,
	});

	controlsRef.current = {
		addFiles: (files, options) => queue.addFiles(files, options),
		startUpload: () => queue.startUpload(),
		uploadFilesNow: (files) => queue.uploadFilesNow(files),
		retryFailed: () => queue.retryFailed(),
		clear: () => queue.clear(),
	};

	return (
		<MaterialUploadQueueList
			items={queue.items}
			summary={queue.summary}
			allowRemove={allowRemove}
			suppressAlert={suppressAlert}
			onRemove={queue.removeItem}
			onRetryFailed={() => void queue.retryFailed()}
			onDismiss={onDismiss}
		/>
	);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("useMaterialUploadQueue + MaterialUploadQueueList", () => {
	it("updates progress, hides remove buttons while uploading, and invalidates queries once at batch end", async () => {
		const queryClient = new QueryClient();
		const invalidateSpy = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);
		const onFileUploaded = vi.fn();
		const onBatchSettled = vi.fn();
		const deferredByName = new Map<string, Deferred<string>>();
		const controlsRef: { current: HarnessControls | null } = { current: null };

		render(
			<QueueHarness
				upload={({ file }) => {
					const deferred = createDeferred<string>();
					deferredByName.set(file.name, deferred);
					return deferred.promise;
				}}
				onFileUploaded={onFileUploaded}
				onBatchSettled={onBatchSettled}
				controlsRef={controlsRef}
			/>,
			{ wrapper: createWrapper(queryClient) },
		);

		// Khi rỗng không render danh sách.
		expect(
			screen.queryByRole("list", { name: "Danh sách file tải lên" }),
		).toBeNull();

		const f1 = makeFile("lesson-1.pdf", { size: 1024 });
		const f2 = makeFile("lesson-2.pdf", { size: 2048 });
		const f3 = makeFile("lesson-3.pdf", { size: 3072 });
		const fRemove = makeFile("remove-me.pdf", { size: 512 });

		act(() => {
			controlsRef.current?.addFiles([f1, f2, f3, fRemove]);
		});

		expect(screen.getByText("4 file đã chọn")).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Bỏ remove-me.pdf" }));
		expect(screen.getByText("3 file đã chọn")).toBeTruthy();
		expect(screen.queryByText("remove-me.pdf")).toBeNull();

		let startPromise: Promise<unknown> | undefined;
		act(() => {
			startPromise = controlsRef.current?.startUpload();
		});

		expect(screen.getByText("Đang tải 0/3 file…")).toBeTruthy();
		// Nút bỏ file bị ẩn khi đang tải.
		expect(
			screen.queryByRole("button", { name: "Bỏ lesson-1.pdf" }),
		).toBeNull();

		// Hoàn tất từng file — chưa invalidate cho đến cuối đợt.
		await act(async () => {
			deferredByName.get("lesson-1.pdf")?.resolve("mat-1");
			await Promise.resolve();
		});
		expect(screen.getByText("Đang tải 1/3 file…")).toBeTruthy();
		expect(invalidateSpy).not.toHaveBeenCalled();

		await act(async () => {
			deferredByName.get("lesson-2.pdf")?.resolve("mat-2");
			deferredByName.get("lesson-3.pdf")?.resolve("mat-3");
			await startPromise;
		});

		expect(screen.getByText("Đã tải xong 3/3 file.")).toBeTruthy();
		expect(onFileUploaded).toHaveBeenCalledTimes(3);
		expect(invalidateSpy).toHaveBeenCalledTimes(1);
		expect(invalidateSpy).toHaveBeenCalledWith({
			queryKey: materialsAllQueryKey,
		});
		expect(onBatchSettled).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("retries only failed files when clicking the retry action", async () => {
		const queryClient = new QueryClient();
		const invalidateSpy = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);
		const controlsRef: { current: HarnessControls | null } = { current: null };
		let shouldFailSecond = true;
		const uploadedNames: string[] = [];

		render(
			<QueueHarness
				upload={async ({ file }) => {
					uploadedNames.push(file.name);
					if (file.name === "flaky.pdf" && shouldFailSecond) {
						throw new HttpError(500, "temporary");
					}
					return `ok:${file.name}`;
				}}
				controlsRef={controlsRef}
			/>,
			{ wrapper: createWrapper(queryClient) },
		);

		const f1 = makeFile("ok.pdf", { size: 1024 });
		const f2 = makeFile("flaky.pdf", { size: 2048 });
		act(() => {
			controlsRef.current?.addFiles([f1, f2]);
		});

		await act(async () => {
			await controlsRef.current?.startUpload();
		});

		expect(uploadedNames).toEqual(["ok.pdf", "flaky.pdf"]);
		expect(screen.getByText("Đã tải 1/2 file · 1 lỗi")).toBeTruthy();
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getByRole("alert").textContent).toBe(
			"Không lưu được — vui lòng thử lại.",
		);

		shouldFailSecond = false;
		fireEvent.click(screen.getByRole("button", { name: "Thử lại 1 file lỗi" }));

		await waitFor(() =>
			expect(screen.getByText("Đã tải xong 2/2 file.")).toBeTruthy(),
		);
		// Chỉ tải lại đúng file lỗi, không gửi lại file đã xong.
		expect(uploadedNames).toEqual(["ok.pdf", "flaky.pdf", "flaky.pdf"]);
		expect(invalidateSpy).toHaveBeenCalledTimes(2);
		expect(screen.queryByRole("alert")).toBeNull();
		expect(screen.queryByRole("button", { name: /Thử lại/ })).toBeNull();
	});

	it("calls reauth once on 401 and skips onBatchSettled", async () => {
		const queryClient = new QueryClient();
		const onBatchSettled = vi.fn();
		const controlsRef: { current: HarnessControls | null } = { current: null };
		const deferredByName = new Map<string, Deferred<string>>();

		render(
			<QueueHarness
				concurrency={2}
				upload={({ file }) => {
					const deferred = createDeferred<string>();
					deferredByName.set(file.name, deferred);
					return deferred.promise;
				}}
				onBatchSettled={onBatchSettled}
				controlsRef={controlsRef}
			/>,
			{ wrapper: createWrapper(queryClient) },
		);

		const files = [
			makeFile("a.pdf", { size: 100 }),
			makeFile("b.pdf", { size: 200 }),
			makeFile("c.pdf", { size: 300 }),
		];

		let runPromise: Promise<unknown> | undefined;
		act(() => {
			runPromise = controlsRef.current?.uploadFilesNow(files);
		});

		await act(async () => {
			deferredByName.get("a.pdf")?.reject(new HttpError(401, "expired"));
			deferredByName.get("b.pdf")?.reject(new HttpError(401, "expired"));
			await runPromise;
		});

		expect(reauth).toHaveBeenCalledTimes(1);
		expect(deferredByName.has("c.pdf")).toBe(false);
		expect(onBatchSettled).not.toHaveBeenCalled();
	});

	it("renders a single role=alert with exact message for 1 invalid file and summary alert for multiple problem files", () => {
		const oneInvalid = [
			createUploadQueueItem(
				makeFile("bad.html", { type: "text/html", size: 64 }),
				"bad-1",
			),
		];
		const { rerender } = render(
			<MaterialUploadQueueList
				items={oneInvalid}
				summary={summarizeUploadQueue(oneInvalid)}
			/>,
		);

		const alertsSingle = screen.getAllByRole("alert");
		expect(alertsSingle).toHaveLength(1);
		expect(alertsSingle[0]?.textContent).toBe(oneInvalid[0]?.errorMessage);
		const list = screen.getByRole("list", { name: "Danh sách file tải lên" });
		expect(within(list).queryByRole("alert")).toBeNull();

		const twoInvalidOneValid = [
			createUploadQueueItem(makeFile("ok.pdf", { size: 128 }), "ok-1"),
			createUploadQueueItem(
				makeFile("bad1.html", { type: "text/html", size: 64 }),
				"bad-1",
			),
			createUploadQueueItem(
				makeFile("bad2.exe", {
					type: "application/octet-stream",
					size: 64,
				}),
				"bad-2",
			),
		];
		rerender(
			<MaterialUploadQueueList
				items={twoInvalidOneValid}
				summary={summarizeUploadQueue(twoInvalidOneValid)}
			/>,
		);
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getByRole("alert").textContent).toBe(
			"2 file không hợp lệ sẽ được bỏ qua khi tải lên. Xem chi tiết từng file bên dưới.",
		);

		const twoErrorsOneInvalid: MaterialUploadQueueItem[] = [
			{
				...createUploadQueueItem(makeFile("err1.pdf", { size: 100 }), "e-1"),
				status: "error",
				errorMessage: "Lỗi 1",
			},
			{
				...createUploadQueueItem(makeFile("err2.pdf", { size: 100 }), "e-2"),
				status: "error",
				errorMessage: "Lỗi 2",
			},
			createUploadQueueItem(
				makeFile("bad.html", { type: "text/html", size: 64 }),
				"bad-3",
			),
		];
		rerender(
			<MaterialUploadQueueList
				items={twoErrorsOneInvalid}
				summary={summarizeUploadQueue(twoErrorsOneInvalid)}
			/>,
		);
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		expect(screen.getByRole("alert").textContent).toBe(
			"2 file tải lên thất bại và 1 file không hợp lệ. Xem chi tiết từng file bên dưới.",
		);

		rerender(
			<MaterialUploadQueueList
				items={twoErrorsOneInvalid}
				summary={summarizeUploadQueue(twoErrorsOneInvalid)}
				suppressAlert
			/>,
		);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("stays safe on unmount while an upload is in flight without invoking callbacks", async () => {
		const queryClient = new QueryClient();
		const invalidateSpy = vi
			.spyOn(queryClient, "invalidateQueries")
			.mockResolvedValue(undefined);
		const onFileUploaded = vi.fn();
		const onBatchSettled = vi.fn();
		const controlsRef: { current: HarnessControls | null } = { current: null };
		const deferred = createDeferred<string>();

		const view = render(
			<QueueHarness
				upload={() => deferred.promise}
				onFileUploaded={onFileUploaded}
				onBatchSettled={onBatchSettled}
				controlsRef={controlsRef}
			/>,
			{ wrapper: createWrapper(queryClient) },
		);

		let uploadPromise: Promise<unknown> | undefined;
		act(() => {
			uploadPromise = controlsRef.current?.uploadFilesNow([
				makeFile("slow.pdf", { size: 500 }),
			]);
		});

		view.unmount();

		await act(async () => {
			deferred.resolve("mat-slow");
			await uploadPromise;
		});

		expect(onFileUploaded).not.toHaveBeenCalled();
		expect(onBatchSettled).not.toHaveBeenCalled();
		expect(invalidateSpy).toHaveBeenCalledTimes(1);
	});

	it("ignores mutations while uploading, supports dismiss when settled, and skips upload when uploadFilesNow receives only invalid files", async () => {
		const queryClient = new QueryClient();
		const onDismiss = vi.fn();
		const upload = vi.fn();
		const controlsRef: { current: HarnessControls | null } = { current: null };

		render(
			<QueueHarness
				upload={upload}
				onDismiss={onDismiss}
				controlsRef={controlsRef}
			/>,
			{ wrapper: createWrapper(queryClient) },
		);

		// Chỉ toàn file không hợp lệ → không gọi upload, hiện thông báo và nút Ẩn.
		let invalidResult: unknown;
		await act(async () => {
			invalidResult = await controlsRef.current?.uploadFilesNow([
				makeFile("script.html", { type: "text/html", size: 50 }),
			]);
		});
		expect(upload).not.toHaveBeenCalled();
		expect(invalidResult).toMatchObject({ run: null });
		expect(screen.getAllByRole("alert")).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: "Ẩn tiến độ tải lên" }));
		expect(onDismiss).toHaveBeenCalledTimes(1);

		// Trong lúc đang tải: addFiles / clear bị bỏ qua và nút Ẩn bị ẩn.
		const deferred = createDeferred<string>();
		upload.mockReturnValueOnce(deferred.promise);
		let uploadPromise: Promise<unknown> | undefined;
		act(() => {
			uploadPromise = controlsRef.current?.uploadFilesNow([
				makeFile("valid.pdf", { size: 512 }),
			]);
		});
		expect(
			screen.queryByRole("button", { name: "Ẩn tiến độ tải lên" }),
		).toBeNull();

		act(() => {
			controlsRef.current?.addFiles([makeFile("extra.pdf", { size: 256 })]);
			controlsRef.current?.clear();
		});
		expect(screen.getByText("valid.pdf")).toBeTruthy();
		expect(screen.queryByText("extra.pdf")).toBeNull();

		await act(async () => {
			deferred.resolve("mat-valid");
			await uploadPromise;
		});
		expect(
			screen.getByRole("button", { name: "Ẩn tiến độ tải lên" }),
		).toBeTruthy();
	});
});
