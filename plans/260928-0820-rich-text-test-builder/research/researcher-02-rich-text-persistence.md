# Nghiên cứu: Lưu trữ và render rich text (HTML) trong teacher-os — 2026

**Phạm vi:** hợp đồng zod `.strict()` với `z.string().trim().max(n)`, SQLite/Drizzle trên Cloudflare Workers, React (hiện 100% plain text + `whitespace-pre-line`, không có `dangerouslySetInnerHTML`), các tính năng phụ thuộc plain text (word count, kiểm tra rỗng bằng `.trim()`, tách cue points theo `\n`, preview/print).

## Khuyến nghị chính (xếp hạng)

1. **Lưu chuỗi HTML nguyên trạng** (không JSON editor, không Markdown). Hợp đồng và DB đã là string; render cần HTML; word count lấy được từ trích xuất plain text. Đây là lựa chọn đơn giản và chắc chắn nhất cho app này.
2. **Sanitize ở nơi render, tập trung vào một component dùng chung** (`<RichTextBody>` gọi DOMPurify trong browser). DOMPurify trong browser là đường chạy được hỗ trợ chính thức; jsdom (đường server chính thức của DOMPurify) **không chạy được trên Workers**, còn linkedom + DOMPurify chỉ là pattern cộng đồng chưa được DOMPurify xác nhận. Server giữ vai trò validation (raw cap + plain-text cap bằng zod refine), không chạy sanitizer ở ngày đầu.
3. **Schema zod cho rich text:** `z.string().max(M).refine(plainText(v) <= N)` — giới hạn nghĩa "độ dài nội dung" đo trên plain text đã strip thẻ, đồng thời chặn trần raw để bảo vệ DB/băng thông.
4. **Tương thích ngược:** không backfill. `<RichTextBody>` tự phát hiện: không có thẻ HTML → render như hiện tại (`whitespace-pre-line`, React tự escape); có thẻ → sanitize rồi `dangerouslySetInnerHTML`. Zero rủi ro dữ liệu, một code path render duy nhất.
5. **Chỉ chuyển sang rich text những field thực sự cần định dạng** (prompt, passage, note, description). Giữ transcript và các danh sách tách theo `\n` (cue points) là plain text — đừng ép rich text vào nơi logic đang phụ thuộc `\n`.
6. Defense-in-depth tùy chọn ở giai đoạn sau: sanitize-on-write bằng `linkedom` + DOMPurify trên Workers (chấp nhận rủi ro "không chính thức"), hoặc bắt buộc nếu sau này xuất hiện consumer không phải React (PDF server-side, email).

## 1. Chiến lược sanitize

### Thực trạng các sanitizer trên Cloudflare Workers (2026)

| Phương án | Chạy trên Workers? | Mức hỗ trợ | Ghi chú |
|---|---|---|---|
| DOMPurify + jsdom | Không | Chính thức (Node) | DOMPurify README khuyến nghị jsdom cho server, nhưng jsdom không chạy trong workerd — cộng đồng xác nhận deploy fail ngay cả với `nodejs_compat` (nodejs_compat chỉ cung cấp API Node, không có DOM) |
| DOMPurify + linkedom | Có | Cộng đồng | linkedom có export `linkedom/worker` dành riêng cho deno/Service Workers; nhưng README DOMPurify không liệt kê linkedom (chỉ xác nhận jsdom, và cảnh báo happy-dom & "không an toàn, dễ dẫn tới XSS") |
| `isomorphic-dompurify` | Không | — | Bundle jsdom phía server → fail trên Workers (báo cáo cộng đồng 9/2025) |
| `sanitize-html` | Rủi ro cao | Không thiết kế cho edge | Phụ thuộc htmlparser2/postcss và nội bộ Node; có hồ sơ deploy lỗi trên Cloudflare Pages/Workers |
| Cloudflare `HTMLRewriter` | Có (native) | Chính thức | Là API parse/rewrite streaming, không phải whitelist sanitizer — phải tự viết allowlist; phù hợp để trích xuất text, không phải thay thế DOMPurify |
| DOMPurify trong browser (client) | Có | **Chính thức, đầy đủ** | Đường chạy chuẩn, browser DOM hoàn chỉnh; jsdom trong test cũng được DOMPurify hỗ trợ chính thức |

