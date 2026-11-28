/**
 * VietQR static image URL builder (#320, SePay QR & TKP memo-based VA):
 * https://vietqr.app/img?acc=&bank=&amount=&des=&template=compact
 * - VietinBank (bin 970415) personal accounts require `SEVQR` in transfer memo.
 * - Standard SePay memo-based Virtual Accounts (TKP) route to the source bank
 *   account (`acc`) with `TKP<vaCode>` (e.g. `TKPMMY`) before the payment code.
 */
export const VIETINBANK_BIN = "970415";

export function normalizeVaCode(raw: string): string {
	return raw
		.trim()
		.replace(/[\s-]+/g, "")
		.toUpperCase();
}

export function formatTkpVaPrefix(vaCode?: string): string {
	const normalized = normalizeVaCode(vaCode ?? "");
	if (!normalized) return "";
	return normalized.startsWith("TKP") && normalized.length > 3
		? normalized
		: `TKP${normalized}`;
}

export function vaCodeCandidates(vaCode: string): string[] {
	const normalized = normalizeVaCode(vaCode);
	if (!normalized) return [];
	const withTkp = formatTkpVaPrefix(normalized);
	const withoutTkp =
		normalized.startsWith("TKP") && normalized.length > 3
			? normalized.slice(3)
			: normalized;
	return Array.from(new Set([normalized, withTkp, withoutTkp])).map((s) =>
		s.toLowerCase(),
	);
}

export function matchesTkpVa(input: {
	vaCode: string;
	subAccount?: string;
	content?: string;
}): boolean {
	const candidates = vaCodeCandidates(input.vaCode);
	if (candidates.length === 0) return true;
	const sub = normalizeVaCode(input.subAccount ?? "").toLowerCase();
	if (sub) return candidates.includes(sub);
	const prefix = formatTkpVaPrefix(input.vaCode);
	if (!prefix) return true;
	const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const contentRe = new RegExp(
		`(?:^|[^A-Z0-9])${escaped}(?=$|[^A-Z0-9]|MSMY|TOS)`,
		"i",
	);
	return contentRe.test(input.content ?? "");
}

export function buildTransferMemo(input: {
	code: string;
	bankBin: string;
	vaCode?: string;
}): string {
	return [
		input.bankBin === VIETINBANK_BIN ? "SEVQR" : "",
		formatTkpVaPrefix(input.vaCode),
		input.code,
	]
		.filter(Boolean)
		.join(" ");
}

export function buildVietQrUrl(input: {
	bin: string;
	accountNumber: string;
	amount: number;
	memo: string;
}): string {
	const params = new URLSearchParams({
		acc: input.accountNumber,
		bank: input.bin,
		amount: String(Math.floor(input.amount)),
		des: input.memo,
		template: "compact",
	});
	return `https://vietqr.app/img?${params.toString()}`;
}
