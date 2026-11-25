import { defineConfig } from "vitest/config";

const isCi =
	Boolean(process.env.CI) &&
	process.env.CI !== "0" &&
	process.env.CI !== "false";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		// Giới hạn worker tránh tranh chấp CPU/libuv khi nhiều worker chạy đồng thời
		// 93 migration SQL + scrypt (CI chạy 2 vCPU với turbo --concurrency=2).
		maxWorkers: isCi ? 2 : 3,
		testTimeout: 15_000,
		hookTimeout: 15_000,
	},
});
