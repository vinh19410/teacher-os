/**
 * `{{var}}` substitution for the teacher's Zalo reminder templates. The
 * settings store keeps free-text templates; phase 5's "Sao chép tin nhắc
 * nợ" fills them with the new public pay link via `{{qr_link}}`.
 */
export function fillMessageTemplate(
	tpl: string,
	vars: Record<string, string>,
): string {
	return tpl.replace(
		/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g,
		(raw: string, key: string) => vars[key] ?? raw,
	);
}
