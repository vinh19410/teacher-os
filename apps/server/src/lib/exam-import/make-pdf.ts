/**
 * Sinh PDF tối thiểu HỢP LỆ cho test (unit + e2e) — đúng xref/trailer để
 * pdf.js (unpdf phía server, pdfjs-dist phía web) parse được: kiểm số trang
 * và mật khẩu của TOS-27 cần file thật, bytes giả "%%%%" không còn qua nổi
 * inspect. Không commit file lớn: file >15 MB test tự phình bằng byte đệm.
 */
export function buildExamPdf(pageCount: number): ArrayBuffer {
	const parts: string[] = [];
	const offsets: (number | undefined)[] = [];
	let position = 0;
	const push = (text: string) => {
		parts.push(text);
		position += text.length;
	};
	const addObject = (num: number, body: string) => {
		offsets[num] = position;
		push(`${num} 0 obj\n${body}\nendobj\n`);
	};

	push("%PDF-1.4\n");
	addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
	const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(
		" ",
	);
	addObject(2, `<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>`);
	for (let i = 0; i < pageCount; i++) {
		addObject(3 + i, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>");
	}

	const xrefStart = position;
	const size = 2 + pageCount;
	let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
	for (let num = 1; num < size; num++) {
		xref += `${String(offsets[num] ?? 0).padStart(10, "0")} 00000 n \n`;
	}
	push(xref);
	push(
		`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`,
	);

	const text = parts.join("");
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
	return bytes.buffer;
}
