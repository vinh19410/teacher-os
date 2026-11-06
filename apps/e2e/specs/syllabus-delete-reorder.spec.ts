import { expect, type Page, test } from "@playwright/test";
import { signUpViaApi } from "./helpers";
import { API_ORIGIN, WEB_ORIGIN } from "./origins";

const API = API_ORIGIN;
const ORIGIN = WEB_ORIGIN;

async function apiPost(
	page: Page,
	path: string,
	data: unknown,
	expected = 201,
): Promise<{ id?: string }> {
	const response = await page.request.post(`${API}${path}`, {
		data,
		headers: {
			Origin: ORIGIN,
			"Content-Type": "application/json",
		},
	});
	expect(response.status(), await response.text()).toBe(expected);
	return (await response.json()) as { id?: string };
}

test("syllabus editor: mũi tên đổi thứ tự module rồi xóa module", async ({
	page,
}) => {
	const name = `E2E Reorder ${Date.now()}`;
	await signUpViaApi(page);

	const syllabus = await apiPost(page, "/api/syllabus-templates", {
		name,
		type: "ielts",
		level: "Band 7.0",
		skills: ["Writing"],
		description: "",
		totalLessons: 0,
	});
	const syllabusId = syllabus.id ?? "";
	expect(syllabusId).not.toBe("");

	const moduleA = await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules`,
		{
			title: "Module Alpha",
			description: "",
		},
	);
	const moduleB = await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules`,
		{
			title: "Module Beta",
			description: "",
		},
	);
	const a = moduleA.id ?? "";
	const b = moduleB.id ?? "";
	await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules/${a}/lessons`,
		{
			title: "A1",
			objectives: "",
			materials: "",
			status: "upcoming",
		},
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules/${a}/lessons`,
		{
			title: "A2",
			objectives: "",
			materials: "",
			status: "upcoming",
		},
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules/${b}/lessons`,
		{
			title: "B1",
			objectives: "",
			materials: "",
			status: "upcoming",
		},
	);
	await apiPost(
		page,
		`/api/syllabus-templates/${syllabusId}/modules/${b}/lessons`,
		{
			title: "B2",
			objectives: "",
			materials: "",
			status: "upcoming",
		},
	);

	await page.reload();
	await page.getByText("Syllabus", { exact: true }).first().click();
	await expect(page).toHaveURL(/\/syllabus$/);
	await page.getByText(name).click();
	await expect(page).toHaveURL(new RegExp(`/syllabus/${syllabusId}`));

	const headings = page.locator("h3");
	await expect(headings.nth(0)).toHaveText("Module Alpha");
	await expect(headings.nth(1)).toHaveText("Module Beta");

	await page.getByRole("button", { name: "Đưa Module Alpha xuống" }).click();
	await expect(page.getByText("Đã đổi thứ tự module.")).toBeVisible();
	await expect(headings.nth(0)).toHaveText("Module Beta");
	await expect(headings.nth(1)).toHaveText("Module Alpha");

	await page.getByRole("button", { name: "Xóa Module Beta" }).click();
	await page.getByRole("button", { name: "Xóa", exact: true }).click();
	await expect(page.getByText("Đã xóa module.")).toBeVisible();
	await expect(page.getByRole("heading", { name: "Module Beta" })).toHaveCount(
		0,
	);
	await expect(page.getByRole("heading", { name: "Module Alpha" })).toHaveCount(
		1,
	);
});
