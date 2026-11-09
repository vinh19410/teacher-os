import type { MaterialFolderView } from "@teacher-os/api/material-contracts";
import { describe, expect, it } from "vitest";
import {
	flattenFolderTree,
	folderPath,
	folderSubtreeIds,
} from "./material-folders";

function folder(
	id: string,
	name: string,
	parentId: string | null = null,
): MaterialFolderView {
	return { id, name, parentId, createdAt: "2026-11-01T00:00:00.000Z" };
}

const FOLDERS = [
	folder("w", "Writing"),
	folder("r", "Reading"),
	folder("w2", "Task 2", "w"),
	folder("w1", "Task 1", "w"),
	folder("w1a", "Biểu đồ", "w1"),
];

describe("flattenFolderTree", () => {
	it("orders parents before children and siblings by name, with depth", () => {
		expect(
			flattenFolderTree(FOLDERS).map((r) => [r.folder.id, r.depth]),
		).toEqual([
			["r", 0],
			["w", 0],
			["w1", 1],
			["w1a", 2],
			["w2", 1],
		]);
	});

	it("keeps folders whose parent is missing as roots and survives cycles", () => {
		const rows = flattenFolderTree([
			folder("a", "A", "ghost"),
			folder("x", "X", "y"),
			folder("y", "Y", "x"),
		]);
		expect(rows.map((r) => r.folder.id)).toEqual(["a"]);
	});
});

describe("folderSubtreeIds", () => {
	it("returns the folder and every descendant", () => {
		expect([...folderSubtreeIds(FOLDERS, "w")].sort()).toEqual([
			"w",
			"w1",
			"w1a",
			"w2",
		]);
		expect([...folderSubtreeIds(FOLDERS, "r")]).toEqual(["r"]);
	});
});

describe("folderPath", () => {
	it("joins ancestor names and returns null for root or unknown ids", () => {
		expect(folderPath(FOLDERS, "w1a")).toBe("Writing / Task 1 / Biểu đồ");
		expect(folderPath(FOLDERS, null)).toBeNull();
		expect(folderPath(FOLDERS, "nope")).toBeNull();
	});
});
