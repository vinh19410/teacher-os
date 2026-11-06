import { createHash } from "node:crypto";
import type { ReplacedResourceState } from "alchemy/State/ResourceState";
import type { StateService, StateStoreError } from "alchemy/State/State";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";

export const STACK_NAME = "teacher-os";
export const ALLOWED_STAGES = ["staging", "prod"] as const;
export type ValidStage = (typeof ALLOWED_STAGES)[number];

export function isValidStage(stage: string): stage is ValidStage {
	return (ALLOWED_STAGES as readonly string[]).includes(stage);
}

export class InvalidStageError extends Data.TaggedError("InvalidStageError")<{
	readonly stage: string;
	readonly allowed: readonly string[];
}> {
	get message(): string {
		return `Invalid stage '${this.stage}'. Allowed stages: ${this.allowed.join(", ")}`;
	}
}

export class ReplacedResourcesPendingError extends Data.TaggedError(
	"ReplacedResourcesPendingError",
)<{
	readonly stage: string;
	readonly count: number;
}> {
	get message(): string {
		return `Cannot copy state: stage '${this.stage}' has ${this.count} replaced resource(s) pending cleanup in source store.`;
	}
}
export class EmptySourceStateError extends Data.TaggedError(
	"EmptySourceStateError",
)<{
	readonly stage: string;
	readonly stack: string;
}> {
	get message(): string {
		return `Source store has 0 resources for stack '${this.stack}' stage '${this.stage}'. Refusing to proceed with empty source state.`;
	}
}

export class DestinationStateConflictError extends Data.TaggedError(
	"DestinationStateConflictError",
)<{
	readonly stage: string;
	readonly destCount: number;
	readonly message: string;
}> {}

/**
 * Deterministic JSON stringifier for hashing and structural comparison.
 * Sorts object keys alphabetically, ignores undefined properties, and formats arrays recursively.
 */
