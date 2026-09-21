---
title: Ship v0.0.5 — promote develop → main (squash-orphan reconciliation)
date: 2026-09-21
summary: "Promote develop→main v0.0.5: 16 PR #197–#225, bump 0.0.4→0.0.5 (migrations 0017–0019 additive), merge origin/main -s ours sau 27 false conflicts squash-orphan (tree 2bd9f17 == 871a374)"
---

# Ship v0.0.5 — promote develop → main (squash-orphan reconciliation)

## What happened
- Ship official 2026-09-21 (mode: official): promote `develop` → `main`, release v0.0.4 → v0.0.5. Bundle 16 PR đã merge (#197–#225): assignment bank create (#202) + flow gán bài cho lớp (#208), tạo đề IELTS 4 skill kèm answer key auto-grading (#218), cột nợ học phí trong class roster (#216), assignment create single-column + `/assignments/preview` (#213), modal "Quản lý buổi" class-scoped + curriculum card assignment-only (#221), dashboard lịch tuần tới (#212), xóa syllabus template (#211), ẩn parent reports sau feature flag (#210), fix schedule (#200, #204), Zalo OA honest state (#172), invoice code đọc được (#176), CSP skip trên localhost (#203), kèm pilot triage kit (#68/#69 docs).
- Version bump 0.0.4 → 0.0.5 (patch); migrations 0017–0019 additive-only, không đụng schema cũ. Repo không có `CHANGELOG.md` nên bước changelog bị skip (không tạo mới giữa chừng trong release).
- Sự kiện kỹ thuật đáng nhớ nhất của đợt ship: `git merge origin/main` vào `develop` nổ 27 conflicts — và toàn bộ là false conflicts, dạng "squash-orphan". Root cause không dễ chịu chút nào: release trước v0.0.4 (PR #196) được squash-merge vào main thành commit `2bd9f17`, tree của nó byte-identical với ancestor `871a374` của develop. Git không thấy được quan hệ tổ tiên xuyên qua squash nên coi TOÀN BỘ thay đổi của develop kể từ v0.0.4 là xung đột với main — trong khi main đúng nghĩa không có nội dung mới nào. 27 conflicts từ một main rỗng: đây là vết thương ta tự gây bằng chính lựa chọn squash-merge của lần trước, và phải trace tree-hash mới dám tin main rỗng thật chứ không phải đang bỏ sót code của ai.

## Decision
- Resolve bằng `git merge -s ours origin/main` kèm evidence ghi rõ trong merge commit `f45b69f` ("Merge branch 'main' into develop (squash-orphan reconciliation)"): (1) tree-hash `2bd9f17` == `871a374` (byte-identical), (2) chứng minh ancestry `871a374` thuộc develop. Kết quả: merge giữ đúng edge develop→main mà không chế ra một content merge giả.
- Tại sao không resolve tay 27 file: khi main rỗng thì resolve tay là đường tắt nguy hiểm — đúng lần này, nhưng không có evidence thì lần sau không phân biệt được "main rỗng thật" với "main có update mà ta đang vứt". Tại sao không `-X ours`: auto-resolve mọi conflict, không để lại bằng chứng gì cho người sau. Rebase develop lên main cũng bị loại: rewrite history của 16 PR đã merge, mất mapping PR → commit.
- Bài học nhức nhối: squash-merge cho release PR (develop → main) là fuse cháy chậm — mỗi release lại tái diễn squash-orphan và mỗi lần càng nặng. Sửa triệt để hoặc là dùng merge commit cho release PR, hoặc chuẩn hóa `-s ours` + evidence check thành bước runbook bắt buộc của ship stable.
- Bước ghi journal này không stage, không commit — chỉ tạo file, đúng phạm vi được giao.

## Vướng mắc & bài học
- Cái đau không phải độ khó kỹ thuật — trace tree-hash chỉ vài phút — mà là việc phải tự chứng minh với chính mình rằng 27 conflicts đến từ hư không. Squash-orphan là loại bug quy ước quy trình, không phải bug code: không test nào bắt được, chỉ lộ đúng lúc release.
- Với ai kế thừa: thấy develop ↔ main nổ conflict hàng loạt dù main "không ai đụng tới", đừng resolve theo cảm tính — check `git cat-file -p` so tree-hash giữa tip main và ancestor của develop trước đã.

## Next steps
- Theo dõi CI trên `main` sau promote; tag/publish v0.0.5 theo chu kỳ release.
- Runbook hóa squash-orphan cho ship stable: thêm bước `-s ours` + tree-hash evidence check (owner: ship workflow, trước chu kỳ v0.0.6); cân nhắc đổi release PR sang merge commit để chấm dứt hiện tượng.
- Quyết định có đưa `CHANGELOG.md` vào repo trước v0.0.6 hay không.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
