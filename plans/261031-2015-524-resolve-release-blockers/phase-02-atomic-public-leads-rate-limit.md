---
phase: 2
title: "Sửa check-then-act tại POST /public/leads bằng SQL nguyên tử"
status: completed
priority: P1
effort: "2.5h"
dependencies: []
---

# Phase 2: Sửa check-then-act tại `POST /public/leads` bằng SQL nguyên tử

## Goal

Loại bỏ hoàn toàn lỗ hổng race condition (check-then-act) trong `POST /public/leads` (`apps/server/src/routes/public-leads.ts`) bằng cách đưa toàn bộ điều kiện tần suất IP (`LEAD_IP_MAX`), trần ngày (`LEAD_DAILY_CAP`) và dedupe SĐT 24h (`LEAD_DEDUPE_MAX_SUBMITS`) vào bên trong câu lệnh `INSERT INTO lead ... SELECT ... WHERE ... RETURNING` và `UPDATE lead SET ... WHERE ... RETURNING`, đồng thời bảo toàn `ip_hash` gốc khi dedupe `UPDATE` và không tự chặn `UPDATE` tại biên `LEAD_IP_MAX` / `LEAD_DAILY_CAP`. <!-- Updated: Red Team RT-1 -->

## Files to Create / Modify

- Modify: `apps/server/src/routes/public-leads.ts`
- Modify: `apps/server/src/routes/public-leads.test.ts`

## Tasks & Steps

### Task 2.1 — Viết test TDD (Red) cho các kịch bản bắn request song song (`Promise.all`) và biên dedupe

- **Goal:** Chứng minh bằng test `Promise.all` rằng các request đồng thời không thể vượt giới hạn IP (`LEAD_IP_MAX = 3`), không vượt trần ngày (`LEAD_DAILY_CAP = 100`), không tạo nhiều dòng hay gửi nhiều email khi gửi trùng SĐT cùng lúc, và dedupe `UPDATE` từ IP khác không xóa bucket rate-limit của IP tạo ban đầu. <!-- Updated: Red Team RT-1 -->
- **Target files and symbols:**
  - `apps/server/src/routes/public-leads.test.ts` (`describe("POST /public/leads (#506 phase 2)", ...)`)
- **Steps:**
  1. Thêm test `"request song song cùng IP (10 request đồng thời, SĐT khác nhau) chỉ cho phép đúng LEAD_IP_MAX (3) lead và 3 email (#524)"`:
     - Gọi `await Promise.all(Array.from({ length: 10 }, (_, i) => submit(instance, validBody(\`090910000\${i}\`), { "CF-Connecting-IP": "198.51.100.77" })))`.
     - Assert đúng `LEAD_IP_MAX` (3) response có status `201`, `10 - LEAD_IP_MAX` (7) response có status `429` (`LEAD_RATE_LIMITED`), số dòng trong bảng `lead` là `3`, và `sent` có độ dài `3`.
  2. Thêm test `"request song song cùng SĐT (8 request đồng thời từ các IP khác nhau) chỉ tạo 1 dòng lead, gửi 1 email, tăng submitCount tới LEAD_DEDUPE_MAX_SUBMITS (5) và chặn 3 request còn lại bằng 429 (#524)"`:
     - Gọi `await Promise.all(Array.from({ length: 8 }, (_, i) => submit(instance, validBody("0909888777"), { "CF-Connecting-IP": \`10.20.0.\${i + 1}\` })))`.
     - Assert đúng `LEAD_DEDUPE_MAX_SUBMITS` (5) response có status `201` (với tập `submitCount` là `[1, 2, 3, 4, 5]` sau khi sort), `3` response có status `429` (`LEAD_RATE_LIMITED`), bảng `lead` chỉ có đúng `1` dòng với `submitCount === 5`, và `sent` chỉ có đúng `1` email.
  3. Thêm test `"request song song sát trần ngày (seed 98 dòng, bắn 6 request đồng thời) chỉ nhận thêm đúng 2 dòng và trả 429 LEAD_DAILY_CAP cho 4 request còn lại (#524)"`:
     - Seed `LEAD_DAILY_CAP - 2` (98) dòng trong ngày hôm nay.
     - Bắn 6 request đồng thời từ 6 IP và 6 SĐT khác nhau qua `Promise.all`.
     - Assert đúng 2 response `201`, 4 response `429` với `code === "LEAD_DAILY_CAP"`, tổng số dòng trong DB bằng `LEAD_DAILY_CAP` (100), và `sent` có độ dài `2`.
  4. Thêm test `"dedupe UPDATE từ IP khác không xóa ip_hash của IP tạo ban đầu để lách LEAD_IP_MAX, và lead thứ 3 của cùng IP vẫn tự cập nhật dedupe được (#524)"`: <!-- Updated: Red Team RT-1 -->
     - IP `198.51.100.90` gửi 3 SĐT khác nhau (`0909200001..3`) → cả 3 đều `201`.
     - IP `198.51.100.90` gửi lại SĐT thứ 3 (`0909200003`) → vẫn `201` (`submitCount: 2`, vì chỉ cập nhật dòng của chính nó, không tạo dòng thứ 4).
     - IP khác `198.51.100.91` gửi lại SĐT `0909200001` → `201`, nhưng khi IP `198.51.100.90` thử tạo SĐT thứ 4 (`0909200004`) thì vẫn bị `429 LEAD_RATE_LIMITED` (vì `ip_hash` trên dòng `0909200001` không bị ghi đè).
