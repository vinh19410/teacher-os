import { BRAND_NAME } from "./brand";

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function otpEmailTemplate(input: { otp: string }): {
	html: string;
	text: string;
} {
	const escapedOtp = escapeHtml(input.otp);
	const preheaderFiller = "&#847; &zwnj;&nbsp;&#8199;&shy; ".repeat(15);

	const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Mã xác thực đăng nhập của bạn</title>
<style>
@media (prefers-color-scheme: dark) {
  .bg-body { background-color: #0f172a !important; }
  .bg-card { background-color: #1e293b !important; border-color: #334155 !important; }
  .text-main { color: #f1f5f9 !important; }
  .text-muted { color: #94a3b8 !important; }
  .otp-box { background-color: #0f172a !important; border-color: #475569 !important; color: #f8fafc !important; }
}
[data-ogsc] .bg-body { background-color: #0f172a !important; }
[data-ogsc] .bg-card { background-color: #1e293b !important; }
[data-ogsc] .text-main { color: #f1f5f9 !important; }
[data-ogsc] .text-muted { color: #94a3b8 !important; }
</style>
</head>
<body style="margin:0; padding:0; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; background-color:#f1f5f9;">
<div style="display:none; max-height:0px; overflow:hidden; font-size:1px; line-height:1px; color:#fff; opacity:0;">
Mã đăng nhập ${BRAND_NAME} của bạn là ${escapedOtp}. Mã có hiệu lực trong 5 phút.${preheaderFiller}
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
            <h1 class="text-main" style="margin:0 0 16px 0; font-size:24px; line-height:32px; font-weight:700; color:#0f172a;">Mã xác thực đăng nhập</h1>
            <p class="text-main" style="margin:0 0 20px 0; font-size:16px; line-height:24px; color:#334155;">
              Sử dụng mã xác thực bên dưới để đăng nhập vào cổng học viên ${BRAND_NAME} của bạn:
            </p>
            <div class="otp-box" style="margin:0 0 24px 0; padding:16px 24px; background-color:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; text-align:center;">
              <span style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace; font-size:32px; font-weight:700; letter-spacing:6px; color:#4f46e5;">${escapedOtp}</span>
            </div>
            <p class="text-muted" style="margin:0 0 8px 0; font-size:14px; line-height:20px; color:#64748b;">
              Mã xác thực có hiệu lực trong <strong>5 phút</strong>. Vì lý do bảo mật, tuyệt đối không chia sẻ mã này cho bất kỳ ai.
            </p>
            <p class="text-muted" style="margin:0; font-size:14px; line-height:20px; color:#64748b;">
              Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px; border-top:1px solid #e2e8f0;">
            <p class="text-muted" style="margin:0 0 8px 0; font-size:12px; line-height:18px; color:#94a3b8;">
              Email này được gửi tự động từ cổng học viên ${BRAND_NAME}.
            </p>
            <p class="text-muted" style="margin:0; font-size:12px; line-height:18px; color:#94a3b8;">
              &copy; 2026 ${BRAND_NAME}. Mọi quyền được bảo lưu.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

	const text = `Mã xác thực đăng nhập ${BRAND_NAME} của bạn là: ${input.otp}\n\nMã có hiệu lực trong 5 phút. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.\n\nNếu bạn không yêu cầu mã này, vui lòng bỏ qua email.`;

	return { html, text };
}
