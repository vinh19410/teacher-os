import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { replaceLeadApiMeta } from "./serve.mjs";

const distUrl = new URL("./dist", import.meta.url);
await rm(distUrl, { recursive: true, force: true });
await cp(new URL("./public", import.meta.url), distUrl, {
	recursive: true,
});

const leadApiUrl = process.env.LEAD_API_URL?.trim();
if (leadApiUrl) {
	const distIndex = new URL("./dist/index.html", import.meta.url);
	const html = await readFile(distIndex, "utf8");
	await writeFile(distIndex, replaceLeadApiMeta(html, leadApiUrl), "utf8");
}
