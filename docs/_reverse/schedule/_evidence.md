# _evidence.md — Bằng chứng kỹ thuật (feature `schedule`)

Repo `/root/projects/teacher-os` @ develop `d6c0f6b5`. Cột "Nguồn" luôn là `path:line` đầy đủ.

## §1 Endpoints & điểm gắn (chỉ dùng cho cột Nguồn của SRS, không phát tán thành tài liệu API)

| # | Endpoint | Method | Hành vi | Nguồn |
|---|----------|--------|---------|-------|
| 1 | `/api/events` | POST | Tạo sự kiện: yêu cầu `kernelCtx` (401 nếu thiếu), parse JSON (400 `invalid json`), kiểm `orgEventDraftSchema` (400 `invalid body`), insert với id mới + orgId/userId từ phiên, trả 201 + dòng đầy đủ; 500 `insert failed` nếu không có dòng trả về | `apps/server/src/routes/events.ts:34-63` |
| 2 | `/api/events/:id` | DELETE | Xóa sự kiện: yêu cầu `kernelCtx`; thiếu id → 404 `not found`; điều kiện xóa bắt buộc cả `id` lẫn `orgId` của phiên; không xóa dòng nào → 404; thành công → `{ ok: true }` | `apps/server/src/routes/events.ts:65-78` |
| 3 | (đọc) `events` trong `GET /api/kernel` | GET | Snapshot tải mảng sự kiện của org, sắp theo (date, startTime, id), gắn vào `KernelSnapshot.events` | `apps/server/src/routes/snapshot.ts:96-116,263,440,732` |
| 4 | Mount | — | Router sự kiện gắn tại `/events` dưới kernel tree — đi qua middleware Origin/JSON CSRF như các ghi kernel khác | `apps/server/src/routes/kernel.ts:3509-3514` (import tại `apps/server/src/routes/kernel.ts:129`) |
| 5 | `/schedule` (SPA route) | — | Route `_auth/schedule`, validateSearch passthrough thô (không ném/không redirect), component tự phân tích | `apps/web/src/routes/_auth/schedule.tsx:34-46` |

Client gọi endpoint 1–2 tại `apps/web/src/lib/repos/events.ts:55-93` (POST, timeout 15s, 401→reauth, 502 cho body lạ) và `apps/web/src/lib/repos/events.ts:96-121` (DELETE, encode id, 401→reauth).

## §2 Validation (một bộ luật hai đầu)

Bộ luật duy nhất: `orgEventDraftSchema` — server parse (`apps/server/src/routes/events.ts:44-45`) và client pre-validate (`apps/web/src/components/schedule/org-event-modal.tsx:24-36`) cùng import một nguồn (`packages/api/src/event-contracts.ts:35-46`).

| Trường | Luật | Thông báo tiếng Việt (client) | Nguồn |
|--------|------|-------------------------------|-------|
| title | trim → 2–100 ký tự | "Tên sự kiện cần 2–100 ký tự." | `packages/api/src/event-contracts.ts:3-4,37`; `apps/web/src/components/schedule/org-event-modal.tsx:17` |
| date | `/^\d{4}-\d{2}-\d{2}$/` + vòng UTC (2026-02-30 bị từ chối) | "Ngày không hợp lệ (yyyy-mm-dd)." | `packages/api/src/event-contracts.ts:24-31,38`; modal `:18` |
| startTime | `/^([01]\d|2[0-3]):[0-5]\d$/` | "Giờ bắt đầu không hợp lệ (HH:mm)." | `packages/api/src/event-contracts.ts:33,39`; modal `:19` |
| endTime | cùng mẫu HH:mm; refine `endTime > startTime` (so chuỗi) | "Giờ kết thúc phải sau giờ bắt đầu (HH:mm)." | `packages/api/src/event-contracts.ts:39,43-45`; modal `:20` |
| note | ≤ 500, default "" | "Ghi chú tối đa 500 ký tự." | `packages/api/src/event-contracts.ts:5,41`; modal `:21` |

Chính sách hiển thị lỗi: chỉ hiện sau lần gửi đầu hoặc trên trường đã nhập (`apps/web/src/components/schedule/org-event-modal.tsx:66-70`); draft không hợp lệ thì không gửi request nào (`apps/web/src/components/schedule/org-event-modal.test.tsx:92-93`).

URL `/schedule`: `?view=` nhận month|week|day; `?date=` nhận yyyy-mm-dd năm 1970–2099; thiếu cả hai → đọc legacy `?week=`; còn thiếu → week + hôm nay giờ VN; trạng thái "cần scrub" được tính khi có tham số nào present nhưng không tạo được cặp hợp lệ (`apps/web/src/lib/schedule-view.ts:47-71`; biên năm `apps/web/src/lib/week-grid.ts:17-18,50-55`).

