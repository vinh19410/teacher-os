import type { ReplacedResourceState } from "alchemy/State/ResourceState";
import type { PersistedState } from "alchemy/State/State";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { describe, expect, it } from "vitest";
import {
	canonicalJson,
	copyState,
	countState,
	DestinationStateConflictError,
	EmptySourceStateError,
	hashValue,
	InvalidStageError,
	type ReadonlySourceStateService,
	ReplacedResourcesPendingError,
	type TargetStateService,
	verifyState,
} from "./state-copy.ts";

/**
 * In-memory test implementation of StateService interfaces.
 */
class InMemoryStateStore
	implements ReadonlySourceStateService, TargetStateService
{
	readonly id = "inmemory-test";
	readonly resources = new Map<string, PersistedState>();
	readonly outputs = new Map<string, unknown>();
	readonly replaced = new Map<string, ReplacedResourceState[]>();

	private makeKey(stack: string, stage: string, fqn: string): string {
		return `${stack}:${stage}:${fqn}`;
	}

	private makeStageKey(stack: string, stage: string): string {
		return `${stack}:${stage}`;
	}

	list(request: { stack: string; stage: string }) {
		const prefix = `${request.stack}:${request.stage}:`;
		const fqns: string[] = [];
		for (const key of this.resources.keys()) {
			if (key.startsWith(prefix)) {
				fqns.push(key.slice(prefix.length));
			}
		}
		return Effect.succeed(fqns.sort());
	}

	get(request: { stack: string; stage: string; fqn: string }) {
		const key = this.makeKey(request.stack, request.stage, request.fqn);
		return Effect.succeed(this.resources.get(key));
	}

	set<V extends PersistedState>(request: {
		stack: string;
		stage: string;
		fqn: string;
		value: V;
	}) {
		const key = this.makeKey(request.stack, request.stage, request.fqn);
		this.resources.set(key, request.value);
		return Effect.succeed(request.value);
	}

	getOutput(request: { stack: string; stage: string }) {
		const key = this.makeStageKey(request.stack, request.stage);
		return Effect.succeed(this.outputs.get(key));
	}

	setOutput(request: { stack: string; stage: string; value: unknown }) {
		const key = this.makeStageKey(request.stack, request.stage);
		this.outputs.set(key, request.value);
		return Effect.succeed(request.value);
	}

	getReplacedResources(request: { stack: string; stage: string }) {
		const key = this.makeStageKey(request.stack, request.stage);
		return Effect.succeed(this.replaced.get(key) ?? []);
	}

	listStages(stack: string) {
		const stages = new Set<string>();
		for (const key of this.resources.keys()) {
			const parts = key.split(":");
			if (parts[0] === stack && parts[1]) {
				stages.add(parts[1]);
			}
		}
		return Effect.succeed([...stages]);
	}
}

