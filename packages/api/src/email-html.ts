export const DEFAULT_BRAND_NAME = "Cô Mỹ Dạy Tiếng Anh";
export const EMAIL_FONT_STACK =
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

export function escapeEmailHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function hasControlChars(value: string): boolean {
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

export function sanitizeSingleLine(value: string): string {
	let out = "";
	for (let i = 0; i < value.length; i += 1) {
		const code = value.charCodeAt(i);
		if (code === 0) continue;
		if (code === 0x0a || code === 0x0d) {
			out += " ";
			continue;
		}
		if (code <= 0x1f || code === 0x7f) continue;
		out += value[i];
	}
	return out.replace(/\s+/g, " ").trim();
}

export function isSafeEmailUrl(url: string): boolean {
	const trimmed = url.trim();
	if (!trimmed || hasControlChars(trimmed) || /\s/.test(trimmed)) return false;

	if (trimmed.startsWith("/")) {
		return !trimmed.startsWith("//") && !trimmed.startsWith("/\\");
	}

	if (!/^https?:\/\//i.test(trimmed)) return false;

	try {
		const parsed = new URL(trimmed);
		return (
			(parsed.protocol === "https:" || parsed.protocol === "http:") &&
			parsed.hostname.length > 0
		);
	} catch {
		return false;
	}
}

export function resolveEmailBrandAndGreeting(input: {
	brandName?: string;
	orgName?: string;
	studentName?: string;
}): {
	brandName: string;
	orgName: string;
	showOrgName: boolean;
	greeting: string;
	footerBrand: string;
} {
	const brandName =
		sanitizeSingleLine(input.brandName ?? "") || DEFAULT_BRAND_NAME;
	const orgName = sanitizeSingleLine(input.orgName ?? "");
	const showOrgName =
		orgName.length > 0 && orgName.toLowerCase() !== brandName.toLowerCase();
	const studentName = sanitizeSingleLine(input.studentName ?? "");
	return {
		brandName,
		orgName,
		showOrgName,
		greeting: studentName ? `Chào ${studentName},` : "Chào bạn,",
		footerBrand: showOrgName ? `${orgName} · ${brandName}` : brandName,
	};
}

export function renderEmailDetailTable(
	rows: ReadonlyArray<[string, string]>,
): string {
	const rowsHtml = rows
		.map(([label, value], index) => {
			const isLast = index === rows.length - 1;
			const borderCss = isLast ? "" : "border-bottom:1px solid #e5e5e5;";
			const borderClass = isLast ? "" : " border-row";
			return (
				"<tr>" +
				`<td class="text-muted${borderClass}" style="padding:11px 16px;${borderCss}font-size:13px;line-height:20px;color:#525252;vertical-align:top;width:44%;">${escapeEmailHtml(label)}</td>` +
				`<td class="text-main${borderClass}" style="padding:11px 16px;${borderCss}font-size:14px;line-height:20px;font-weight:600;color:#171717;text-align:right;vertical-align:top;">${escapeEmailHtml(value)}</td>` +
				"</tr>"
			);
		})
		.join("");

	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-surface" style="margin:0 0 22px 0;background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;border-collapse:separate;overflow:hidden;">${rowsHtml}</table>`;
}

export function renderEmailPrimaryCta(url: string, label: string): string {
	const escapedUrl = escapeEmailHtml(url);
	return (
		`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">` +
		"<tr>" +
		`<td class="cta-cell" bgcolor="#171717" style="border-radius:8px;background-color:#171717;">` +
		`<a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="cta-btn" style="display:inline-block;padding:12px 24px;font-family:${EMAIL_FONT_STACK};font-size:14px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#171717;">${escapeEmailHtml(label)}</a>` +
		"</td>" +
		"</tr>" +
		"</table>" +
		`<p class="text-muted" style="margin:0 0 6px 0;font-size:12px;line-height:18px;color:#737373;">Nếu nút không hoạt động, hãy sao chép và mở đường dẫn sau:</p>` +
		`<p style="margin:0 0 8px 0;font-size:12px;line-height:18px;word-break:break-all;"><a href="${escapedUrl}" target="_blank" rel="noopener noreferrer" class="link-accent" style="color:#171717;text-decoration:underline;">${escapedUrl}</a></p>`
	);
}

const DARK_MODE_RULES = [
	".bg-body { background-color: #0a0a0a !important; }",
	".bg-card { background-color: #171717 !important; border-color: #262626 !important; }",
	".bg-surface { background-color: #202020 !important; border-color: #333333 !important; }",
	".bg-callout { background-color: #202020 !important; border-color: #333333 !important; border-left-color: #e5e5e5 !important; }",
	".bg-session-notice { background-color: #064e3b !important; border-color: #047857 !important; border-left-color: #34d399 !important; }",
	".border-row { border-bottom-color: #333333 !important; }",
	".border-sep { border-top-color: #262626 !important; }",
	".text-main { color: #fafafa !important; }",
	".text-body { color: #d4d4d4 !important; }",
	".text-muted { color: #a3a3a3 !important; }",
	".text-session-notice-title { color: #d1fae5 !important; }",
	".text-session-notice-body { color: #fafafa !important; }",
	".badge-initial { background-color: #064e3b !important; border-color: #047857 !important; color: #d1fae5 !important; }",
	".badge-update { background-color: #451a03 !important; border-color: #b45309 !important; color: #fef3c7 !important; }",
	".cta-cell { background-color: #fafafa !important; }",
	".cta-btn { background-color: #fafafa !important; color: #171717 !important; }",
	".link-accent { color: #fafafa !important; }",
] as const;

export function renderBrandedEmailShell(params: {
	subject: string;
	preheader: string;
	brandName: string;
	orgName: string;
	showOrgName: boolean;
	badgeLabel: string;
	badgeVariant?: "initial" | "update";
	heading: string;
	greeting: string;
	intro: string;
	bodySectionsHtml: string;
	footerLead: string;
	footerSupport: string;
}): string {
	const isUpdate = params.badgeVariant === "update";
	const badgeClass = isUpdate ? "badge-update" : "badge-initial";
	const badgeInlineStyle = isUpdate
		? "background-color:#fffbeb;border:1px solid #fde68a;color:#92400e;"
		: "background-color:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;";
	const badgeDotColor = isUpdate ? "#d97706" : "#059669";

	const headerOrgHtml = params.showOrgName
		? `<div class="text-muted" style="margin:3px 0 0 0;font-size:12px;line-height:18px;color:#737373;">${escapeEmailHtml(params.orgName)}</div>`
		: "";
	const preheaderFiller = "&#847; &zwnj;&nbsp;&#8199;&shy; ".repeat(14);
	const mediaDarkCss = DARK_MODE_RULES.map((rule) => `  ${rule}`).join("\n");
	const ogscDarkCss = DARK_MODE_RULES.map((rule) => `[data-ogsc] ${rule}`).join(
		"\n",
	);

	return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeEmailHtml(params.subject)}</title>
<style>
@media (prefers-color-scheme: dark) {
${mediaDarkCss}
}
${ogscDarkCss}
</style>
</head>
<body class="bg-body" style="margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f5f5f5;font-family:${EMAIL_FONT_STACK};">
<div style="display:none;max-height:0px;overflow:hidden;font-size:1px;line-height:1px;color:#f5f5f5;opacity:0;">${escapeEmailHtml(params.preheader)}${preheaderFiller}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-body" style="background-color:#f5f5f5;width:100%;margin:0;padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg-card" style="max-width:580px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;font-family:${EMAIL_FONT_STACK};text-align:left;border-collapse:separate;overflow:hidden;">
        <tr>
          <td style="padding:28px 28px 20px 28px;">
            <div class="text-main" style="font-size:15px;line-height:22px;font-weight:700;letter-spacing:-0.01em;color:#171717;">${escapeEmailHtml(params.brandName)}</div>
            ${headerOrgHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:0 28px 24px 28px;">
            <div style="margin:0 0 14px 0;">
              <span class="${badgeClass}" style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;line-height:18px;font-weight:600;${badgeInlineStyle}"><span style="display:inline-block;width:6px;height:6px;border-radius:999px;background-color:${badgeDotColor};margin-right:6px;vertical-align:middle;"></span>${escapeEmailHtml(params.badgeLabel)}</span>
            </div>
            <h1 class="text-main" style="margin:0 0 14px 0;font-size:22px;line-height:30px;font-weight:700;letter-spacing:-0.02em;color:#171717;">${escapeEmailHtml(params.heading)}</h1>
            <p class="text-main" style="margin:0 0 10px 0;font-size:15px;line-height:24px;font-weight:500;color:#171717;">${escapeEmailHtml(params.greeting)}</p>
            <p class="text-body" style="margin:0 0 22px 0;font-size:14px;line-height:22px;color:#404040;">${escapeEmailHtml(params.intro)}</p>
            ${params.bodySectionsHtml}
          </td>
        </tr>
        <tr>
          <td class="border-sep" style="padding:20px 28px 26px 28px;border-top:1px solid #e5e5e5;">
            <p class="text-body" style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#404040;">${escapeEmailHtml(params.footerLead)}</p>
            <p class="text-muted" style="margin:0;font-size:12px;line-height:18px;color:#737373;">${escapeEmailHtml(params.footerSupport)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