## §3 Errors — cặp ném/bắt nguyên văn

| Server ném (chuỗi + status) | Nguồn ném | Client bắt | Wording client | Nguồn bắt |
|---|---|---|---|---|
| `{ error: "unauthorized" }` 401 | `apps/server/src/routes/events.ts:36` (POST), `:67` (DELETE) | `HttpError(401)` → gọi `reauth()` rồi throw | (đăng nhập lại) | `apps/web/src/lib/repos/events.ts:67-70` (POST), `:106-109` (DELETE) |
| `{ error: "invalid json" }` 400 | `apps/server/src/routes/events.ts:38-43` | — (không có đường client tạo ra) | — | — |
| `{ error: "invalid body" }` 400 | `apps/server/src/routes/events.ts:44-45` | `HttpError` kèm `reason` | 4xx + reason `"invalid body"` → "Dữ liệu chưa hợp lệ — kiểm tra lại các trường."; 4xx khác → "Không tạo được sự kiện (status)." | `apps/web/src/lib/repos/events.ts:71-76`; `apps/web/src/components/schedule/org-event-modal.tsx:106-113` |
| `{ error: "insert failed" }` 500 | `apps/server/src/routes/events.ts:61` | `HttpError` ≥500 rơi xuống nhánh chung | Toast "Không tạo được sự kiện — thử lại." | `apps/web/src/components/schedule/org-event-modal.tsx:114-116` |
| `{ error: "not found" }` 404 (DELETE: thiếu id hoặc không thuộc org) | `apps/server/src/routes/events.ts:70,76` | `HttpError` 404 | Toast info "Sự kiện đã không còn tồn tại." (đóng, không coi là lỗi); lỗi khác → "Không xóa được sự kiện — thử lại." | `apps/web/src/components/schedule/org-event-chip.tsx:48-57` |
| (client phân loại) 502 "POST /api/events returned a non-JSON body" / "…unexpected body" | — | `HttpError(502)` | Toast "Không tạo được sự kiện — thử lại." | `apps/web/src/lib/repos/events.ts:77-89`; modal `:114-116` |
| (client) quá hạn `AbortSignal.timeout(15000)` | — | fetch throw | Toast như lỗi chung | `apps/web/src/lib/repos/events.ts:15,65,104`; modal/chip như trên |
| (runtime) `Error("org event ${id} missing from snapshot")` | — | không bắt — defensive throw khi dữ liệu không nhất quán | — | `apps/web/src/components/schedule/schedule-day-view.tsx:142-149`; `apps/web/src/components/schedule/schedule-month-view.tsx:167-174` |

Điểm riêng so với pipeline khác: sự kiện KHÔNG dùng bảng mã lỗi trung tâm (không có hằng kiểu `EVENT_ERROR_CODES`); pipeline kỳ nghỉ thì CÓ — `HOLIDAY_ERROR_CODES` (`packages/api/src/contracts.ts:3631-3645`) trả kèm 409/422 tại `apps/server/src/routes/holidays.ts:1-10` (điểm chạm, thuộc SRS holidays).

Test khóa mã lỗi: 401 chưa đăng nhập + 400 JSON hỏng (`apps/server/src/routes/events.test.ts:175-190`); 8 body hỏng → 400 và không ghi dòng nào (`apps/server/src/routes/events.test.ts:152-173`); 401/404 khi xóa (`apps/server/src/routes/events.test.ts:283-296`); xóa chéo org → 404 và dòng còn nguyên (`apps/server/src/routes/events.test.ts:260-281`).

## §4 Rules + hằng số

