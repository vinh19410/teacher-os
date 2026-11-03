import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { replaceLeadApiMeta } from "./serve.mjs";

const defaultPublicUrl = new URL("./public", import.meta.url);
const defaultDistUrl = new URL("./dist", import.meta.url);
export async function buildProfile({
	publicUrl = defaultPublicUrl,
	distUrl = defaultDistUrl,
	leadApiUrl = process.env.LEAD_API_URL?.trim(),
} = {}) {
	await rm(distUrl, { recursive: true, force: true });
	await cp(publicUrl, distUrl, {
		recursive: true,
	});

	if (leadApiUrl) {
		const distBaseHref = `${distUrl.href.replace(/\/?$/, "/")}`;
		for (const relHtml of ["./index.html", "./kiem-tra-dau-vao/index.html"]) {
			const targetUrl = new URL(relHtml, distBaseHref);
			const html = await readFile(targetUrl, "utf8");
			await writeFile(targetUrl, replaceLeadApiMeta(html, leadApiUrl), "utf8");
		}
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await buildProfile();
}
