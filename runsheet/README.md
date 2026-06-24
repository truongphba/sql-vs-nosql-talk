# Runsheet — Kịch bản trình bày live (5 Demo)

> Mỗi file là **runsheet đứng nói** cho một demo: trục cảm xúc, làm gì / nói gì theo phút, cách "đo đừng đoán", quyết định để demo không nhàm. Nội dung + số liệu đầy đủ ở `../pixiland-db-talk.md` (source of truth); lệnh/setup ở `../README.md`.

| Demo | File | Engine | Trục |
|---|---|---|---|
| 1 Shared reward claim | [01-reward-claim.md](01-reward-claim.md) | Postgres · Redis | race → fix → twist |
| 2 Hero config | [02-hero-config.md](02-hero-config.md) | Postgres · JSONB · Mongo | read patterns → lock dưới tải |
| 3 Leaderboard | [03-leaderboard.md](03-leaderboard.md) | Postgres · Redis | read model vs truth |
| 4 Match history | [04-match-history.md](04-match-history.md) | Postgres · ScyllaDB | "nhanh hơn mọi mặt" → contract |
| 5 Analytics | [05-analytics.md](05-analytics.md) | Postgres · ClickHouse | confirm → pivot kiến trúc |

## Chuẩn bị chung (trước buổi)

- `npm run db:up` **sớm** — 5 container; **ScyllaDB ~20-30s**, **ClickHouse ~10s** khởi động chậm nhất.
- **Rehearsal 1 lần mỗi demo** để warm pool/cache → số live ổn định, không cold-start nhảy số. Demo 2 & 4 nhớ `:seed` trước.
- Mở sẵn DataGrip nối: Postgres (`55432`, user/pass `game`/`game`), ClickHouse (`58123`, user/pass `game`/`game`), ScyllaDB (`59042`) — cho các khoảnh khắc query tay.

## Cơ chế "Đo, đừng đoán" (áp dụng mọi demo benchmark)

Slide benchmark **chỉ ghi KY VONG** (banner myth + bảng số dự đoán) — **không** có số thật, **không** verdict-box. Trình tự mỗi demo:

1. Đọc to **KY VONG** trên slide *trước khi chạy* → khán giả cam kết vào dự đoán.
2. Chạy terminal lấy **số thật**.
3. **Đối chiếu bằng lời**: dòng nào đúng dự đoán (confirm), dòng nào lật (bust). Bust = nhớ lâu.

> Spine cả buổi: phần lớn demo **khác trực giác**. Slide payoff "Đo, đừng đoán" trước Closing chốt lại.

## Bảng tổng — trực giác vs thực tế

| Demo | KY VONG (trực giác) | Thực tế (đo) | Kết |
|---|---|---|---|
| 1 Shared reward claim | FOR UPDATE chậm nhất · Redis nhanh nhất | **naive chậm nhất** · FOR UPDATE không chậm · Redis nhanh nhất | BUST |
| 2 Hero config | Mongo nhanh mọi hướng · backfill nhanh = tốt | đọc ngược cần index · **migration rewrite chặn reader** | BUST |
| 3 Leaderboard | Redis đọc nhanh hơn ~200x | đọc **ngang** PG (có index) · Redis thắng **write** | BUST |
| 4 Match history | Scylla nhanh hơn mọi mặt | write thắng · read **ngang** · ad-hoc **từ chối** | BUST một phần |
| 5 Analytics | ClickHouse nhanh hơn cho aggregate | đúng (~10-46x) — nhưng **điểm là tách OLTP**, không phải tốc độ | CONFIRM (pivot) |

> Thông điệp xuyên suốt: **không DB nào thắng mọi workload** — chọn theo access pattern, và **đo trên hệ của mình**, đừng tin số trên blog.
