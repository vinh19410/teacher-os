const CANONICAL_VOCAB_BASE = "/practice/vocabulary";

/**
 * Chuyển URL legacy `/vocab` hoặc `/vocab/<rest>` sang path canonical
 * `/practice/vocabulary/*`, giữ nguyên phần đuôi đã chuẩn hoá và query string.
 * Luôn trả về path nội bộ bắt đầu bằng `/practice/vocabulary` (chống `//` open-redirect).
 */
export function legacyVocabHref(pathname: string, searchStr = ""): string {
	const qIndex = pathname.indexOf("?");
	const rawPath = qIndex >= 0 ? pathname.slice(0, qIndex) : pathname;
	const inlineSearch = qIndex >= 0 ? pathname.slice(qIndex) : "";
	const effectiveSearch = searchStr.length > 0 ? searchStr : inlineSearch;

	let tail = "";
	if (rawPath.startsWith("/vocab/")) {
		const rawTail = rawPath.slice("/vocab/".length);
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
