/**
 * TOS-25 (#471): SHA-256 hex của tệp trên client — tính trước khi upload để
 * gọi `GET /api/exam-imports/lookup` mà không phải gửi lại tệp lớn.
 *
 * `crypto.subtle` chỉ tồn tại ở secure context (HTTPS/localhost): vắng mặt
 * hoặc đọc file lỗi → throw có kiểu, caller (màn Nhập đề AI) **fail-open** —
 * upload thẳng như TOS-24. Dedupe là best-effort; lớp bảo đảm 0 Credit nằm
 * ở nhánh POST phía server (plan D1/D3).
 */
export async function sha256Hex(file: File): Promise<string> {
	if (typeof crypto === "undefined" || !crypto.subtle) {
		throw new Error(
			"WebCrypto unavailable — dedupe lookup bỏ qua (non-secure context)",
		);
	}
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await file.arrayBuffer(),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