### Sanitize-on-write vs sanitize-on-render

- OWASP xếp XSS là bài toán **output encoding**: với rich text do người dùng tự soạn, sanitizer là kontrol phía render ("output encoding sẽ phá vỡ chức năng nếu chỉ encode thường, nên dùng HTML sanitizer"). OWASP khuyến nghị DOMPurify và cảnh báo: sửa chuỗi sau khi sanitize là mất trắng hiệu lực bảo vệ, và phải cập nhật DOMPurify thường xuyên.
- Trường phái "escape output, đừng sanitize input" (Ben Hoyt) và quy tắc WordPress VIP ("validate early, escape late, escape everything") đều thống nhất: **ranh giới bảo vệ là ở sink**, vì chỉ ở đó mới biết context render. Sanitize-on-write chỉ là lớp giảm sát thương (stored payload không chờ sink nào thiếu sanitize).
- StackOverflow thread kinh điển về đúng đề tài này kết luận tương tự: lưu dữ liệu sạch nhất có thể, nhưng không bao giờ tin dữ liệu đã lưu — luôn sanitize trước khi render.

**Kết luận xếp hạng cho teacher-os:**

1. **Ngày đầu: sanitize-on-render tập trung.** Một component `<RichTextBody>` là điểm sanitize duy nhất (DRY), chạy DOMPurify trên browser DOM (hỗ trợ chính thức), không thêm dependency mới cho server Workers. Nội dung do giáo viên soạn hiển thị cho học sinh — XSS liên người dùng là mối đe dọa thật, và lớp này chặn được triệt để miễn mọi sink đi qua component.
2. **Giai đoạn sau (defense-in-depth): sanitize-on-write bằng linkedom + DOMPurify** khi có consumer không-React hoặc muốn giảm blast radius. Phải viết smoke test chạy trong miniflare/wrangler dev vì đây là đường không chính thức.
3. **Tránh:** `isomorphic-dompurify` và `sanitize-html` trên Workers.

Pipeline khuyến nghị:

```
Editor (Tiptap) → getHTML() → POST zod contract
  server: max(RAW_M) + refine(plainText ≤ N)  [chỉ validation, không phải security]
  SQLite text column: HTML nguyên trạng
  render: <RichTextBody> → DOMPurify.sanitize → dangerouslySetInnerHTML
```

```ts
// packages/shared/src/rich-text/sanitize.ts  (chạy ở browser + jsdom test)
import DOMPurify from "dompurify";

export const RICH_TEXT_ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "ul", "ol", "li",
  "h2", "h3", "h4", "blockquote", "a", "code", "pre", "hr", "img",
] as const;

const CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [...RICH_TEXT_ALLOWED_TAGS],
  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "title"],
  ALLOW_DATA_ATTR: false,
};

// OWASP: không sửa chuỗi sau khi sanitize — trả nguyên output
export function sanitizeRichText(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}
```

## 2. Định dạng lưu trữ: HTML vs JSON vs Markdown

| Tiêu chí | HTML string | JSON (ProseMirror/Tiptap) | Markdown |
|---|---|---|---|
| Khớp hợp đồng zod hiện tại (string, max) | Tự nhiên | Phải đổi thành JSON string hoặc z.object → phá `.strict()` contracts | OK nhưng cần parser khi render |
| Khớp DB (SQLite text, Drizzle) | Không đổi gì | Không đổi gì | Không đổi gì |
| Render React | Trực tiếp + sanitize | Cần `generateHTML` (dependency nặng, thêm ở client hoặc server) | Cần marked/remark + **vẫn phải sanitize** |
| Word count / plain text | Strip thẻ là xong | Phải duyệt cây JSON hoặc sinh text | Strip cú pháp Markdown (không hoàn hảo) |
| Độ trung thực với editor | Tốt với node chuẩn; custom node có thể mất thuộc tính khi round-trip | Tốt nhất (format gốc) | Thất thoát (màu, style chi tiết) |
| Khả tha (portability) | Cao | Dính schema PM/theo phiên bản editor | Cao |
| Dung lượng | Nhỏ nhất | Lớn nhất | Nhỏ |