Hằng số hợp đồng sự kiện:
- `ORG_EVENT_TITLE_MIN = 2`, `ORG_EVENT_TITLE_MAX = 100`, `ORG_EVENT_NOTE_MAX = 500` — `packages/api/src/event-contracts.ts:3-5`.
- `HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/` — `packages/api/src/event-contracts.ts:33`.
- `REQUEST_TIMEOUT_MS = 15000` (client) — `apps/web/src/lib/repos/events.ts:15`.
- `MAX_VISIBLE_ITEMS = 3` (mỗi ô Tháng) — `apps/web/src/lib/schedule-month.ts:107`.
- `CLASS_COLOR_COUNT = 8`; FNV-1a 32-bit; offset `0x811c9dc5`, prime `0x01000193` — `apps/web/src/lib/class-color.ts:8-22`.
- Biên năm `MIN_YEAR = 1970`, `MAX_YEAR = 2099` — `apps/web/src/lib/week-grid.ts:17-18`.
- Thứ tự chuẩn (date, startTime, id): server `apps/server/src/routes/snapshot.ts:100-105`; client vá `apps/web/src/lib/repos/events.ts:43-48`; cột tuần `apps/web/src/components/schedule/schedule-week-view.tsx:91-95`.
- Thứ tự agenda: kỳ nghỉ (cả ngày) → giờ tăng dần → id — `apps/web/src/lib/schedule-day.ts:78-87` (bản tháng giống hệt: `apps/web/src/lib/schedule-month.ts:159-168`).
- Đếm slot tuần: bỏ `cancelled` và `holiday`, dedupe `day|time` — `apps/web/src/lib/schedule-week.ts:273-290`.
- Budget view-model tháng: index một lần ngoài vòng lặp, chú thích "50 classes × 24 sessions < 50ms" — `apps/web/src/lib/schedule-month.ts:171-175`; test đo `apps/web/src/lib/schedule-month.test.ts:363-391`.
- Nhãn ngữ nghĩa lịch: `org_event` "nằm ngoài lịch lớp: không tính buổi dạy, không đụng điểm danh hay nhắc việc, chỉ hiển thị trên lịch" — `packages/db/src/schema/org-event.ts:5-8`; chú thích chip "Sự kiện không ảnh hưởng ca học, điểm danh hay nhắc việc." — `apps/web/src/components/schedule/org-event-chip.tsx:152-154`.
- Deploy skew: `events` tùy chọn trong snapshot — `packages/api/src/contracts.ts:1934-1937`; nằm trong `OPTIONAL_SNAPSHOT_COLLECTION_KEYS` — `apps/web/src/lib/repos/kernel.ts:570-580`; bó rỗng lúc mapping — `apps/web/src/lib/repos/kernel.ts:385`.
- Thông điệp trạng thái trống: trang "Chưa có lịch dạy nào…" — `apps/web/src/routes/_auth/schedule.tsx:196-212`; ngày "Không có ca học hay sự kiện nào trong ngày này." — `apps/web/src/components/schedule/schedule-day-view.tsx:43-49`; tuần "Không có buổi học nào trong tuần này." — `apps/web/src/components/schedule/schedule-week-view.tsx:57-61`.

## §5 Entities

