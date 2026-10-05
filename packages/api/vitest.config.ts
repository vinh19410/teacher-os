import { defineConfig } from "vitest/config";

// `tsc -b` copy *.test.ts vào dist/ — giới hạn include vào src để không
// chạy bộ test hai lần (src + dist).
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
