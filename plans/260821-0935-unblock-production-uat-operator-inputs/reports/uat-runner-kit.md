# UAT runner kit — phase-06 re-run (r2)

Checklist cho người chạy browser leg của phase-06 UAT (procedure authority:
[phase-06-execute-live-uat-and-record-release-evidence.md](../../260819-2034-production-readiness/phase-06-execute-live-uat-and-record-release-evidence.md) — nếu kit này mâu thuẫn với phase-06, theo phase-06).

Chạy **độc lập cho từng browser**: incognito Chrome **và** incognito Safari. Thiếu evidence của browser nào → NO-GO (không bao giờ Chrome-only).

## Trước khi mở browser

- Agent đã hoàn thành post-deploy probes (`/readyz` 200 `{"ok":true}` + `cache-control: no-store`, `GET /` → `OK`, CORS probe với `Origin: https://app.<domain>`) — browser chỉ mở trên stage xanh.
- URL gốc: `https://app.<APP_DOMAIN>` (hostname không bao giờ ghi vào evidence — dùng dạng redacted `<domain>`).
- Tài khoản: Google UAT account chuyên dụng (out of band). Không dùng tài khoản cá nhân.
- Chuẩn bị cửa sổ: incognito/private window mới hoàn toàn của browser được phân công.

## Các bước (ghi kết quả từng bước vào template dưới đây)

1. **Sign-in:** mở `https://app.<APP_DOMAIN>` → sign in with Google → chọn UAT account → phải land về app với callback được consume tại `/api/auth/callback/google` (không lỗi `redirect_uri_mismatch`, không kẹt ở provider).
2. **Cookie attributes:** DevTools → Application → Cookies → session cookie phải có `Domain=.<APP_DOMAIN>`, `SameSite=None; Secure; HttpOnly`. Cookie host-only (thiếu dot-domain) trong khi topology đang set → **NO-GO**, ghi lại và dừng.
3. **Bootstrap org:** lần đầu vào workspace → bootstrap organization.
4. **Syllabus + class:** tạo syllabus tên `fixture-<something>` → tạo class tên `fixture-<something>` → vào class-detail → **Add Student** với tên `fixture-*` (tạo enrollment/package) → student xuất hiện trong roster.
5. **Hard reload:** reload toàn trang (Cmd+Shift+R) → dữ liệu còn nguyên.
6. **Sign-out → sign-in lại:** session hết → sign in lại bằng cùng UAT account → dữ liệu còn nguyên.

## Fault path (chạy 1 lần, Chrome hoặc Safari — DevTools required)

1. Trước khi fetch snapshot đầu: DevTools → Network → Request blocking → thêm rule chặn `/api/kernel`.
2. Hard reload với rule đang bật → phải thấy **blocking load error** hiển thị (không phải workspace trống).
3. Gỡ rule → retry/reload → workspace load bình thường.
4. Xác nhận server luôn up: `GET /` → `OK`.

## Negative-origin matrix (agent chạy bằng curl — runner không phải chạy; ghi để đối chiếu)

| Method | Endpoint | Session | Origin | Expected |
|---|---|---|---|---|
| POST | `/api/classes` | none | absent | `403` |
| POST | `/api/classes` | none | correct | `401` |
| POST | `/api/auth/sign-out` | valid | foreign | `403` |
| POST | `/api/auth/sign-up/email` | none | correct | verdict + risk note (hoặc skip có ghi lý do — không bao giờ identity thật) |

## Evidence template (sanitize allowlist của phase-06)

Ghi cho **từng browser leg** — chỉ các trường sau, không gì khác:

```
## Browser leg: <chrome|safari> incognito
- Runner: <tên người chạy>
- Timestamp: <iso>
- App origin: https://app.<domain>          (redacted)
- Commit SHA: <sha>
- Step 1 sign-in: pass|fail + ghi chú ngắn
- Step 2 cookie attributes: pass|fail (Domain=.<domain>, SameSite=None; Secure; HttpOnly)
- Step 3 bootstrap: pass|fail
- Step 4 syllabus/class/Add Student/roster: pass|fail (roster proof = row count, không screenshot)
- Step 5 hard reload: pass|fail
- Step 6 sign-out/sign-in: pass|fail
```

**Không bao giờ ghi:** hostname thật, OAuth `code`/`state`, cookie values, database IDs, secret, student PII, raw `wrangler tail`, raw `curl -i` của endpoint đã xác thực. Toàn bộ dữ liệu UAT là `fixture-*`.
