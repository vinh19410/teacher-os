import { defineConfig } from "vitest/config";

// `tsc -b` copy *.test.ts vào dist/ — giới hạn include vào src để không
// chạy bộ test hai lần (src + dist); dist/src/migrations không có .sql
// nên test chạy từ dist sẽ đỏ (pattern giống packages/api).
export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
	},
});
