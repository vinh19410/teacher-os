---
phase: 7
title: "Wave 6 Assignments persist"
status: pending
priority: P2
effort: "1d"
dependencies: [4]
# Blocks wave 7 (shared grade-modal.tsx).
---

# Phase 7: Wave 6 Assignments persist

## Overview

Bảng `assignment` + scores. Grade persist. Gửi/nháp vẫn stub.

## Context Links

- `apps/web/src/routes/_auth/assignments/index.tsx`, `$assignmentId.tsx`
- `apps/web/src/components/modals/grade-modal.tsx:42` — chỉ dispatch scores
- "Gửi cho học viên" / "Lưu nháp" không dispatch (`$assignmentId.tsx:121-124`)
- Có thể song song wave 4/5. **Không** song song wave 7 (`grade-modal.tsx`).

## Requirements

- Functional: list/detail + grade persist.
- Non-functional: không tạo bài. Không gửi/nháp. Không đụng reports.

## Architecture

```
assignment: id, orgId, studentId, title, type, due, status, scores json/null
```

POST `/api/assignments/:id/grade` `{ scores }`. Không create endpoint. Test grade dùng helper insert, không mở stub tạo bài.

## Related Code Files

- Create: `packages/db/src/schema/assignment.ts`
- Create/Modify: `apps/server/src/routes/assignments/`, `repos/assignments.ts`
- Modify: `assignments/*`, `grade-modal.tsx`
- Do not modify: `reports.tsx`

## Implementation Steps

1. Schema + migrate.
2. GET list/detail + POST grade.
3. GradeModal → API. Gửi/nháp giữ no-op.
4. Org mới: 0 assignment.

## Todo

- [ ] Bảng assignment
- [ ] Grade persist
- [ ] Gửi/nháp no-op
- [ ] Quality gate

## Success Criteria

- [ ] Reload giữ scores + status graded
- [ ] Không insert assignment mới từ UI
- [ ] Quality gate xanh

## Risk Assessment

Scores shape `task/coherence/lexical/grammar` phải validate 0–9. Signal: NaN từ input. Response: Zod server-side, giữ check grade-modal.

## Security Considerations

Grade chỉ assignment cùng org. Không nhận `studentId` đổi chủ.
