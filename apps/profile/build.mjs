import { cp, readFile, rm, writeFile } from "node:fs/promises";

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });
await cp(
	new URL("./public", import.meta.url),
	new URL("./dist", import.meta.url),
	{
		recursive: true,
	},
);

// Deploy API khác mặc định prod? Thay content meta lead-api trong dist (#506):
// LEAD_API_URL=https://api.teacheros.io.vn pnpm --filter profile build
const leadApiUrl = process.env.LEAD_API_URL;
if (leadApiUrl) {
	const indexUrl = new URL("./dist/index.html", import.meta.url);
	const html = await readFile(indexUrl, "utf8");
	await writeFile(
		indexUrl,
		// Replacement dạng function để ký tự `$` trong env không bị hiểu
		// là replacement pattern của String.replace.
		html.replace(
			/(<meta\s+name="lead-api"\s+content=")[^"]*(")/,
			(_match, before, after) => `${before}${leadApiUrl}${after}`,
		),
	);
}
