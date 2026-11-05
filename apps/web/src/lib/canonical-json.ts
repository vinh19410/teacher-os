/**
 * Canonical JSON cho so sánh cấu trúc (questions/optionBank) giữa payload,
 * baseline và kernel snapshot (#630): thứ tự key không ảnh hưởng (snapshot
 * đọc từ DB giữ thứ tự key của lần ghi — writer khác zod có thể khác schema
 * order) và key mang giá trị undefined bị bỏ (zod `.optional()` đi kèm
 * undefined). Dùng chung bởi composer `new.tsx` và test builder.
 */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value))
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.filter(([, item]) => item !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
		return `{${entries
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value ?? null);
}
