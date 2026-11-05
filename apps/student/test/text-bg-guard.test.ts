import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Regression guard: no text-bg utility in apps/student/src (#586)", () => {
	it("apps/student/src does not contain text-bg class", () => {
		const srcDir = path.resolve(__dirname, "../src");
		const violations: string[] = [];

		const scanDir = (dir: string) => {
			const entries = fs.readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = path.join(dir, entry.name);
				if (entry.isDirectory()) {
					scanDir(fullPath);
				} else if (
					/\.(tsx?|jsx?|css)$/.test(entry.name) &&
					!/\.(test|spec)\.[^.]+$/.test(entry.name)
				) {
					const content = fs.readFileSync(fullPath, "utf-8");
					const lines = content.split("\n");
					for (let i = 0; i < lines.length; i++) {
						if (/(?<![\w-])text-bg(?![\w-])/.test(lines[i])) {
							const relPath = path.relative(srcDir, fullPath);
							violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
						}
					}
				}
			}
		};

		scanDir(srcDir);
		expect(violations).toEqual([]);
	});
});
