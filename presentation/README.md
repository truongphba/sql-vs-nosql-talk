# Presentation — Pixiland DB Talk

Slide deck (reveal.js, no-build) cho buổi *SQL vs NoSQL*. **Đầy đủ toàn buổi — 45 slide**: Hook → Pixiland → DB landscape → Demo 1–4 → Pitfalls → Decision Framework → Q&A → Closing.

> ⚠ Các bảng **benchmark là số tạm** (đánh dấu "SO TAM" ở footer mỗi bảng) — refresh sau khi chạy demo thật.

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

Pixel / GameFi (disciplined): pixel font chỉ cho accent ASCII (eyebrow, số, VS, tên DB), nội dung tiếng Việt dùng Be Vietnam Pro / JetBrains Mono. Mỗi DB có màu signature dùng xuyên deck. Chi tiết token: xem đầu `theme.css` và mục Design system trong `../CLAUDE.md`.