Cộng đồng Tiptap cũng chỉ ưu tiên JSON khi cần cấu trúc đầy đủ/thêm cột HTML cache để render nhanh — tức là phát sinh **hai** biểu diễn. Với teacher-os, nhu cầu chỉ là định dạng cơ bản (in đậm/nghiêng/danh sách/heading) và các tính năng phụ thuộc plain text, nên:

**Kết luận: HTML string.** `editor.getHTML()` khi lưu, hợp đồng/DB giữ nguyên shape string. Chỉ cân nhắc lại JSON nếu sau này cần định dạng phức tạp (bảng, ô chứa node tùy biến, comment nội dòng) mà HTML round-trip mất dữ liệu.

## 3. Giới hạn độ dài khi có thẻ HTML

Nguyên tắc: giới hạn "ý nghĩa" (giới hạn nội dung giáo viên nhập) đo trên **plain text đã strip**; giới hạn "vận chuyển" (bảo vệ DB, body size) đo trên **raw HTML** với trần lớn hơn (hệ số 2.5–3x an toàn vì mỗi paragraph chỉ tốn ~30–60 ký tự thẻ). Kiểm tra rỗng `.trim()` cũng phải chạy trên plain text — `"<p></p>"` hiện tại sẽ qua được `z.string().trim().min(1)`.

```ts
// packages/shared/src/rich-text/schema.ts
import { z } from "zod"; // zod ^4.4.3 — .refine() vẫn dùng được

/** Trần raw = plainMax * hệ số cho overhead thẻ + entity */
export function richTextField(plainMax: number, rawMax = Math.ceil(plainMax * 2.5)) {
  return z
    .string()
    .trim()
    .max(rawMax, `Độ dài HTML vượt trần ${rawMax}`)
    .refine((v) => htmlToPlainText(v).length <= plainMax, {
      message: `Nội dung vượt quá ${plainMax} ký tự (không tính định dạng)`,
    })
    .refine((v) => htmlToPlainText(v).trim().length > 0, {
      message: "Nội dung không được để trống",
    });
}

// Thay thế trong contracts.ts — giữ nguyên .strict() của object:
prompt:      richTextField(5000),
passage:     richTextField(20000),
note:        richTextField(2000),
description: richTextField(2000).optional(),
// transcript: GIỮ nguyên z.string().trim().max(10000) — plain text (xem mục 5)
```

Lưu ý: `z.string().max()` đếm theo UTF-16 code units (giống `.length` JS) — hành vi nhất quán với contracts hiện có.

## 4. Trích xuất plain text (word count, kiểm tra rỗng)

Một util dùng chung, dùng DOMParser khi có (browser + jsdom test) và fallback regex khi không có DOM (Workers, cho zod refine). Regex-strip cho mục đích **đếm/giới hạn** là chấp nhận được vì đây không phải kontrol bảo mật; render thì luôn qua DOMParser/DOMPurify.

```ts
// packages/shared/src/rich-text/plain-text.ts
export function htmlToPlainText(html: string): string {
  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return collapseWhitespace(doc.body.textContent ?? "");
  }
  // Fallback không-DOM (Cloudflare Workers / zod refine) — chỉ dùng để đo độ dài
  return collapseWhitespace(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&amp;/gi, "&"),
  );
}

function collapseWhitespace(text: string): string {
  return text.replace(/[ \t]+/g, " ").trim();
}

export function countWords(plainText: string): number {
  return (plainText.match(/\S+/g) ?? []).length; // đủ cho tiếng Anh/IELTS
}

export function isEmptyRichText(html: string): boolean {
  return htmlToPlainText(html).length === 0;
}
```

