---
title: "Phase 1: SRS Engine Core + Conformance Vectors"
status: todo
---

# Phase 1: SRS Engine Core + Conformance Vectors

## Context Links

- Spec nguồn (copy vào repo này ở bước đầu): Flinto `docs/srs-spec.md` §1 (card fields), §2 (answer math), §4.1 (typing rules), §5 (formatCountdown), §6 (formatInterval), §8 (reference impl).
- Handoff tổng hợp: `plans/handoffs/game-review-logic-teacher-os-20261018-0225.md` (repo Flinto) section "Tổng hợp logic" §1–2, §6.
- Đối chiếu khi port: `ios/Flinto/Data/Scheduler.swift:1-106`, `ios/Flinto/Data/QuizRules.swift:1-97`, `android/.../domain/Scheduler.kt:1-133`, `android/.../domain/QuizRules.kt:1-112` (repo Flinto).

## Overview

Port phần lõi thuần của hệ thống SRS Flinto sang TypeScript: toán đáp án (`applyAnswer`, `learned`), typing rules (`normalizeAnswer`, `typingEligible`, `typingHint`), formatter (`formatInterval`, `formatCountdown`) — kèm bộ conformance vectors + reference generator copy từ Flinto. Mọi hàm là pure function không depend DB/UI; đây là nền mà Phase 4 (session engines) và Phase 3 (server) cùng dùng.

## Key Insights

- Vectors là **hợp đồng byte-identical**: Flinto giữ iOS/Android không trôi bằng cách chạy test chống `level-vectors.json`; teacher-os trở thành platform thứ 3 của cùng bộ hợp đồng đó. Copy nguyên file `level-vectors.json` + generator `.mjs` (dependency-free JS — chạy được nguyên văn trong repo TS qua script node).
- `dueAt` là epoch ms UTC; wait = `now + n × DAY_MS` (KHÔNG phải ngày lịch local) → deterministic, test được.
- Độ dài tính bằng **Unicode code points** (không phải UTF-16 units): dùng `[...str]` spread hoặc `Intl.Segmenter`-free loop, không dùng `str.length`.
- Section `legacy` của vectors KHÔNG chạy (không có data cũ) nhưng giữ nguyên trong file để không lệch byte với nguồn.

## Requirements

- [ ] `docs/srs-spec.md` tồn tại ở teacher-os, identical với Flinto `dev` @ `b9ec13c`.
- [ ] `applyAnswer(card, correct, now)` + `learned(card, now)` + constants (`DAY_MS`, `LEVEL_INTERVAL_DAYS`, `WARNING_INTERVAL_DAYS`, `MIN_LEVEL`, `MAX_LEVEL`, clamp) đúng bảng chuyển spec §2 (12 dòng đủ).
- [ ] `normalizeAnswer` đúng thứ tự: NFC → `’ ‘ ʼ`→`'` → `– —`→`-` → trim → collapse whitespace → lowercase không locale; dấu biến âm có nghĩa.
- [ ] `typingEligible`: non-empty, ≤ 30 code points, regex `^[\p{L}\p{M}]+([ '\-][\p{L}\p{M}]+)*$` (flag `u`).
- [ ] `typingHint(word, level)`: L1–2 giữ chữ đầu mỗi token (space-separated), L3–4 toàn `_`, L5 rỗng; space/`'`/`-` giữ nguyên.
- [ ] `formatInterval(minutes)` + `formatCountdown(ms)` đúng bảng vector spec §5–6 (kể cả boundary 3599_000 → "59:59", 10080 → "1w"). Consumer (red-team F15): `formatCountdown` → overview countdown (Phase 5); `formatInterval` → hint next-review ở deck detail/summary (Phase 5) — không để dead code.

## Architecture

