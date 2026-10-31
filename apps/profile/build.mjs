import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { replaceLeadApiMeta } from "./serve.mjs";

const defaultPublicUrl = new URL("./public", import.meta.url);
const defaultDistUrl = new URL("./dist", import.meta.url);
const defaultQuestionsUrl = new URL(
	"./public/kiem-tra-dau-vao/questions.json",
	import.meta.url,
);

export function resolveBuildChannel(env = process.env) {
	if (
		env.APP_DOMAIN?.trim() === "teacheros.io.vn" ||
		env.LEAD_API_URL?.trim() === "https://api.teacheros.io.vn"
	) {
		return "production";
	}
	const explicit = env.PROFILE_CHANNEL?.trim();
	if (explicit) return explicit;
	const baseRef = env.GITHUB_BASE_REF?.trim();
	const refName = env.GITHUB_REF_NAME?.trim();
	if (baseRef === "main" || refName === "main") return "production";
	if (baseRef === "develop" || (!baseRef && refName === "develop")) {
		return "beta";
	}
	return "production";
}

export async function assertPlacementContentApproved(
	questionsUrl = defaultQuestionsUrl,
	{ channel = resolveBuildChannel() } = {},
) {
	const raw = await readFile(questionsUrl, "utf8");
	const parsed = JSON.parse(raw);
	const status = parsed?.status;
	const allowed =
		channel === "beta"
			? status === "approved" || status === "beta"
			: status === "approved";
	if (!allowed) {
		throw new Error(
			`[profile build] Không thể build phát hành (channel=${channel}): questions.json đang ở trạng thái "${status ?? "unknown"}". Nội dung bài kiểm tra đầu vào phải được cô Mỹ duyệt và đổi status thành "approved" trước khi build production.`,
		);
	}
	if (channel === "beta" && status === "beta") {
		console.warn(
			'[profile build] Cảnh báo (channel=beta): questions.json đang ở trạng thái "beta" (chưa được cô Mỹ duyệt "approved"). Bản build này chỉ phục vụ kiểm thử beta/develop, không dùng cho production.',
		);
	}
	return parsed;
}

export async function buildProfile({
	publicUrl = defaultPublicUrl,
	distUrl = defaultDistUrl,
	questionsUrl = defaultQuestionsUrl,
	leadApiUrl = process.env.LEAD_API_URL?.trim(),
	channel = resolveBuildChannel(),
} = {}) {
	await assertPlacementContentApproved(questionsUrl, { channel });
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
