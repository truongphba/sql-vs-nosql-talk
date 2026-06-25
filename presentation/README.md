# Presentation — SQL vs NoSQL DB Talk

Slide deck (reveal.js, no-build) cho buổi *SQL vs NoSQL*. **Đầy đủ toàn buổi — 48 slide**: Hook → Case study → DB landscape → Demo 1–5 → Pitfalls → Decision Framework → Q&A → Closing.

> Slide benchmark chỉ ghi **KY VONG** (kỳ vọng): banner myth + bảng số dự đoán, **không** có số thật/verdict. Số thật chạy **live ở terminal** (`npm run demo:N`) rồi đối chiếu với kỳ vọng — confirm/bust nói bằng lời.

## Mở & trình chiếu

Double-click `index.html` (hoặc kéo vào trình duyệt). Cần có mạng lần đầu (reveal.js + font load từ CDN).

| Phím | Tác dụng |
|---|---|
| `←` / `→` · `Space` | Chuyển slide / bước fragment |
| `F` | Fullscreen |
| `Esc` / `O` | Overview tất cả slide |
| `B` | Màn đen (pause) |

**Lời thoại + timing + ghi chú độ chính xác** xem ở [`../pixiland-db-talk.md`](../pixiland-db-talk.md) (phần Phase 1) — không nhúng trong slide cho gọn.

## Files

- `index.html` — slide (mỗi `<section>` là 1 slide).
- `theme.css` — design system dùng chung (token màu/font, pixel components: chip, VS screen, bảng). Phase sau bám file này.

## Trước buổi thật (tuỳ chọn)

Để chạy offline, vendor reveal.js + font về local rồi sửa link CDN trong `index.html`. Chưa cần lúc đang dev.

## Design

Pixel / Game (disciplined): pixel font chỉ cho accent ASCII (eyebrow, số, VS, tên DB), nội dung tiếng Việt dùng Be Vietnam Pro / JetBrains Mono. Mỗi DB có màu signature dùng xuyên deck. Chi tiết token: xem đầu `theme.css` và mục Design system trong `../CLAUDE.md`.
