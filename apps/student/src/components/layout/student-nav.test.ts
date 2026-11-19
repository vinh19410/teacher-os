import { describe, expect, it } from "vitest";
import {
	ACTIVE_KEY_BY_PREFIX,
	STUDENT_NAV,
	STUDENT_PAGE_LABEL,
} from "./student-nav";

describe("student-nav placement test entry removal", () => {
	it("excludes placement-test from STUDENT_NAV items and children", () => {
		const allItems = STUDENT_NAV.flatMap((group) => group.items);
		const allKeys = allItems.flatMap((item) => [
			item.key,
			...(item.children?.map((child) => child.key) ?? []),
		]);
		const allHrefs = allItems.flatMap((item) => [
			item.href,
			...(item.children?.map((child) => child.href) ?? []),
		]);

		expect(allKeys).not.toContain("placement-test");
		expect(allHrefs).not.toContain("/placement-test");
	});

	it("keeps /placement-test active key and header breadcrumb label", () => {
		expect(ACTIVE_KEY_BY_PREFIX["/placement-test"]).toBe("placement-test");
		expect(STUDENT_PAGE_LABEL["placement-test"]).toBe("Kiểm tra đầu vào");
	});
});
