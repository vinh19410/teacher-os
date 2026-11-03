/**
 * Parse header `Range: bytes=start-end` cho route audio công khai (#515 D9),
 * chuyển từ `apps/profile/serve.mjs` sang TypeScript để Safari iOS phát được
 * `<audio>` qua HTTP 206 Partial Content.
 *
 * Trả `{ start, end }` (inclusive, 0-based) khi hợp lệ, hoặc `null` khi cú
 * pháp sai / ngoài biên `totalLength` (route trả 416 `Content-Range: bytes *\/total`).
 */
export function parseByteRange(
	rangeHeader: string,
	totalLength: number,
): { start: number; end: number } | null {
	if (!Number.isInteger(totalLength) || totalLength <= 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
	if (!match) return null;
	const [, startStr = "", endStr = ""] = match;
	if (startStr === "" && endStr === "") return null;

	let start: number;
	let end: number;
	if (startStr === "") {
		const suffixLength = Number(endStr);
		if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
		start = Math.max(0, totalLength - suffixLength);
		end = totalLength - 1;
	} else {
		start = Number(startStr);
		end = endStr === "" ? totalLength - 1 : Number(endStr);
	}

	if (
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		start >= totalLength ||
		start > end
	) {
		return null;
	}

	return { start, end: Math.min(end, totalLength - 1) };
}
