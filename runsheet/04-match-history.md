# Demo 4 — Match history: Postgres vs ScyllaDB (wide-column) (12–15 phút)

← [Demo 3](03-leaderboard.md) · [Index](README.md) · Demo 5 → [Analytics](05-analytics.md)

**Trục:** "Scylla nhanh hơn mọi mặt" → write *thắng thật* → read *ngang* (ơ?) → ad-hoc *bị từ chối* (à há — **hợp đồng khác**, không phải "nhanh hơn").

**Lệnh (seed một lần, rồi từng phần):**
```bash
npm run demo:4:seed      # ghi 200K event — write throughput (~6s)
npm run demo:4:read      # last-50 partition read
npm run demo:4:contract  # ad-hoc → Scylla TỪ CHỐI
# CQL/SQL tay: demos/04-match-history/queries.cql
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–1:30 | Slide D4 + approach · **callback Discord** | "Nhớ Discord đầu buổi? Hàng nghìn tỷ message append-only → họ dừng ở **ScyllaDB**. Game của mình có match history y vậy." |
| 1:30–2:30 | KY VONG "Scylla nhanh hơn mọi mặt" | "Trực giác: NoSQL nhanh hơn write + read + mọi query. Giữ dự đoán đó." |
| 2:30–5:30 WRITE | `demo:4:seed` → bảng throughput | "Scylla **~2.7x** write trên 1 node — shard-per-core, LSM append. Win **thật**." |
| 5:30–7:00 READ | `demo:4:read` | "Đọc 'last 50'? **Ngang nhau** (~0.2ms). PG index · Scylla clustering. Đừng tin 'NoSQL đọc nhanh hơn'." |
| 7:00–9:30 CONTRACT ⭐ | `demo:4:contract` → dòng **TỪ CHỐI** | "Query ad-hoc theo opponent (không phải partition key): Postgres thêm index là xong; Scylla **TỪ CHỐI** — `use ALLOW FILTERING`. Wide-column **không cho** query tuỳ ý." |
| *(tuỳ chọn)* | DataGrip `queries.cql` | Chạy `WHERE opponent=1` → đỏ InvalidRequest; `DESCRIBE TABLE` partition vs clustering key. |
| 9:30–10:30 | Slide **STORAGE LAYOUT** (sau benchmark) | "Vừa thấy số — giờ giải **tại sao**: DataGrip cột giống nhau; PG = heap + index (ctid); Scylla = partition + clustering. Reveal query OK vs từ chối." |
| 10:30–11:30 | Slide **SCALE-OUT · DIAGRAM ONLY** | "Demo local chỉ 1 node. PG → sharding thủ công; Scylla **+ node → + write**. Diagram thay production cluster." |
| 10:30–12:00 | Takeaway | "Wide-column không 'nhanh hơn SQL' — là **hợp đồng khác**: đổi JOIN/ad-hoc lấy write scale-out + partition read. Bạn có biết TRƯỚC mình sẽ query thế nào không?" |

**Quyết định "perfect":** cao trào là khoảnh khắc **TỪ CHỐI** (không phải con số). Đừng oversell read (nói thẳng "ngang"). Caveat 1-node **bắt buộc** nói trước để khỏi bị bắt bẻ "single-node không công bằng".

**Câu nối → Demo 5:** "Đã ghi nhanh cả núi event (match history). Vậy giờ **đọc / tổng hợp** đống dữ liệu lớn đó thế nào cho dashboard? → analytics."
