import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFsMediaStore } from "./fs-media-store";

async function readAllBytes(
	stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) {
			chunks.push(value);
			total += value.byteLength;
		}
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

test("createFsMediaStore đọc toàn bộ hoặc đúng đoạn byte đầu, giữa, cuối khi truyền range", async () => {
	const dir = await mkdtemp(join(tmpdir(), "fs-media-store-test-"));
	try {
		const store = createFsMediaStore(dir);
		const payload = new TextEncoder().encode("0123456789ABCDEF");
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(payload);
				controller.close();
			},
		});

		await store.put("placement/org-1/audio-1", stream, {
			contentType: "audio/mpeg",
			size: payload.byteLength,
		});

		const full = await store.get("placement/org-1/audio-1");
		assert.ok(full);
		assert.equal(full.size, 16);
		assert.equal(full.range, undefined);
		assert.equal(
			new TextDecoder().decode(await readAllBytes(full.body)),
			"0123456789ABCDEF",
		);

		const head = await store.get("placement/org-1/audio-1", {
			offset: 0,
			length: 4,
		});
		assert.ok(head);
		assert.deepEqual(head.range, { offset: 0, length: 4 });
		assert.equal(
			new TextDecoder().decode(await readAllBytes(head.body)),
			"0123",
		);

		const middle = await store.get("placement/org-1/audio-1", {
			offset: 4,
			length: 6,
		});
		assert.ok(middle);
		assert.deepEqual(middle.range, { offset: 4, length: 6 });
		assert.equal(
			new TextDecoder().decode(await readAllBytes(middle.body)),
			"456789",
		);

		const tail = await store.get("placement/org-1/audio-1", {
			offset: 12,
			length: 4,
		});
		assert.ok(tail);
		assert.deepEqual(tail.range, { offset: 12, length: 4 });
		assert.equal(
			new TextDecoder().decode(await readAllBytes(tail.body)),
			"CDEF",
		);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
