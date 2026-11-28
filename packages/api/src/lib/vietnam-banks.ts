export interface VietnamBank {
	bin: string;
	code: string;
	shortName: string;
	name: string;
	note?: string;
}

/**
 * Danh mục ngân hàng Việt Nam hỗ trợ VietQR / SePay (theo vietqr.app/banks.json).
 */
export const VIETNAM_BANKS: readonly VietnamBank[] = [
	{
		bin: "970436",
		code: "VCB",
		shortName: "Vietcombank",
		name: "Ngân hàng TMCP Ngoại thương Việt Nam",
	},
	{
		bin: "970422",
		code: "MB",
		shortName: "MBBank",
		name: "Ngân hàng TMCP Quân đội",
	},
	{
		bin: "970415",
		code: "ICB",
		shortName: "VietinBank",
		name: "Ngân hàng TMCP Công thương Việt Nam",
		note: "Tài khoản cá nhân/hộ KD VietinBank cần tiền tố SEVQR — hệ thống tự thêm vào mã QR.",
	},
	{
		bin: "970416",
		code: "ACB",
		shortName: "ACB",
		name: "Ngân hàng TMCP Á Châu",
	},
	{
		bin: "970407",
		code: "TCB",
		shortName: "Techcombank",
		name: "Ngân hàng TMCP Kỹ thương Việt Nam",
	},
	{
		bin: "970418",
		code: "BIDV",
		shortName: "BIDV",
		name: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
		note: "Tài khoản cá nhân/hộ KD BIDV cần nhập số tài khoản ảo (VA) tạo trên SePay.",
	},
	{
		bin: "970432",
		code: "VPB",
		shortName: "VPBank",
		name: "Ngân hàng TMCP Việt Nam Thịnh Vượng",
	},
	{
		bin: "970423",
		code: "TPB",
		shortName: "TPBank",
		name: "Ngân hàng TMCP Tiên Phong",
	},
	{
		bin: "970403",
		code: "STB",
		shortName: "Sacombank",
		name: "Ngân hàng TMCP Sài Gòn Thương Tín",
	},
	{
		bin: "970448",
		code: "OCB",
		shortName: "OCB",
		name: "Ngân hàng TMCP Phương Đông",
		note: "OCB bắt buộc nhập số tài khoản ảo (VA) tạo trên SePay.",
	},
	{
		bin: "970426",
		code: "MSB",
		shortName: "MSB",
		name: "Ngân hàng TMCP Hàng Hải",
		note: "MSB bắt buộc nhập số tài khoản ảo (VA) tạo trên SePay.",
	},
	{
		bin: "970452",
		code: "KLB",
		shortName: "KienLongBank",
		name: "Ngân hàng TMCP Kiên Long",
		note: "KienLongBank bắt buộc nhập số tài khoản ảo (VA) tạo trên SePay.",
	},
	{
		bin: "970441",
		code: "VIB",
		shortName: "VIB",
		name: "Ngân hàng TMCP Quốc tế Việt Nam",
	},
	{
		bin: "970437",
		code: "HDB",
		shortName: "HDBank",
		name: "Ngân hàng TMCP Phát triển TP.HCM",
	},
	{
		bin: "970443",
		code: "SHB",
		shortName: "SHB",
		name: "Ngân hàng TMCP Sài Gòn - Hà Nội",
	},
	{
		bin: "970431",
		code: "EIB",
		shortName: "Eximbank",
		name: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam",
	},
	{
		bin: "970440",
		code: "SEAB",
		shortName: "SeABank",
		name: "Ngân hàng TMCP Đông Nam Á",
	},
	{
		bin: "970449",
		code: "LPB",
		shortName: "LPBank",
		name: "Ngân hàng TMCP Lộc Phát Việt Nam",
	},
	{
		bin: "546034",
		code: "CAKE",
		shortName: "CAKE",
		name: "Ngân hàng số CAKE by VPBank",
	},
	{
		bin: "963388",
		code: "TIMO",
		shortName: "Timo",
		name: "Ngân hàng số Timo by BVBank",
	},
	{
		bin: "970405",
		code: "VBA",
		shortName: "Agribank",
		name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam",
	},
	{
		bin: "970428",
		code: "NAB",
		shortName: "NamABank",
		name: "Ngân hàng TMCP Nam Á",
	},
	{
		bin: "970425",
		code: "ABB",
		shortName: "ABBANK",
		name: "Ngân hàng TMCP An Bình",
	},
	{
		bin: "970424",
		code: "SHBVN",
		shortName: "ShinhanBank",
		name: "Ngân hàng TNHH MTV Shinhan Việt Nam",
	},
	{
		bin: "970457",
		code: "WVN",
		shortName: "Woori",
		name: "Ngân hàng TNHH MTV Woori Việt Nam",
	},
];

export function findVietnamBankByBin(bin: string): VietnamBank | undefined {
	const normalized = bin.trim();
	return VIETNAM_BANKS.find((bank) => bank.bin === normalized);
}

export function normalizeBankAccountNumber(raw: string): string {
	return raw.trim().replace(/[\s-]+/g, "");
}
