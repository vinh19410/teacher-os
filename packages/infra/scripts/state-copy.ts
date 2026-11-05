import * as Alchemist from "alchemy/Alchemist";
import * as Effect from "effect/Effect";
import {
	ALLOWED_STAGES,
	copyState,
	countState,
	isValidStage,
	STACK_NAME,
	type ValidStage,
	verifyState,
} from "../src/state-copy.ts";

function parseArgs(args: string[]): {
	mode: "count" | "copy" | "verify";
	stage: ValidStage;
	sourceName: string;
	destName: string;
	overwrite: boolean;
} {
	let mode: "count" | "copy" | "verify" = "count";
	let stage: ValidStage | undefined;
	let sourceName = "alchemy-state-store";
	let destName = "teacher-os-state";
	let overwrite = false;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--mode" && i + 1 < args.length) {
			const m = args[++i];
			if (m === "count" || m === "copy" || m === "verify") {
				mode = m;
			} else {
				throw new Error(
					`Invalid --mode '${m}'. Expected: count, copy, verify.`,
				);
			}
		} else if (arg === "--stage" && i + 1 < args.length) {
			const s = args[++i];
			if (s && isValidStage(s)) {
				stage = s;
			} else {
				throw new Error(
					`Invalid --stage '${s}'. Expected one of: ${ALLOWED_STAGES.join(", ")}.`,
				);
			}
		} else if (arg === "--source-name" && i + 1 < args.length) {
			const s = args[++i];
			if (s) sourceName = s;
		} else if (arg === "--dest-name" && i + 1 < args.length) {
			const s = args[++i];
			if (s) destName = s;
		} else if (arg === "--overwrite") {
			overwrite = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(`
Usage: pnpm run state:copy [options]

Options:
  --mode <count|copy|verify>  Operation mode (default: count)
  --stage <staging|prod>      Target stage (REQUIRED)
  --source-name <name>        Source Cloudflare state store Worker name (default: alchemy-state-store)
  --dest-name <name>          Destination Cloudflare state store Worker name (default: teacher-os-state)
  --overwrite                 Allow overwriting existing different state in destination
  --help, -h                  Show this help message
`);
			process.exit(0);
		}
	}

	if (!stage) {
		throw new Error(
			`Missing required argument --stage <staging|prod>. Allowed values: ${ALLOWED_STAGES.join(", ")}.`,
		);
	}

	return { mode, stage, sourceName, destName, overwrite };
}

const main = Effect.gen(function* () {
	if (process.env.CI !== "true") {
		console.error(
			"[state-copy] Refusing to run outside CI (CI=true required) to prevent unintended local state provisioning.",
		);
		process.exit(1);
	}

	const { mode, stage, sourceName, destName, overwrite } = parseArgs(
		process.argv.slice(2),
	);

	console.log(`[state-copy] Mode: ${mode}`);
	console.log(`[state-copy] Stack: ${STACK_NAME} | Stage: ${stage}`);
	console.log(`[state-copy] Source store: ${sourceName}`);
	console.log(`[state-copy] Destination store: ${destName}`);

	const source = yield* Alchemist.State.store({
		type: "provider",
		backend: "cloudflare",
		name: sourceName,
	});

	if (mode === "count") {
		let destInitError: string | undefined;
		const dest = yield* Alchemist.State.store({
			type: "provider",
			backend: "cloudflare",
			name: destName,
		}).pipe(
			Effect.catchIf(
				() => true,
				(err: unknown) => {
					if (err && typeof err === "object" && "message" in err) {
						destInitError = String(err.message);
					} else {
						destInitError = String(err);
					}
					return Effect.succeed(undefined);
				},
			),
		);

		const count = yield* countState(source, dest, stage);
		console.log(`\n--- Count Summary (${stage}) ---`);
		console.log(`Source count:      ${count.sourceCount} resource(s)`);
		if (dest !== undefined) {
			console.log(`Destination count: ${count.destCount ?? 0} resource(s)`);
		} else {
			console.log(
				`Destination count: not bootstrapped / unavailable (${destInitError ?? "store not found"})`,
			);
		}
		if (count.sourceFqns.length > 0) {
			console.log("Source FQNs:");
			for (const fqn of count.sourceFqns) {
				console.log(`  - ${fqn}`);
			}
		}
		return;
	}

	// For copy and verify, destination MUST be non-null and valid
	const destStore = yield* Alchemist.State.store({
		type: "provider",
		backend: "cloudflare",
		name: destName,
	});

	if (mode === "copy") {
		console.log(`\nStarting safe copy... (overwrite=${overwrite})`);
		const copyResult = yield* copyState(source, destStore, {
			stage,
			overwrite,
		});
		console.log(`\n--- Copy Summary (${stage}) ---`);
		console.log(`Copied resources:  ${copyResult.copiedCount}`);
		console.log(`Has output:        ${copyResult.hasOutput}`);
		console.log(`Output copied:     ${copyResult.outputCopied}`);
		console.log(
			"\nIMPORTANT: Run with --mode verify to ensure SHA-256 parity.",
		);
		return;
	}

	// Mode is verify
	console.log("\nVerifying state parity between stores...");
	const verifyResult = yield* verifyState(source, destStore, stage);
	console.log(`\n--- Parity Verification (${stage}) ---`);
	console.log(`Source FQNs:       ${verifyResult.fqnTotal}`);
	console.log(`Matched FQNs:      ${verifyResult.fqnMatched}`);
	console.log(
		`Output matches:    ${verifyResult.outputMatches ? "YES" : "NO"}`,
	);
	console.log(
		`Overall Parity:    ${verifyResult.matches ? "MATCHED (OK)" : "MISMATCH (FAILED)"}`,
	);

	if (!verifyResult.matches) {
		if (verifyResult.missingInDest.length > 0) {
			console.error("\nMissing in destination:", verifyResult.missingInDest);
		}
		if (verifyResult.extraInDest.length > 0) {
			console.error("\nExtra in destination:", verifyResult.extraInDest);
		}
		if (verifyResult.contentMismatches.length > 0) {
			console.error(
				"\nContent hash mismatches:",
				verifyResult.contentMismatches,
			);
		}
		if (!verifyResult.outputMatches) {
			console.error(
				"\nStack output mismatch: destination stack output does not match source.",
			);
		}
		return yield* Effect.fail(
			new Error(
				"State parity verification failed: source and destination stores do not match.",
			),
		);
	}
});
Effect.runPromise(
	main.pipe(Effect.scoped, Effect.provide(Alchemist.layer())),
).catch((err: unknown) => {
	const tag =
		err && typeof err === "object" && "_tag" in err
			? String(err._tag)
			: err instanceof Error
				? err.name
				: "Error";
	const message =
		err && typeof err === "object" && "message" in err
			? String(err.message)
			: String(err);
	console.error(`\n[state-copy] Fatal error [${tag}]: ${message}`);
	process.exit(1);
});
