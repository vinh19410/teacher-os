import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
	isProfileMaintenanceEnabled,
	MAINTENANCE_HEADERS_FILE,
	MAINTENANCE_HTML_PATHS,
	renderMaintenanceHtml,
} from "./maintenance.mjs";
import { replaceLeadApiMeta, replaceStudentPortalHref } from "./serve.mjs";

const defaultPublicUrl = new URL("./public", import.meta.url);
const defaultDistUrl = new URL("./dist", import.meta.url);
export async function buildProfile({
	publicUrl = defaultPublicUrl,
	distUrl = defaultDistUrl,
	leadApiUrl = process.env.LEAD_API_URL?.trim(),
	studentPortalUrl = process.env.STUDENT_PORTAL_URL?.trim(),
	maintenance = isProfileMaintenanceEnabled(),
} = {}) {
	await rm(distUrl, { recursive: true, force: true });
	const distBaseHref = `${distUrl.href.replace(/\/?$/, "/")}`;

	if (maintenance) {
		const maintenanceHtml = renderMaintenanceHtml();
		for (const relHtml of MAINTENANCE_HTML_PATHS) {
			const targetUrl = new URL(relHtml, distBaseHref);
			await mkdir(new URL("./", targetUrl), { recursive: true });
			await writeFile(targetUrl, maintenanceHtml, "utf8");
		}
		await writeFile(
			new URL("./_headers", distBaseHref),
			MAINTENANCE_HEADERS_FILE,
			"utf8",
		);
		return;
	}

	await cp(publicUrl, distUrl, {
		recursive: true,
	});
	if (leadApiUrl) {
		for (const relHtml of [
			"./index.html",
			"./kiem-tra-dau-vao/index.html",
			"./kiem-tra-dau-vao/ket-qua/index.html",
		]) {
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
