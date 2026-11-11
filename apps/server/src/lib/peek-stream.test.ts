import { describe, expect, test } from "vitest";
import { peekStream } from "./peek-stream";

function sequenceBytes(length: number): Uint8Array {
	const out = new Uint8Array(length);
	for (let i = 0; i < length; i++) out[i] = i & 0xff;
	return out;
}

describe("peekStream", () => {
	test("peeks exact prefix across 1-byte chunks with pull backpressure and replays byte-identically", async () => {
		const source = sequenceBytes(150);
		let pulled = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (pulled >= source.byteLength) {
						controller.close();
						return;
					}
					controller.enqueue(source.subarray(pulled, pulled + 1));
					pulled += 1;
				},
			},
			{ highWaterMark: 0 },
		);

		const peeked = await peekStream(body, 64);
		expect(peeked.head).toEqual(source.subarray(0, 64));
		expect(peeked.readBytes).toBe(64);
		expect(peeked.ended).toBe(false);
		// Pull-based backpressure: must NOT eagerly drain past maxBytes during peek.
		expect(pulled).toBe(64);

		const replayed = new Uint8Array(
			await new Response(peeked.stream).arrayBuffer(),
		);
		expect(replayed).toEqual(source);
		expect(body.locked).toBe(false);
	});

	test("replays the entire first chunk when it exceeds maxBytes without truncating bytes past head", async () => {
		const source = sequenceBytes(250);
		let step = 0;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					step += 1;
					if (step === 1) controller.enqueue(source.subarray(0, 200));
					else if (step === 2) controller.enqueue(source.subarray(200, 250));
					else controller.close();
				},
			},
			{ highWaterMark: 0 },
		);

		const peeked = await peekStream(body, 64);
		expect(step).toBe(1);
		expect(peeked.head).toEqual(source.subarray(0, 64));
		expect(peeked.readBytes).toBe(200);
		expect(peeked.ended).toBe(false);

		const replayed = new Uint8Array(
			await new Response(peeked.stream).arrayBuffer(),
		);
		expect(replayed).toEqual(source);
		expect(body.locked).toBe(false);
	});

	test("handles streams shorter than maxBytes and releases reader lock immediately", async () => {
		const source = sequenceBytes(10);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(source);
				controller.close();
			},
		});

		const peeked = await peekStream(body, 64);
		expect(peeked.head).toEqual(source);
		expect(peeked.readBytes).toBe(10);
		expect(peeked.ended).toBe(true);
		expect(body.locked).toBe(false);

		const replayed = new Uint8Array(
			await new Response(peeked.stream).arrayBuffer(),
		);
		expect(replayed).toEqual(source);
	});

	test("skips sparse empty chunks and aborts when consecutive empty chunks exceed limit", async () => {
		const source = sequenceBytes(20);
		const parts = [
			new Uint8Array(0),
			source.subarray(0, 8),
			new Uint8Array(0),
			source.subarray(8, 20),
			new Uint8Array(0),
		];
		let idx = 0;
		const sparseBody = new ReadableStream<Uint8Array>({
			pull(controller) {
				if (idx >= parts.length) {
					controller.close();
					return;
				}
				const next = parts[idx];
				idx += 1;
				if (next) controller.enqueue(next);
			},
		});
		const peeked = await peekStream(sparseBody, 10);
		expect(peeked.head).toEqual(source.subarray(0, 10));
		const replayed = new Uint8Array(
			await new Response(peeked.stream).arrayBuffer(),
		);
		expect(replayed).toEqual(source);
		expect(sparseBody.locked).toBe(false);

		let stalledCanceled = false;
		const infiniteEmpty = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array(0));
			},
			cancel() {
				stalledCanceled = true;
			},
		});
		await expect(peekStream(infiniteEmpty, 10, 8)).rejects.toThrow(
			/empty chunks/i,
		);
		expect(stalledCanceled).toBe(true);
		expect(infiniteEmpty.locked).toBe(false);
	});

	test("survives concurrent pull() and cancel() race without Controller is already closed", async () => {
		const prefix = sequenceBytes(64);
		let sentPrefix = false;
		let cancelReason: unknown = null;
		const hangGate = Promise.withResolvers<void>();

		const body = new ReadableStream<Uint8Array>({
			async pull(controller) {
				if (!sentPrefix) {
					sentPrefix = true;
					controller.enqueue(prefix);
					return;
				}
				await hangGate.promise;
				controller.close();
			},
			cancel(reason) {
				cancelReason = reason;
				hangGate.resolve();
			},
		});

		const peeked = await peekStream(body, 64);
		const reader = peeked.stream.getReader();
		// Drain buffered 64-byte prefix first.
		const first = await reader.read();
		expect(first.value).toEqual(prefix);
		// Start an in-flight pull() waiting on upstream, then cancel concurrently.
		const pendingRead = reader.read();
		await Promise.resolve();
		await reader.cancel("size-mismatch-abort");
		const settled = await pendingRead;
		expect(settled.done).toBe(true);
		expect(cancelReason).toBe("size-mismatch-abort");
		expect(body.locked).toBe(false);
	});

	test("rejects negative or non-integer maxBytes without locking the stream", async () => {
		const body = new ReadableStream<Uint8Array>();
		await expect(peekStream(body, -1)).rejects.toThrow(RangeError);
		await expect(peekStream(body, 1.5)).rejects.toThrow(RangeError);
		expect(body.locked).toBe(false);
	});
});
