import { configDefaults, defineConfig } from "vitest/config";

const isCi =
	Boolean(process.env.CI) &&
	process.env.CI !== "0" &&
	process.env.CI !== "false";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		maxWorkers: isCi ? 2 : undefined,
		exclude:
			process.env.VITEST_SKIP_SLOW === "1"
				? [
						...configDefaults.exclude,
						"src/lib/payments/ledger-invariants.test.ts",
					]
				: configDefaults.exclude,
	},
});
