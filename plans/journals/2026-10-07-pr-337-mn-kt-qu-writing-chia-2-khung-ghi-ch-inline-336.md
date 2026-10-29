---
title: "PR #337 — màn kết quả Writing chia 2 khung + ghi chú inline (#336)"
date: 2026-10-07
summary: "EssayWithHighlights thêm prop opt-in inlineNotes (span note ngay sau mark, JSX text, gate trim, break-words; trang chấm giữ bất biến chọn→offset nhờ default-false + test guard AnnotatableEssay). Nhánh Writing đã chấm chia 2 khung app:grid 3fr/2fr ≥921px, card scrollable gói trọn max-h/overflow/overscroll-contain/tabIndex-matchMedia; main nới 1120px qua isSplitWritingResult (một nguồn sự thật). Bỏ EssayAnnotationList ở student. Bài học e2e: sticky tại đáy trang bị clamp innerHeight−24−max-h=72 (không phải top-20=80 — band phải chứa clamp); ArrowDown cuộn container focus là animation → phải expect.poll scrollTop, đo ngay sau keypress bắt được 0. Red-team 12 findings đã áp trước khi code (chốt mt-6, gate sticky/width/scroll bằng e2e thật). Follow-up: derive breakpoint 921px một nguồn chung; resync isWide khi scrollable đổi."
---

# PR #337 — màn kết quả Writing chia 2 khung + ghi chú inline (#336)

EssayWithHighlights thêm prop opt-in inlineNotes (span note ngay sau mark, JSX text, gate trim, break-words; trang chấm giữ bất biến chọn→offset nhờ default-false + test guard AnnotatableEssay). Nhánh Writing đã chấm chia 2 khung app:grid 3fr/2fr ≥921px, card scrollable gói trọn max-h/overflow/overscroll-contain/tabIndex-matchMedia; main nới 1120px qua isSplitWritingResult (một nguồn sự thật). Bỏ EssayAnnotationList ở student. Bài học e2e: sticky tại đáy trang bị clamp innerHeight−24−max-h=72 (không phải top-20=80 — band phải chứa clamp); ArrowDown cuộn container focus là animation → phải expect.poll scrollTop, đo ngay sau keypress bắt được 0. Red-team 12 findings đã áp trước khi code (chốt mt-6, gate sticky/width/scroll bằng e2e thật). Follow-up: derive breakpoint 921px một nguồn chung; resync isWide khi scrollable đổi.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