```
packages/api/src/srs/
├── scheduler.ts        # constants + applyAnswer + learned + clamp
├── quiz-rules.ts       # normalizeAnswer, typingEligible, typingHint, matchTyping
├── format.ts           # formatInterval, formatCountdown
├── vectors/
│   ├── level-vectors.json          # copy byte-identical từ Flinto
│   ├── generate-level-vectors.mjs  # copy nguyên văn (JS thuần) — reference impl
│   └── README.md                   # nguồn gốc, cách regen + --check
├── scheduler.test.ts   # chạy section answers + learnCommit
├── quiz-rules.test.ts  # chạy section typing + eligibility + hints
└── format.test.ts      # chạy section intervals + các vector formatCountdown trong spec §5
docs/srs-spec.md        # copy nguyên văn từ Flinto
```

## Related Code Files

- Create: mọi file trong cây trên.
- Modify: KHÔNG đụng file hiện có (package `@teacher-os/api` đã có vitest setup — test file mới tự được pickup).

## Implementation Steps

1. Copy 3 file "spec đóng gói" từ Flinto (lệnh chạy từ root teacher-os):
   ```bash
   cp /Users/vinhtran/Documents/project/personal/flinto/docs/srs-spec.md docs/srs-spec.md
   cp /Users/vinhtran/Documents/project/personal/flinto/shared/srs/generate-level-vectors.mjs packages/api/src/srs/vectors/
   cp /Users/vinhtran/Documents/project/personal/flinto/shared/srs/level-vectors.json packages/api/src/srs/vectors/
   ```
   Verify: `diff` cả 3 file với nguồn = không có khác biệt.
2. Port `scheduler.ts` từ pseudo-code spec §2 + `learned()` §3b rule 7 (`{ level: 1, isWarning: false, state: "review", intervalDays: 1, dueAt: now + DAY_MS, lapses: giữ nguyên }`). Type `SrsCard` = `{ level, isWarning, state: "new" | "review", intervalDays, dueAt, lapses }`.
3. Port `quiz-rules.ts` từ spec §4.1. Lưu ý JS có sẵn: `str.normalize("NFC")`, `toLowerCase()` không locale — đúng reference impl luôn.
4. Port `format.ts`: `formatInterval` theo bảng điều kiện tuần tự §6; `formatCountdown` theo §5 (`s = ceil(ms/1000)`, `0` khi `ms <= 0`).
5. Viết 3 file test chạy chống vectors: đọc JSON bằng `import vectors from "./vectors/level-vectors.json"` (assertType; nếu vitest config chặn JSON import thì dùng `readFileSync` + `JSON.parse` theo precedent test hiện có — kiểm `packages/api` vitest config lúc cook). Mỗi section → `test.each(vectors.answers)` v.v., assert deep-equal `expected`.
6. Thêm script `verify:vectors` vào `packages/api/package.json`: `node src/srs/vectors/generate-level-vectors.mjs --check` (chạy từ đúng cwd để ghi/so file JSON — nếu script hardcode output path tương đối thì điều chỉnh README chứ không sửa logic generator).
7. Viết `vectors/README.md` ghi nguồn (Flinto @ b9ec13c), lệnh regen, cảnh báo "đổi hằng số = regen vectors, không sửa tay JSON".

## Todo

- [ ] Copy 3 file spec/vectors + diff verify
- [ ] `scheduler.ts` + test (answers + learnCommit)
- [ ] `quiz-rules.ts` + test (typing + eligibility + hints)
- [ ] `format.ts` + test (intervals + countdown)
- [ ] Script `verify:vectors` pass

## Success Criteria

- `pnpm --filter @teacher-os/api run test` pass (verify tên filter đúng `package.json` name lúc cook — có thể là `api`).
- `node packages/api/src/srs/vectors/generate-level-vectors.mjs --check` exit 0 (script này cũng thuộc verification gate Phase 6 — không chỉ chạy một lần ở đây).
- Không có import nào từ `@teacher-os/db` / hono / react trong `src/srs/` — engine thuần portable (grep verify).

## Risk Assessment

- **JSON import trong vitest**: nếu fail → fallback `readFileSync`. Ảnh hưởng nhỏ, có phương án.
- **Generator `.mjs` hardcode path output**: chỉ ảnh hưởng script verify, không ảnh hưởng engine.

## Security Considerations

- Engine thuần, không I/O — không có surface. (Server-side usage guard thuộc Phase 3.)
