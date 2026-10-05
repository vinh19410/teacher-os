/**
 * Đếm từ theo quy ước IELTS (#304): trim rồi tách theo whitespace. Từ có
 * gạch nối (`well-known`) và số (`1960`) đều tính là 1 từ. Dùng chung cho
 * footer làm bài phía student và teacher preview —single source of truth,
 * trước đây web giữ bản copy riêng dễ lệch số đếm.
 */
export function countWords(text: string): number {
	const value = text.trim();
	return value ? value.split(/\s+/u).length : 0;
}