describe("state-copy utilities", () => {
	it("canonicalJson produces deterministic JSON regardless of key order", () => {
		const obj1 = { b: 2, a: 1, c: { z: 10, y: 20 } };
		const obj2 = { a: 1, c: { y: 20, z: 10 }, b: 2 };
		expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
		expect(hashValue(obj1)).toBe(hashValue(obj2));
	});

	it("canonicalJson omits undefined keys", () => {
		const obj1 = { a: 1, b: undefined };
		const obj2 = { a: 1 };
		expect(canonicalJson(obj1)).toBe(canonicalJson(obj2));
	});

	it("canonicalJson distinguishes different Redacted secret values", () => {
		const s1 = { token: Redacted.make("secret-alpha") };
		const s2 = { token: Redacted.make("secret-beta") };
		expect(canonicalJson(s1)).not.toBe(canonicalJson(s2));
		expect(hashValue(s1)).not.toBe(hashValue(s2));
	});

	it("canonicalJson formats Date deterministically", () => {
		const d1 = new Date("2026-11-05T12:00:00.000Z");
		const d2 = new Date("2026-11-05T12:00:00.000Z");
		expect(canonicalJson(d1)).toBe(canonicalJson(d2));
		expect(hashValue(d1)).toBe(hashValue(d2));
	});

	it("rejects invalid stage names", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		const error = await Effect.runPromise(
			Effect.flip(copyState(source, dest, { stage: "invalid-stage" })),
		);
		expect(error).toBeInstanceOf(InvalidStageError);
	});

	it("counts state properly in both stores", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		await Effect.runPromise(
			source.set({
				stack: "teacher-os",
				stage: "staging",
				fqn: "Cloudflare.Worker.api",
				value: {
					kind: "action",
					status: "completed",
				} as unknown as PersistedState,
			}),
		);

		const count = await Effect.runPromise(countState(source, dest, "staging"));
		expect(count.sourceCount).toBe(1);
		expect(count.destCount).toBe(0);
		expect(count.stage).toBe("staging");
		expect(count.sourceFqns).toEqual(["Cloudflare.Worker.api"]);
	});

	it("copies only stack teacher-os and ignores foreign stacks", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		// teacher-os resources
		await Effect.runPromise(
			source.set({
				stack: "teacher-os",
				stage: "staging",
				fqn: "Cloudflare.Worker.web",
				value: {
					kind: "action",
					status: "completed",
					script: "web.js",
				} as unknown as PersistedState,
			}),
		);
		await Effect.runPromise(
			source.setOutput({
				stack: "teacher-os",
				stage: "staging",
				value: { url: "https://staging.teacheros.io.vn" },
			}),
		);

		// foreign stack resources on same shared store
		await Effect.runPromise(
			source.set({
				stack: "lexi-quest",
				stage: "staging",
				fqn: "Cloudflare.Worker.lexi",
				value: {
					kind: "action",
					status: "completed",
				} as unknown as PersistedState,
			}),
		);
		await Effect.runPromise(
			source.set({
				stack: "vox-flow",
				stage: "staging",
				fqn: "Cloudflare.Worker.vox",
				value: {
					kind: "action",
					status: "completed",
				} as unknown as PersistedState,
			}),
		);

		const copyRes = await Effect.runPromise(
			copyState(source, dest, { stage: "staging" }),
		);

		expect(copyRes.copiedCount).toBe(1);
		expect(copyRes.outputCopied).toBe(true);

		// Verify dest has ONLY teacher-os
		const destTeacherOs = await Effect.runPromise(
			dest.list({ stack: "teacher-os", stage: "staging" }),
		);
		expect(destTeacherOs).toEqual(["Cloudflare.Worker.web"]);

		const destLexi = await Effect.runPromise(
			dest.list({ stack: "lexi-quest", stage: "staging" }),
		);
		expect(destLexi).toEqual([]);

		const destVox = await Effect.runPromise(
			dest.list({ stack: "vox-flow", stage: "staging" }),
		);
		expect(destVox).toEqual([]);

		// Verify parity
		const verify = await Effect.runPromise(
			verifyState(source, dest, "staging"),
		);
		expect(verify.matches).toBe(true);
		expect(verify.fqnTotal).toBe(1);
		expect(verify.fqnMatched).toBe(1);
		expect(verify.outputMatches).toBe(true);
		expect(verify.missingInDest).toEqual([]);
		expect(verify.extraInDest).toEqual([]);
	});

	it("stops when source has replacedResources pending", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		source.replaced.set("teacher-os:staging", [
			{
				fqn: "Cloudflare.D1.db",
				type: "Cloudflare.D1",
				old: [],
				logicalId: "db-old",
				status: "pending-delete",
			} as unknown as ReplacedResourceState,
		]);

		const error = await Effect.runPromise(
			Effect.flip(copyState(source, dest, { stage: "staging" })),
		);
		expect(error).toBeInstanceOf(ReplacedResourcesPendingError);
	});

	it("safely handles existing data in destination with conflict detection", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		await Effect.runPromise(
			source.set({
				stack: "teacher-os",
				stage: "prod",
				fqn: "Cloudflare.Worker.server",
				value: {
					secretToken: "super-secret-123",
					version: 1,
				} as unknown as PersistedState,
			}),
		);

		await Effect.runPromise(
			dest.set({
				stack: "teacher-os",
				stage: "prod",
				fqn: "Cloudflare.Worker.server",
				value: {
					secretToken: "different-token",
					version: 2,
				} as unknown as PersistedState,
			}),
		);

		// Without overwrite -> fails
		const failError = await Effect.runPromise(
			Effect.flip(copyState(source, dest, { stage: "prod", overwrite: false })),
		);
		expect(failError).toBeInstanceOf(DestinationStateConflictError);

		// With overwrite -> succeeds
		const successResult = await Effect.runPromise(
			copyState(source, dest, { stage: "prod", overwrite: true }),
		);
		expect(successResult.copiedCount).toBe(1);

		const verify = await Effect.runPromise(verifyState(source, dest, "prod"));
		expect(verify.matches).toBe(true);
		// Verify secret values are hashed, not exposed plaintext
		expect(verify.sourceHashes["Cloudflare.Worker.server"]).toBeDefined();
		expect(verify.sourceHashes["Cloudflare.Worker.server"]).not.toContain(
			"super-secret-123",
		);
	});

	it("idempotent copy when destination is already identical", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		await Effect.runPromise(
			source.set({
				stack: "teacher-os",
				stage: "staging",
				fqn: "Cloudflare.Worker.web",
				value: { version: "v1" } as unknown as PersistedState,
			}),
		);
		await Effect.runPromise(
			dest.set({
				stack: "teacher-os",
				stage: "staging",
				fqn: "Cloudflare.Worker.web",
				value: { version: "v1" } as unknown as PersistedState,
			}),
		);

		const result = await Effect.runPromise(
			copyState(source, dest, { stage: "staging", overwrite: false }),
		);
		expect(result.copiedCount).toBe(0);
	});

	it("fails copyState and verifyState when source store has 0 FQNs", async () => {
		const source = new InMemoryStateStore();
		const dest = new InMemoryStateStore();

		const copyErr = await Effect.runPromise(
			Effect.flip(copyState(source, dest, { stage: "staging" })),
		);
		expect(copyErr).toBeInstanceOf(EmptySourceStateError);

		const verifyErr = await Effect.runPromise(
			Effect.flip(verifyState(source, dest, "staging")),
		);
		expect(verifyErr).toBeInstanceOf(EmptySourceStateError);
	});
});