Thay vì regex tự viết, có thể dùng `HTMLRewriter` của Workers để trích text (API chính thức, streaming, không cần DOM) — nhưng phức tạp hơn (text node đến thành nhiều chunk, phải xử lý `lastInTextNode`) nên không đáng cho nhu cầu đếm ký tự. KISS: regex fallback.

## 5. Tương thích ngược: hàng cũ là plain text có `\n`

**Khuyến nghị: không migrate dữ liệu.** `<RichTextBody>` tự phát hiện hai chế độ:

- Không có thẻ HTML → render đúng như hiện nay: `whitespace-pre-line`, React tự escape, `\n` được tôn trọng. Không đổi gì cho dữ liệu cũ, không mất dữ liệu, không script migration.
- Có thẻ HTML → sanitize + `dangerouslySetInnerHTML`.

Phát hiện HTML nên dùng DOMParser (chính xác) thay vì chỉ regex `/<\/?[a-z][^>]*>/i` — regex heuristic có thể bắt nhỡ văn bản như `"a<b>c"` (dùng DOMParser để xác nhận, regex chỉ làm pre-check nhanh).

```tsx
// packages/shared/src/rich-text/RichTextBody.tsx
import { useMemo } from "react";
import { sanitizeRichText } from "./sanitize";

const TAG_RE = /<\/?[a-z][^>]*>/i;

function looksLikeHtml(s: string): boolean {
  if (!TAG_RE.test(s)) return false;
  const doc = new DOMParser().parseFromString(s, "text/html");
  return doc.body.children.length > 0 || /<(br|img|hr)\b/i.test(s);
}

export function RichTextBody({ text, className }: { text: string; className?: string }) {
  const isHtml = useMemo(() => looksLikeHtml(text), [text]);

  if (isHtml) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: sanitizeRichText(text) }}
      />
    );
  }
  // Legacy plain text: hành vi giữ nguyên hệt hiện trạng
  return <div className={`whitespace-pre-line ${className ?? ""}`}>{text}</div>;
}
```

Phương án thay thế (xếp sau): backfill một lần chuyển `\n` → `<br>`/`<p>` để chỉ còn một code path — chỉ nên làm nếu đo đạc thấy nhánh detect gây khó chịu về mặt bảo trì; rủi ro là script migration chạy sai một lần là hỏng dữ liệu người dùng.

**Điểm cần quyết có chủ đích:** các field đang được tách theo `\n` (cue points từ transcript) **giữ plain text**. Nếu chuyển transcript sang rich text, phải đổi sang trích xuất theo node block (`htmlToPlainText` vẫn giữ `\n` tại ranh giới block nhờ regex ở mục 4 — nhưng tách cue theo dòng trống/đánh số sẽ mong manh hơn). Nguyên tắc: rich text chỉ cho field cần định dạng; tính năng phụ thuộc ký tự điều khiển (`\n`) ở lại plain text.

## 6. Kiểm thử (Vitest jsdom + Playwright)

Vitest với `environment: "jsdom"` là đủ — DOMPurify hỗ trợ jsdom chính thức (README khuyến cáo giữ jsdom mới vì jsdom cũ có lỗi dẫn tới XSS dù DOMPurify đúng).

