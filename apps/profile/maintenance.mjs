import { readFileSync } from "node:fs";

const maintenanceJsonUrl = new URL("./maintenance.json", import.meta.url);

export const MAINTENANCE_HTML_PATHS = [
	"./index.html",
	"./kiem-tra-dau-vao/index.html",
	"./kiem-tra-dau-vao/ket-qua/index.html",
	"./noi-bo/index.html",
];

export const MAINTENANCE_HEADERS_FILE = [
	"/*",
	"  Cache-Control: no-cache, no-store, must-revalidate",
	"  X-Robots-Tag: noindex, nofollow",
	"  X-Content-Type-Options: nosniff",
	"",
].join("\n");

/** Read the single-line toggle from apps/profile/maintenance.json. */
export function readProfileDisabledFlag() {
	const parsed = JSON.parse(readFileSync(maintenanceJsonUrl, "utf8"));
	return Boolean(parsed?.disabled);
}

/** Resolve whether profile maintenance mode is active, honoring PROFILE_MAINTENANCE env override. */
export function isProfileMaintenanceEnabled(
	override = process.env.PROFILE_MAINTENANCE,
) {
	const normalized = String(override ?? "")
		.trim()
		.toLowerCase();
	if (normalized === "") return readProfileDisabledFlag();
	if (normalized === "false" || normalized === "0") return false;
	if (normalized === "true" || normalized === "1") return true;
	throw new Error(
		`Invalid PROFILE_MAINTENANCE value "${override}" (expected true, 1, false, or 0)`,
	);
}

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Trang web đang trong quá trình phát triển</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      min-height: 100svh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #fbfaf7;
      color: #1b2a3a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    main {
      width: min(100%, 520px);
      background: #ffffff;
      border: 1px solid #d9dde1;
      border-radius: 16px;
      padding: clamp(28px, 5vw, 44px);
      text-align: center;
      box-shadow: 0 1px 2px rgba(27, 42, 58, 0.04), 0 8px 24px rgba(27, 42, 58, 0.06);
    }
    .status-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #f5a73b;
      margin-bottom: 18px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: clamp(1.375rem, 1.15rem + 1vw, 1.75rem);
      line-height: 1.3;
      font-weight: 700;
      letter-spacing: -0.015em;
    }
    p {
      margin: 0;
      color: #57616b;
      font-size: 1rem;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <span class="status-dot" aria-hidden="true"></span>
    <h1>Trang web đang trong quá trình phát triển</h1>
    <p>Hệ thống đang được cập nhật và hoàn thiện. Vui lòng quay lại sau.</p>
  </main>
</body>
</html>
`;

export function renderMaintenanceHtml() {
	return MAINTENANCE_HTML;
}