- **Success criteria:** Các test mới fail trên code check-then-act hiện tại.
- **Verify:** `pnpm --filter server test -- public-leads.test.ts` exits non-zero (Red phase).

### Task 2.2 — Thay thế check-then-act trong `public-leads.ts` bằng câu lệnh `INSERT ... SELECT ... WHERE` và `UPDATE ... WHERE` nguyên tử (Green)

- **Goal:** Mọi kiểm tra giới hạn IP, trần ngày và dedupe SĐT 24h diễn ra nguyên tử trong cùng câu lệnh ghi SQLite/D1.
- **Target files and symbols:**
  - `apps/server/src/routes/public-leads.ts` (hàm `publicLeadRoutes`, handler `router.post("/", ...)`)
- **Steps:**
  1. Băm `ipHash` trước, sau đó mới lấy `const now = Date.now();` và tính các mốc thời gian bằng số nguyên mili-giây khớp cột `timestamp_ms` của SQLite: <!-- Updated: Red Team RT-1 -->
     - `const ipWindowStartMs = now - LEAD_IP_WINDOW_MS;`
     - `const dayStartMs = Date.parse(\`${vietnamTodayISO()}T00:00:00+07:00\`);`
     - `const dedupeWindowStartMs = now - LEAD_DEDUPE_WINDOW_MS;`
  2. Thực thi câu lệnh `INSERT` nguyên tử qua `db.all<{ id: string }>(sql\`...\`)`:
     ```sql
     INSERT INTO lead (
       id, org_id, name, phone, email, birth_date, course, study_mode,
       study_days, time_slot, note, placement, teacher_note, source,
       status, ip_hash, submit_count, created_at, updated_at, status_changed_at
     )
     SELECT
       ${id}, ${leadOrgId}, ${submit.name}, ${submit.phone}, ${submit.email ?? ""},
       ${submit.birthDate ?? ""}, ${submit.course ?? ""}, ${submit.studyMode ?? ""},
       ${submit.studyDays ?? ""}, ${submit.timeSlot ?? ""}, ${submit.note ?? ""},
       ${submit.placement ?? ""}, '', 'profile', 'new', ${ipHash}, 1, ${now}, ${now}, NULL
     WHERE
       (${ipHash.length === 0 ? 1 : 0} = 1 OR (
         SELECT count(*) FROM lead
         WHERE ip_hash = ${ipHash} AND updated_at >= ${ipWindowStartMs}
       ) < ${LEAD_IP_MAX})
       AND (
         SELECT count(*) FROM lead
         WHERE org_id = ${leadOrgId} AND created_at >= ${dayStartMs}
       ) < ${LEAD_DAILY_CAP}
       AND NOT EXISTS (
         SELECT 1 FROM lead
         WHERE org_id = ${leadOrgId}
           AND phone = ${submit.phone}
           AND created_at >= ${dedupeWindowStartMs}
       )
     RETURNING id
     ```
     Nếu `inserted.length > 0`: gửi `notifyNewLead` (chạy nền hoặc await như cũ) và trả `c.json({ id, submitCount: 1 }, 201)`.
  3. Nếu `inserted.length === 0`, thực thi câu lệnh dedupe `UPDATE` nguyên tử qua `db.all<{ id: string; submit_count: number }>(sql\`...\`)` (giữ `ip_hash` gốc của dòng nếu đã có, loại trừ chính dòng đang sửa khỏi đếm IP `id != lead.id`, dùng `max(lead.updated_at, ${now})` cho `updated_at`, và không chặn `UPDATE` bằng `LEAD_DAILY_CAP` vì `UPDATE` không tạo dòng lead mới): <!-- Updated: Red Team RT-1 -->
     ```sql
     UPDATE lead
     SET
       name = CASE WHEN lead.name = '' THEN ${submit.name} ELSE lead.name END,
       email = CASE WHEN lead.email = '' THEN ${submit.email ?? ""} ELSE lead.email END,
       birth_date = ${submit.birthDate ?? ""},
       course = ${submit.course ?? ""},
       study_mode = ${submit.studyMode ?? ""},
       study_days = ${submit.studyDays ?? ""},
       time_slot = ${submit.timeSlot ?? ""},
       note = ${submit.note ?? ""},
       placement = ${submit.placement ?? ""},
       ip_hash = CASE WHEN lead.ip_hash = '' THEN ${ipHash} ELSE lead.ip_hash END,
       submit_count = lead.submit_count + 1,
       updated_at = max(lead.updated_at, ${now})
     WHERE lead.id = (
       SELECT id FROM lead
       WHERE org_id = ${leadOrgId}
         AND phone = ${submit.phone}
         AND created_at >= ${dedupeWindowStartMs}
       ORDER BY created_at DESC, id DESC
       LIMIT 1
     )
       AND lead.submit_count < ${LEAD_DEDUPE_MAX_SUBMITS}
       AND (${ipHash.length === 0 ? 1 : 0} = 1 OR (
         SELECT count(*) FROM lead AS l2
         WHERE l2.ip_hash = ${ipHash}
           AND l2.updated_at >= ${ipWindowStartMs}
           AND l2.id != lead.id
       ) < ${LEAD_IP_MAX})
     RETURNING id, submit_count
     ```
     Nếu `updated.length > 0`: trả `c.json({ id: updated[0].id, submitCount: Number(updated[0].submit_count) }, 201)` (không gửi email).
  4. Nếu cả `INSERT` và `UPDATE` đều trả 0 dòng, thực hiện 1 câu truy vấn phân loại mã lỗi 429: <!-- Updated: Red Team RT-1 -->
     - Kiểm tra xem có dòng dedupe 24h của `(leadOrgId, submit.phone)` hay không và đếm `ipCount` + `dayCount`.
     - Nếu `ipHash.length > 0` và `ipCount >= LEAD_IP_MAX` → trả `429 LEAD_RATE_LIMITED` kèm `Retry-After: 600`.
     - Nếu không phải dedupe (không có dòng 24h cho SĐT này) và `dayCount >= LEAD_DAILY_CAP` → trả `429 LEAD_DAILY_CAP` kèm `Retry-After: 600`.
     - Các trường hợp còn lại (bao gồm `submit_count >= LEAD_DEDUPE_MAX_SUBMITS`) → trả `429 LEAD_RATE_LIMITED` kèm `Retry-After: 600`.
- **Success criteria:** Toàn bộ test cũ và 4 test mới trong `public-leads.test.ts` đều pass.
- **Verify:** `pnpm --filter server test -- public-leads.test.ts` exits 0.

## Failure Protocol
If any Verify step does not meet its stated pass condition, STOP this phase.
Do not improvise a fix, retry blindly, or reason around the failure.
Spawn the `kongming` subagent for next-step counsel and pass:
- the phase and task id,
- what you attempted (the steps you ran),
- the exact command and its full output,
- the pass condition it failed to meet.
Apply kongming's guidance, then re-run the Verify step.
If `kongming` cannot be spawned in this environment, STOP and report the same
failure evidence to the user. Never continue by self-reasoning.
