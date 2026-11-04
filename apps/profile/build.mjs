import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { replaceLeadApiMeta, replaceStudentPortalHref } from "./serve.mjs";

const defaultPublicUrl = new URL("./public", import.meta.url);
const defaultDistUrl = new URL("./dist", import.meta.url);
export async function buildProfile({
	publicUrl = defaultPublicUrl,
	distUrl = defaultDistUrl,
	leadApiUrl = process.env.LEAD_API_URL?.trim(),
	studentPortalUrl = process.env.STUDENT_PORTAL_URL?.trim(),
} = {}) {
	await rm(distUrl, { recursive: true, force: true });
	await cp(publicUrl, distUrl, {
		recursive: true,
	});

	const distBaseHref = `${distUrl.href.replace(/\/?$/, "/")}`;
	if (leadApiUrl) {
		for (const relHtml of ["./index.html", "./kiem-tra-dau-vao/index.html"]) {
			const targetUrl = new URL(relHtml, distBaseHref);
			const html = await readFile(targetUrl, "utf8");
			await writeFile(targetUrl, replaceLeadApiMeta(html, leadApiUrl), "utf8");
		}
	}

	if (studentPortalUrl) {
		const homeUrl = new URL("./index.html", distBaseHref);
		const html = await readFile(homeUrl, "utf8");
		await writeFile(
			homeUrl,
			replaceStudentPortalHref(html, studentPortalUrl),
			"utf8",
		);
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await buildProfile();
}