```ts
// rich-text.test.ts — apps/web, environment: "jsdom"
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

describe("sanitizeRichText", () => {
  it("strip script/handler nhưng giữ định dạng", () => {
    const out = sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script><b>ok</b></p>');
    expect(out).not.toMatch(/<script|onclick/i);
    expect(out).toContain("<b>ok</b>");
  });

  it("round-trip entity không double-encode", () => {
    expect(sanitizeRichText("<p>a &amp; b</p>")).toContain("&amp;");
  });
});

describe("richTextField", () => {
  it("chặn plain text vượt hạn dù giấu trong thẻ", () => {
    expect(richTextField(10).safeParse(`<p>${"a".repeat(11)}</p>`).success).toBe(false);
    expect(richTextField(10).safeParse(`<p>${"a".repeat(10)}</p>`).success).toBe(true);
  });

  it("chặn HTML chỉ toàn thẻ rỗng (emptiness check trên plain text)", () => {
    expect(richTextField(100).safeParse("<p><br></p>").success).toBe(false);
  });
});

describe("RichTextBody", () => {
  it("legacy plain text KHÔNG đi qua innerHTML", () => {
    const { container } = render(<RichTextBody text={"line1\nline2<b>"} />);
    expect(container.querySelector("div")?.innerHTML).not.toContain("<b>"); // escape, không parse
  });

  it("rich text đi qua sanitize", () => {
    const { container } = render(<RichTextBody text="<p>ok</p><img src=x onerror=alert(1)>" />);
    expect(container.querySelector("p")).not.toBeNull();
    expect(container.querySelector("img")?.getAttribute("onerror")).toBeNull();
  });
});
```

Playwright (e2e, kiểm chứng tổng thể incl. chữ ký runtime browser):

```ts
// apps/e2e/specs/rich-text-xss.spec.ts
test("payload XSS lưu trong prompt bị vô hiệu khi render", async ({ page }) => {
  // Setup: tạo assignment với prompt = '<img src=x onerror="window.__pwned=1"><p>safe text</p>'
  await page.goto("/assignments/{id}");
  await expect(page.getByText("safe text")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
});
```

## Rủi ro chấp nhận & hạn chế của nghiên cứu

- **linkedom + DOMPurify trên workerd chưa được xác thực trong repo này**: các nguồn cộng đồng xác nhận khả thi (export `linkedom/worker`), nhưng không phải đường chính thức của DOMPurify; nếu theo phương án sanitize-on-write giai đoạn 2, phải có smoke test trên miniflare/wrangler dev trước khi tin.
- **Điểm chết duy nhất của sanitize-on-render:** sink mới bỏ qua `<RichTextBody>` là mất bảo vệ. Giảm thiểu bằng cách đặt component ở package dùng chung và (tùy chọn) lint rule cấm `dangerouslySetInnerHTML` ngoài file này.
- **DOMPurify cần được nâng cấp định kỳ** (bypass mới được phát hiện thường xuyên — cảnh báo thẳng từ OWASP); phụ thuộc này nên pin ở semver range và đưa vào quy trình renovate/dependabot nếu chưa có.
- Chưa đánh giá: CSP như lớp bổ trợ; word count cho ngôn ngữ không phân tách bằng khoảng trắng; độ trung thực HTML round-trip của Tiptap v3 với custom node; chưa đo kích thước bundle DOMPurify trên client (~20KB gzip).

## Nguồn

- [DOMPurify — GitHub README](https://github.com/cure53/DOMPurify)
- [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [Cloudflare Workers — HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)
- [linkedom — GitHub](https://github.com/WebReflection/linkedom)
- [remix-run/remix discussion #8660 — sanitize-html trên Cloudflare Pages](https://github.com/remix-run/remix/discussions/8660)
- [cure53/DOMPurify issue #577 — chạy trong Web Worker](https://github.com/cure53/DOMPurify/issues/577)
- [StackOverflow #2060923 — Sanitize HTML before storing or rendering](https://stackoverflow.com/questions/2060923/)
- [Ben Hoyt — Don't try to sanitize input. Escape output.](https://benhoyt.com/writings/dont-sanitize-do-escape)
- [WordPress VIP — Validating, sanitizing, and escaping](https://docs.wpvip.com/security/validating-sanitizing-and-escaping)
- [mizu.re — Exploring the DOMPurify library](https://mizu.re/post/exploring-the-dompurify-library-hunting-for-misconfigurations)
- [Tiptap: HTML utility docs](https://tiptap.dev) và [GitHub discussion "The best way to store the data?"](https://github.com/ueberdosis/tiptap)
- [Vitest — Test environment (jsdom)](https://vitest.dev/guide/environment.html), [Playwright docs](https://playwright.dev/docs/intro)
