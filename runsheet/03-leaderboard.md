# Demo 3 — Leaderboard realtime (12–15 phút)

← [Demo 2](02-hero-config.md) · [Index](README.md) · Demo 4 → [Analytics](04-analytics.md)

**Trục:** read model vs truth → "Redis đọc nhanh hơn 200x?" → **busted** (PG có index ngang Redis) → Redis thắng *write throughput* + tách OLTP → pattern read-model-vs-truth.

**Lệnh:**
```bash
npm run demo:3   # 100K update + top-10 đọc (idle & dưới spike) · Postgres vs Redis Sorted Set
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–2:30 | Slide D3 + bảng "2 yêu cầu giống mà khác" | "Realtime display (nhanh, sai 1 bậc ok) vs Settlement cuối season (đúng tuyệt đối, có audit). Đây là **read model vs truth**." |
| 2:30–3:30 | KY VONG "Redis đọc top-N nhanh hơn ~200x · PG spike 500ms-1s" | "Trực giác: Redis đọc nhanh áp đảo. Đo nhé." |
| 3:30–7:00 RUN | `npm run demo:3` | **Busted:** "Có index `(score DESC)`, PG đọc top-10 **ngang Redis** — kể cả dưới write spike. '200x' là **myth**." |
| 7:00–9:30 | Chỉ vào dòng write throughput | "Khác biệt thật: Redis **write ~5x** + tách tải leaderboard khỏi OLTP. Đừng thêm Redis vì sợ *đọc* chậm." |
| 9:30–12:00 | Slide pattern read-model + truth | "Mỗi trận: PG ghi battle result (truth, audit) + Redis ZADD (read model). Cuối season tính reward **từ Postgres**. Lệch → PG thắng." |
| 12:00–13:30 | Takeaway | "Read model và truth không nhất thiết cùng chỗ. Câu hỏi: phần nào *đúng tuyệt đối*, phần nào *nhanh tuyệt đối*." |

**Hệ quả đẹp (nói nếu còn giờ):** Redis crash mất leaderboard cũng không sao — nó chỉ là read model, rebuild từ battle_results trong PG. Cái "✗ restart mất data" hết đáng sợ trong kiến trúc này.

**Quyết định "perfect":** đây là demo dễ "xẹp" vì read bị busted — **đừng bán tốc độ đọc**, bán **write throughput + tách OLTP + read-model-vs-truth**. Trung thực về việc PG ngang Redis tăng độ tin cậy.

**Câu nối → Demo 4:** "Demo 3 tách *read model* khỏi *truth*. Demo 4 tách *analytics* khỏi *transaction*."
