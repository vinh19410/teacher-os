# Test Report: teacher-os — chuyển scenario report thành test suite

Ngày 2026-10-02. Nguồn: [scenario report 42 case](../261002-1409-scenario-test-cases/report.md). Theo workflow `create` của `ak:test` — coverage matrix từ test hiện có, implement gap ưu tiên, mutation spot-check, full gates.

## Coverage matrix trước → sau

| Nhóm scenario | Level | Trước | Sau | Ghi chú |
|---|---|---|---|---|
| A1 IDOR same-org | server integration | ✅ (c) | ✅ | đã có sẵn |
| **A2 IDOR cross-org** (header `x-student-org-id`) | server integration | ❌ | ✅ test mới | vector thật: requireStudent resolve theo email đa org |
| A3/A4/A5 auth role/origin | auth unit + e2e | ✅ | — | đã có, ngoài scope |
| **T1 start race** | server integration | chỉ sequential | ✅ test mới | assert bất biến (1×201 + 1×200, cùng attemptId, 1 row) |
| T2 patch-vs-submit mid-flight | server integration | một phần | bỏ có lý do | nhánh CAS phòng thủ; invariant đã pin bởi patch-after-submit 409 |
| T3/T4 double submit + heal stamp | server integration | ✅ (d/f/g) + heal | ✅ | đã có sẵn |
| T5 json_set atomic | server integration | ✅ (e) | ✅ | đã có sẵn |
| **I1 value > 500** | server integration | ❌ | ✅ test mới | quizAnswerPatchSchema max |
| **I3 q âm/lẻ/ngoài range** | server integration | ❌ | ✅ test mới | zod + range check server-side |
| I2 essay > 10.000 | server integration | ✅ essay guards | ✅ | đã có sẵn |
| **I4 escape JSON quote/backslash/emoji** | unit + server | ❌ | ✅ test mới (cả 2 level) | json_quote round-trip + grader string compare |
| **I5 separator " / "** | unit | ❌ | ✅ test mới | probe phân biệt: alt chứa slash `a/b / c` |
| I6 NFC/NFD | unit | ❌ | ✅ pin hành vi | NFD không khớp NFC — ghi chú quyết định tương lai |
| I7 word count | unit | ❌ | ✅ test mới | trim/hyphen/CJK/emoji |
| S1–S3 scale | e2e/server | một phần | bỏ có lý do | đề lớn phụ thuộc surface thật; e2e đắt (nguyên tắc #6) |
| **ST1 snapshot freeze** | server integration | ✅ (h) | ✅ | đã có sẵn |
| ST2 resume | server + e2e | ✅ (d) | ✅ | đã có sẵn |
| ST3 enrollment thu hồi giữa chừng | — | ❌ | bỏ có lý do | pin hành vi có thể khoá sai; cần quyết định sản phẩm (open question) |
| ST4/ST5 essay trống + invitation | server | ✅/một phần | — | ST4 đã có (submit bài trắng); ST5 ngoài scope quiz |
| E1 mailer nuốt lỗi | — | ❌ | bỏ có lý do | cần feature surface lỗi, không phải test |
| E3 R2 upload (#305) | — | — | bỏ | feature chưa implement |
| D1 key "3.0" | server integration | chỉ comment | ✅ test mới | assert raw JSON keys — regression thật, mutation đã xác nhận |
| D2/D3 unique + xoá assignment | server | một phần | — | D2 do T1 phủ; D3 backlog |
| G1 OAuth state | e2e auth | ✅ | — | đã có |
| G2/G3 import encoding, libsql-D1 | e2e | một phần | bỏ có lý do | e2e syllabus có sẵn; G3 do chính quiz e2e phủ |
| B1 speaking ready-audio | server | ✅ tests.test.ts | ✅ | đã có sẵn |
| B2 retake 409 | server integration | ✅ (d/f/g) | ✅ | đã có sẵn |
| **B3/B4 infer TF/NG run** | unit | chỉ 1 case server | ✅ test mới (8 case) | ranh giới họ, NOT GIVEN đơn lẻ, opts/pin/marker |
| B5 invoice biên | web/server | một phần | bỏ | ngoài scope quiz round này |
| U1/U2 onboarding + invitation | server/e2e | ✅ | — | đã có |

## Test thêm mới

**packages/api (unit, package trước đây 0 test):**
- `src/lib/grade-quiz.test.ts` — 8 tests: verdicts/counts, normalize, I6 NFC pin, I5 separator, alt rỗng, quote/backslash
- `src/lib/infer-question-types.test.ts` — 8 tests: B3 run TF↔YN, NOT GIVEN, B4 opts/pin/marker/type, non-cloze promptType
- `src/lib/word-count.test.ts` — 5 tests: rỗng, gạch nối/số, whitespace, emoji/CJK, tiếng Việt
- `vitest.config.ts` — include `src/**` (tsc -b copy test vào dist, tránh chạy 2 lần)
- `package.json` — thêm `test: vitest run` + vitest ^4.1.10 (mirror packages/auth)

**apps/server (`student-quiz.test.ts`, +4 tests):**
- concurrent start race (T1) — bất biến: đúng 1×201 + 1×200, cùng attemptId, đúng 1 row DB
- answer patch bounds (I1/I3) — 501 ký tự, q âm/lẻ, q ≥ snapshot length, DB không ghi gì
- special-char round-trip + D1 key pin (I4/D1) — raw JSON keys `["0","2","7"]`, grade counts
- cross-org IDOR (A2) — org-2 cùng email qua `x-student-org-id` → 404 mọi endpoint + positive control org-1
- fixtures: org-2 + student cùng email (unique index per-org nên hợp lệ, createdAt cũ để không lệch default org của test cũ); `prompt-quiz-2` + ca-q19..22

## Mutation spot-check (5/5 bắt được)

| Mutation | Kỳ vọng | Kết quả |
|---|---|---|
| `ALT_SEPARATOR` `" / "` → `"/"` | test alt-slash fail | ✅ fail (sau khi strengthening probe — bản đầu không bắt được vì normalize trim làm 2 separator tương đương trên alt thường) |
| `"ynng"` → `"tfng"` trong flush | test run YN fail | ✅ 3 tests fail |
| `${String(q)}` → `${q}` trong json_set | D1 key pin fail | ✅ fail đúng regression `0.0` |
| vô hiệu `q >= questions.length` | bounds test fail | ✅ fail |
| bỏ `.trim()` trong countWords | empty test fail | ✅ fail |

Tất cả mutation đã revert — `student.ts` không còn diff (`git status` chỉ thấy file test).

## Kết quả chạy

- `pnpm --filter @teacher-os/api test` — **21/21 pass** (trước đây: 0 test)
- `pnpm --filter server test` — **472/472 pass** (15 → 19 tests trong student-quiz)
- `pnpm check-types` — 7/7 tasks thành công
- `biome check` scoped 7 file đã sửa — sạch (root `pnpm check` gãy ở worktree cũ, known issue không liên quan)

## Gap cố ý còn lại (kèm lý do)

1. **ST3** enrollment thu hồi giữa lúc làm bài vẫn autosave được — cần quyết định sản phẩm trước khi pin hành vi.
2. **T2** nhánh race trung gian submit-vs-autosave — nhánh phòng thủ, bất biến đã pin ở mức sequential.
3. **E1** mailer nuốt lỗi lặng lẽ — cần sửa surface lỗi (feature), test sẽ đi kèm khi sửa.
4. **E3** R2 upload — chờ #305 implement.
5. **S1/S3/D3/B5** — backlog nhóm sau (e2e đề lớn, xoá assignment sau submit, invoice biên).

## Open questions

1. ST3: enrollment bị thu hồi có nên chặn autosave/submit của attempt đang dở không?
2. I6: có nên thêm `normalize("NFC")` vào grader để chấp nhận tiếng Việt tổ hợp (NFD) từ bàn phím lạ?