- `org_event` (bảng, SQLite/Drizzle): `id` PK; `org_id` NOT NULL → `organization.id` ON DELETE cascade; `title`; `date`; `start_time`; `end_time`; `note` NOT NULL default ''; `created_by_user_id` NOT NULL; `created_at` integer ms default `unixepoch('subsecond')*1000`; index `org_event_org_date_idx (org_id, date)` — `packages/db/src/schema/org-event.ts:9-27`; migration `packages/db/src/migrations/0046_faithful_punisher.sql:1-14` (journal `packages/db/src/migrations/meta/_journal.json:331`).
- `organization`: `id` PK, `name`, `created_at` — `packages/db/src/schema/organization.ts:4-10`.
- `lesson` (chạm hiển thị): `day` 1–7 thứ-Hai-first, `time`, `dur`, `date` nullable (occurrence identity), `type`, `status` ∈ `upcoming|completed|absent|cancelled|holiday` (TOS-11), cột điểm danh — `packages/db/src/schema/lesson.ts:41-72` (chú thích status `:52-66`).
- `class_session` (chạm hiển thị, #649): `classId`, `date`, `time`, `dur`, `topic`, `zoom`; độc lập ghi danh — `packages/db/src/schema/class-session.ts:18-38`.
- `organization_holiday` (chạm hiển thị, TOS-11): `name` (2–100), `fromDate`/`toDate` (≤30 ngày tính cả hai đầu), `scope` (org|classes), `mode` (shift|cancel), `notify`, `notifiedAt` — `packages/db/src/schema/organization-holiday.ts:20-49`; bảng lớp áp dụng `organization_holiday_class` `:52-66`; cặp dời `holiday_session_shift` `:69-96`.
- Hợp đồng snapshot: `KernelEventRow` (id/title/date/startTime/endTime/note/createdAt?/createdByUserId?) — `packages/api/src/event-contracts.ts:8-22`; `KernelSnapshot.events?` — `packages/api/src/contracts.ts:1934-1937`.

## §6 Cross-repo hops (chuyển vùng bằng chứng)

1. **Contract package → 2 runtime:** `packages/api/src/event-contracts.ts` dùng chung bởi server (`apps/server/src/routes/events.ts:1-5`) và web (`apps/web/src/components/schedule/org-event-modal.tsx:2-6`, `apps/web/src/lib/repos/events.ts:9`) — một bộ luật, hai phía.
2. **DB → API:** `@teacher-os/db/schema/org-event` import vào route (`apps/server/src/routes/events.ts:5`) và snapshot (`apps/server/src/routes/snapshot.ts:36`).
3. **Snapshot → slice web:** server trả `events` (`apps/server/src/routes/snapshot.ts:732`) → web map `snapshot.events ?? []` (`apps/web/src/lib/repos/kernel.ts:385`) → `useData()` cung cấp cho route (`apps/web/src/routes/_auth/schedule.tsx:57`).
4. **Web cache path riêng:** POST/DELETE không qua command bus kernel mà qua repo riêng + `queryClient.setQueryData` trên key `['kernel']` (`apps/web/src/lib/repos/events.ts:31-52`, key tại `apps/web/src/lib/repos/kernel.ts` — `kernelQueryKey` import `apps/web/src/lib/repos/events.ts:13`).
5. **Kỳ nghỉ:** hiển thị dùng `holidays`/`holidayShifts`/`holidayCancels` từ snapshot (`apps/web/src/components/schedule/schedule-week-view.tsx:52-53,262-266`); nghiệp vụ apply/undo ở `apps/server/src/routes/holidays.ts` (không đi sâu — feature riêng).
6. **Ca học:** mở hộp thoại từ lịch gửi tham chiếu buổi (classId/dateISO/day/time) sang `class-session-modal.tsx` (`apps/web/src/components/schedule/schedule-day-view.tsx:112-124`); các lệnh điểm danh/sửa do feature classes sở hữu.

## §7 Gaps — negative search (pattern + phạm vi grep)

| Gap | Pattern | Phạm vi | Kết quả |
|-----|---------|---------|---------|
| Không sửa sự kiện | `grep -n "PUT\|PATCH" apps/server/src/routes/events.ts` | file route | 0 match (chỉ `post("/",)` `delete("/:id",)` tại dòng 34, 65) |
| Không repo sửa client | `grep -rn "updateEvent\|editEvent" apps/web/src --include=*.ts*` | web app | 0 match; chỉ `createEvent` (`apps/web/src/lib/repos/events.ts:55`), `deleteEvent` (`:96`) |
| Không GET riêng | `grep -n "routes.get" apps/server/src/routes/events.ts` | file route | 0 match |
| Không thấy ở học viên/admin | `grep -rn "orgEvent\|org-event\|/api/events" apps/student/src apps/admin/src` | 2 app | rỗng |
| Consumer `data.events` chỉ trong lịch | `grep -rn "\.events" apps/web/src --include=*.tsx --include=*.ts` (lọc bỏ test/notifs/billing) | web app | `apps/web/src/routes/_auth/schedule.tsx:196`, `apps/web/src/components/schedule/schedule-{month,day,week}-view.tsx`, `apps/web/src/lib/schedule-{day,month}.ts`, `apps/web/src/lib/repos/kernel.ts:385` (nhóm `debts/billing-timeline-drawer.tsx` là khái niệm "events" khác — Conflict-2) |
| Test không bị bỏ | `grep -rn "\.skip\|\.only\|\.todo\|\.fixme"` trên 9 file test của feature (S23–S28) | test files | 0 match — 8+7+19+2+62 test unit/contract + 3 e2e đều active |
| Feature flags tắt | `grep -rn "org_event\|orgEvent" apps/web/src/lib/features.ts` + `PARENT_REPORTS` | web | không liên quan — sự kiện không nằm sau cờ nào; route + UI luôn gắn |

## §8 Số liệu kiểm chứng lại bằng đếm (rule 7)

- Test active đếm lại: `apps/server/src/routes/events.test.ts` = 8 `test(`; `packages/api/src/event-contracts.test.ts` = 7; `apps/web/src/routes/_auth/schedule.test.tsx` = 19 `it(`; `org-event-modal.test.tsx` = 2; view-model libs = 13+27+11+11 = 62; e2e `schedule-views-and-events.spec.ts` = 3 `test(`.
- 8 body hỏng trong test validation (`apps/server/src/routes/events.test.ts:154-162`): title 1 ký tự; title 101; endTime == startTime; endTime < startTime; ngày 2026-02-30; startTime 24:00; note 501; thiếu giờ.
- Ô Tháng: 42 ô = 6×7 (`apps/web/src/lib/week-grid.ts:195-200`); cap 3 + overflow (`apps/web/src/lib/schedule-month.ts:272-273`).
