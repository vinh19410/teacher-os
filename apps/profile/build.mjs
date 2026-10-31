import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { replaceLeadApiMeta } from "./serve.mjs";

const defaultPublicUrl = new URL("./public", import.meta.url);
const defaultDistUrl = new URL("./dist", import.meta.url);
const defaultQuestionsUrl = new URL(
	"./public/kiem-tra-dau-vao/questions.json",
	import.meta.url,
);

export async function assertPlacementContentApproved(
	questionsUrl = defaultQuestionsUrl,
) {
	const raw = await readFile(questionsUrl, "utf8");
	const parsed = JSON.parse(raw);
	if (parsed?.status !== "approved") {
		throw new Error(
			`[profile build] Không thể build phát hành: questions.json đang ở trạng thái "${parsed?.status ?? "unknown"}". Nội dung bài kiểm tra đầu vào phải được cô Mỹ duyệt và đổi status thành "approved" trước khi build.`,
		);
	}
	return parsed;
}

export async function buildProfile({
	publicUrl = defaultPublicUrl,
	distUrl = defaultDistUrl,
	questionsUrl = defaultQuestionsUrl,
	leadApiUrl = process.env.LEAD_API_URL?.trim(),
} = {}) {
	await assertPlacementContentApproved(questionsUrl);
	await rm(distUrl, { recursive: true, force: true });
	await cp(publicUrl, distUrl, {
		recursive: true,
	});

	if (leadApiUrl) {
		const distIndex = new URL(
			"./index.html",
			`${distUrl.href.replace(/\/?$/, "/")}`,
		);
		const html = await readFile(distIndex, "utf8");
		await writeFile(distIndex, replaceLeadApiMeta(html, leadApiUrl), "utf8");
	}
}

if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await buildProfile();
}
