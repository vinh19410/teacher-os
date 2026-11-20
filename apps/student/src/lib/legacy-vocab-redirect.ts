const CANONICAL_VOCAB_BASE = "/student/practice/vocabulary";

/**
 * Chuyển URL legacy `/vocab` hoặc `/vocab/<rest>` (kể cả khi mang tiền tố
 * `/student`) sang path canonical `/student/practice/vocabulary/*`, giữ nguyên
 * phần đuôi đã chuẩn hoá và query string. Luôn trả về path nội bộ bắt đầu bằng
 * `/student/practice/vocabulary` (chống `//` open-redirect và thoát subpath).
 */
export function legacyVocabHref(pathname: string, searchStr = ""): string {
	const qIndex = pathname.indexOf("?");
	const rawPath = qIndex >= 0 ? pathname.slice(0, qIndex) : pathname;
	const normalizedPath = rawPath.replace(/^\/student(?=\/|$)/, "") || "/";
	const inlineSearch = qIndex >= 0 ? pathname.slice(qIndex) : "";
	const effectiveSearch = searchStr.length > 0 ? searchStr : inlineSearch;

	let tail = "";
	if (normalizedPath.startsWith("/vocab/")) {
		const rawTail = normalizedPath.slice("/vocab/".length);
		const normalized = rawTail
			.replace(/\\/g, "/")
			.replace(/\/+/g, "/")
			.replace(/^\/+|\/+$/g, "");
		if (normalized.length > 0) {
			tail = `/${normalized}`;
		}
	}

	const validSearch =
		effectiveSearch.startsWith("?") && effectiveSearch.length > 1
			? effectiveSearch
			: "";

	return `${CANONICAL_VOCAB_BASE}${tail}${validSearch}`;
}
