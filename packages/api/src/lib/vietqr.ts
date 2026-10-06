/**
 * VietQR static image URL builder (#320, SePay fact sheet "QR"):
 * https://vietqr.app/img?acc=&bank=&amount=&des=&template=compact
 * VietinBank (bin 970415) personal accounts require the memo to contain
 * `SEVQR` — Bank Hub adds it to QRs it mints; we mint our own, so we add it.
 */
export const VIETINBANK_BIN = "970415";

export function buildTransferMemo(input: {
	code: string;
	bankBin: string;
}): string {
	return input.bankBin === VIETINBANK_BIN ? `SEVQR ${input.code}` : input.code;
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
