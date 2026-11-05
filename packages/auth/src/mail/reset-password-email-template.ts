import { BRAND_NAME } from "./brand";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function resetPasswordEmailTemplate(input: { url: string }): {
	html: string;
	text: string;
} {
	const escapedUrl = escapeHtml(input.url);
	const preheaderFiller = "&#847; &zwnj;&nbsp;&#8199;&shy; ".repeat(15);

	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Đặt lại mật khẩu ${BRAND_NAME}</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg-body { background-color: #0f172a !important; }
  .bg-card { background-color: #1e293b !important; border-color: #334155 !important; }
  .text-main { color: #f1f5f9 !important; }
  .text-muted { color: #94a3b8 !important; }
}
[data-ogsc] .bg-body { background-color: #0f172a !important; }
[data-ogsc] .bg-card { background-color: #1e293b !important; }
[data-ogsc] .text-main { color: #f1f5f9 !important; }
[data-ogsc] .text-muted { color: #94a3b8 !important; }
</style>
</head>
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#f1f5f9;">
<div style="display:none; max-height:0px; overflow:hidden; font-size:1px; line-height:1px; color:#fff; opacity:0;">
Nhấn nút bên dưới để đặt lại mật khẩu ${BRAND_NAME}. Liên kết có hiệu lực trong 1 giờ.${preheaderFiller}
</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="bg-body" style="background-color:#f1f5f9; width:100%; margin:0; padding:24px 0;">
  <tr>
    <td align="center" style="padding:0 16px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="bg-card" style="max-width:600px; background-color:#ffffff; border-radius:12px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; text-align:left; border:1px solid #e2e8f0; overflow:hidden;">
        <tr>
          <td style="padding:32px 32px 16px 32px;">
            <div style="font-size:20px; font-weight:700; color:#4f46e5; letter-spacing:-0.5px;">${BRAND_NAME}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px 32px;">
            <h1 class="text-main" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#0f172a;">Đặt lại mật khẩu của bạn</h1>
            <p class="text-main" style="margin:0 0 16px 0; font-size:16px; line-height:24px; color:#334155;">
              Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ${BRAND_NAME} của bạn. Nhấn nút bên dưới để chọn mật khẩu mới.
            </p>
            <p class="text-muted" style="margin:0 0 24px 0; font-size:14px; line-height:20px; color:#64748b;">
              Liên kết có hiệu lực trong 1 giờ. Nếu bạn không yêu cầu đặt lại mật khẩu, bạn có thể bỏ qua email này, mật khẩu hiện tại vẫn giữ nguyên.
            </p>
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
              <tr>
                <td bgcolor="#4f46e5" style="border-radius:8px;">
                  <a href="${escapedUrl}" style="display:inline-block; padding:14px 32px; font-size:16px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px; background-color:#4f46e5;">Đặt lại mật khẩu</a>
                </td>
              </tr>
            </table>
            <p class="text-muted" style="margin:0 0 8px 0; font-size:13px; line-height:20px; color:#64748b;">
              Nếu nút trên không hoạt động, hãy sao chép và dán liên kết sau vào trình duyệt:
            </p>
            <p style="margin:0; font-size:13px; line-height:20px; word-break:break-all;">
              <a href="${escapedUrl}" class="text-main" style="color:#4f46e5; text-decoration:underline;">${escapedUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px; border-top:1px solid #e2e8f0;">
            <p class="text-muted" style="margin:0 0 8px 0; font-size:12px; line-height:18px; color:#94a3b8;">
              Bạn nhận được email này vì có người yêu cầu đặt lại mật khẩu cho địa chỉ email của bạn trên ${BRAND_NAME}.
            </p>
            <p class="text-muted" style="margin:0; font-size:12px; line-height:18px; color:#94a3b8;">
              &copy; 2022 ${BRAND_NAME}. Mọi quyền được bảo lưu.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

	const text = `Xin chào,\n\nChúng tôi nhận được yêu cầu đặt lại mật khẩu ${BRAND_NAME} của bạn. Đặt mật khẩu mới tại liên kết sau (hiệu lực 1 giờ):\n\n${input.url}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này, mật khẩu hiện tại vẫn giữ nguyên.`;

	return { html, text };
}