export function canonicalJson(value: unknown): string {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (Redacted.isRedacted(value)) {
		return `{"$redacted":${canonicalJson(Redacted.value(value))}}`;
	}
	if (value instanceof Date) {
		return JSON.stringify(value.toISOString());
	}
	if (typeof value === "bigint") return value.toString();
	if (typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, item]) => item !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries
		.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
		.join(",")}}`;
}

/**
 * Computes a SHA-256 digest of a value without ever logging or exposing plaintext secrets.
 */
export function hashValue(value: unknown): string {
	return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * Read-only interface for the source StateService.
 * Explicitly omits set, setOutput, delete, and deleteStack to ensure source data can never be modified.
 */
export type ReadonlySourceStateService = Pick<
	StateService,
	"list" | "get" | "getOutput" | "getReplacedResources" | "listStages"
>;

/**
 * Target StateService interface.
 * Explicitly omits delete and deleteStack to ensure destination store never deletes resources during copy.
 */
export type TargetStateService = Pick<
	StateService,
	"list" | "get" | "getOutput" | "set" | "setOutput" | "listStages"
>;

export interface CountResult {
	readonly stack: string;
	readonly stage: ValidStage;
	readonly sourceCount: number;
	readonly destCount: number | undefined;
	readonly sourceFqns: readonly string[];
	readonly destFqns: readonly string[] | undefined;
}

export interface CopyResult {
	readonly stack: string;
	readonly stage: ValidStage;
	readonly copiedCount: number;
	readonly hasOutput: boolean;
	readonly outputCopied: boolean;
}

export interface VerifyResult {
	readonly stack: string;
	readonly stage: ValidStage;
	readonly matches: boolean;
	readonly fqnTotal: number;
	readonly fqnMatched: number;
	readonly missingInDest: readonly string[];
	readonly extraInDest: readonly string[];
	readonly contentMismatches: readonly string[];
	readonly outputMatches: boolean;
	/**
	 * SHA-256 hashes of each FQN in source store.
	 * Plaintext secrets are NEVER recorded here.
	 */
	readonly sourceHashes: Readonly<Record<string, string>>;
}

/**
 * Validate stage parameter.
 */
export function assertValidStage(
	stage: string,
): Effect.Effect<ValidStage, InvalidStageError> {
	if (isValidStage(stage)) {
		return Effect.succeed(stage);
	}
	return Effect.fail(new InvalidStageError({ stage, allowed: ALLOWED_STAGES }));
}

/**
 * Count resources in source and destination store for the given stage.
 */
export function countState(
	source: ReadonlySourceStateService,
	dest: TargetStateService | undefined,
	stage: string,
): Effect.Effect<CountResult, InvalidStageError | StateStoreError> {
	return Effect.gen(function* () {
		const validStage = yield* assertValidStage(stage);
		const sourceFqns = yield* source.list({
			stack: STACK_NAME,
			stage: validStage,
		});
		let destCount: number | undefined;
		let destFqns: readonly string[] | undefined;

		if (dest !== undefined) {
			const list = yield* dest.list({ stack: STACK_NAME, stage: validStage });
			destFqns = list;
			destCount = list.length;
		}

		return {
			stack: STACK_NAME,
			stage: validStage,
			sourceCount: sourceFqns.length,
			destCount,
			sourceFqns,
			destFqns,
		};
	});
}

/**
 * Safely copies state from source store to destination store for stack `teacher-os` and specified stage.
 *
 * Guarantees:
 * 1. Reads ONLY stack "teacher-os" from source; ignores all other stacks.
 * 2. Source is strictly read-only.
 * 3. Destination NEVER calls delete or deleteStack.
 * 4. Fails if source has replacedResources pending cleanup.
 * 5. Fails if destination already has different data unless overwrite is true.
 * 6. Copies stack output as well as resources.
 */
export function copyState(
	source: ReadonlySourceStateService,
	dest: TargetStateService,
	options: {
		stage: string;
		overwrite?: boolean;
	},
): Effect.Effect<
	CopyResult,
	| InvalidStageError
	| EmptySourceStateError
	| ReplacedResourcesPendingError
	| DestinationStateConflictError
	| StateStoreError
> {
	return Effect.gen(function* () {
		const validStage = yield* assertValidStage(options.stage);

		// 1. Check for pending replaced resources in source
		const replaced: ReadonlyArray<ReplacedResourceState> =
			yield* source.getReplacedResources({
				stack: STACK_NAME,
				stage: validStage,
			});
		if (replaced.length > 0) {
			return yield* Effect.fail(
				new ReplacedResourcesPendingError({
					stage: validStage,
					count: replaced.length,
				}),
			);
		}

		// 2. Check destination existing data
		const sourceFqns = yield* source.list({
			stack: STACK_NAME,
			stage: validStage,
		});
		if (sourceFqns.length === 0) {
			return yield* Effect.fail(
				new EmptySourceStateError({
					stage: validStage,
					stack: STACK_NAME,
				}),
			);
		}
		const destFqns = yield* dest.list({ stack: STACK_NAME, stage: validStage });

		if (destFqns.length > 0 && !options.overwrite) {
			// Check if dest is already identical to source
			const verify = yield* verifyStateInternal(
				source,
				dest,
				validStage,
				sourceFqns,
				destFqns,
			);
			if (!verify.matches) {
				return yield* Effect.fail(
					new DestinationStateConflictError({
						stage: validStage,
						destCount: destFqns.length,
						message: `Destination store already contains ${destFqns.length} resource(s) for stage '${validStage}' that differ from source. Use overwrite=true to proceed.`,
					}),
				);
			}
			// Already matches
			return {
				stack: STACK_NAME,
				stage: validStage,
				copiedCount: 0,
				hasOutput: verify.outputMatches,
				outputCopied: false,
			};
		}

		// 3. Copy resources sequentially to avoid write contention
		let copied = 0;
		for (const fqn of sourceFqns) {
			const value = yield* source.get({
				stack: STACK_NAME,
				stage: validStage,
				fqn,
			});
			if (value !== undefined) {
				yield* dest.set({ stack: STACK_NAME, stage: validStage, fqn, value });
				copied++;
			}
		}

		// 4. Copy stack output
		const output = yield* source.getOutput({
			stack: STACK_NAME,
			stage: validStage,
		});
		let outputCopied = false;
		if (output !== undefined) {
			yield* dest.setOutput({
				stack: STACK_NAME,
				stage: validStage,
				value: output,
			});
			outputCopied = true;
		}

		return {
			stack: STACK_NAME,
			stage: validStage,
			copiedCount: copied,
			hasOutput: output !== undefined,
			outputCopied,
		};
	});
}

/**
 * Compares source and destination stores for parity (counts, FQN sets, SHA-256 hashes of contents, outputs).
 * Secret values are never exposed or printed.
 */
export function verifyState(
	source: ReadonlySourceStateService,
	dest: TargetStateService,
	stage: string,
): Effect.Effect<
	VerifyResult,
	InvalidStageError | EmptySourceStateError | StateStoreError
> {
	return Effect.gen(function* () {
		const validStage = yield* assertValidStage(stage);
		const sourceFqns = yield* source.list({
			stack: STACK_NAME,
			stage: validStage,
		});
		if (sourceFqns.length === 0) {
			return yield* Effect.fail(
				new EmptySourceStateError({
					stage: validStage,
					stack: STACK_NAME,
				}),
			);
		}
		const destFqns = yield* dest.list({ stack: STACK_NAME, stage: validStage });
		return yield* verifyStateInternal(
			source,
			dest,
			validStage,
			sourceFqns,
			destFqns,
		);
	});
}

function verifyStateInternal(
	source: ReadonlySourceStateService,
	dest: TargetStateService,
	stage: ValidStage,
	sourceFqns: readonly string[],
	destFqns: readonly string[],
): Effect.Effect<VerifyResult, StateStoreError> {
	return Effect.gen(function* () {
		const destSet = new Set(destFqns);
		const sourceSet = new Set(sourceFqns);

		const missingInDest = sourceFqns.filter((fqn) => !destSet.has(fqn));
		const extraInDest = destFqns.filter((fqn) => !sourceSet.has(fqn));

		const sourceHashes: Record<string, string> = {};
		const contentMismatches: string[] = [];
		let fqnMatched = 0;

		for (const fqn of sourceFqns) {
			const sourceVal = yield* source.get({ stack: STACK_NAME, stage, fqn });
			const sourceHash = hashValue(sourceVal);
			sourceHashes[fqn] = sourceHash;

			if (destSet.has(fqn)) {
				const destVal = yield* dest.get({ stack: STACK_NAME, stage, fqn });
				const destHash = hashValue(destVal);
				if (sourceHash === destHash) {
					fqnMatched++;
				} else {
					contentMismatches.push(fqn);
				}
			}
		}

		const sourceOutput = yield* source.getOutput({ stack: STACK_NAME, stage });
		const destOutput = yield* dest.getOutput({ stack: STACK_NAME, stage });
		const outputMatches = hashValue(sourceOutput) === hashValue(destOutput);

		const matches =
			missingInDest.length === 0 &&
			extraInDest.length === 0 &&
			contentMismatches.length === 0 &&
			outputMatches;

		return {
			stack: STACK_NAME,
			stage,
			matches,
			fqnTotal: sourceFqns.length,
			fqnMatched,
			missingInDest,
			extraInDest,
			contentMismatches,
			outputMatches,
			sourceHashes,
		};
	});
}
