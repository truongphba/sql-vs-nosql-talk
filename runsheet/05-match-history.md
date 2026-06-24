# Demo 5 — Match history: Postgres vs ScyllaDB (wide-column) (12–15 phút)

← [Demo 4](04-analytics.md) · [Index](README.md)

**Trục:** "Scylla nhanh hơn mọi mặt" → write *thắng thật* → read *ngang* (ơ?) → ad-hoc *bị từ chối* (à há — **hợp đồng khác**, không phải "nhanh hơn").

**Lệnh (seed một lần, rồi từng phần):**
```bash
npm run demo:5:seed      # ghi 200K event — write throughput (~6s)
npm run demo:5:read      # last-50 partition read
npm run demo:5:contract  # ad-hoc → Scylla TỪ CHỐI
# CQL/SQL tay: demos/05-match-history/queries.cql
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–1:30 | Slide D5 + approach · **callback Discord** | "Nhớ Discord đầu buổi? Hàng nghìn tỷ message append-only → họ dừng ở **ScyllaDB**. Pixiland có match history y vậy." |
| 1:30–2:30 | KY VONG "Scylla nhanh hơn mọi mặt" | "Trực giác: NoSQL nhanh hơn write + read + mọi query. Giữ dự đoán đó." |
| 2:30–4:30 WRITE | `demo:5:seed` → bảng throughput | "Scylla **~2.7x** write trên 1 node — shard-per-core, LSM append. Win **thật**." |
| 4:30–6:00 READ | `demo:5:read` | "Đọc 'last 50'? **Ngang nhau** (~0.2ms). PG index · Scylla clustering. Đừng tin 'NoSQL đọc nhanh hơn'." |
| 6:00–9:00 CONTRACT ⭐ | `demo:5:contract` → dòng **TỪ CHỐI** | "Query ad-hoc theo opponent (không phải partition key): Postgres thêm index là xong; Scylla **TỪ CHỐI** — `use ALLOW FILTERING`. Wide-column **không cho** query tuỳ ý." |
| *(tuỳ chọn)* | DataGrip `queries.cql` | Chạy `WHERE opponent=1` → đỏ InvalidRequest; `DESCRIBE TABLE` partition vs clustering key. |
| 9:00–10:30 | Caveat trung thực | "1 node + dev-mode. Thế mạnh THẬT của Scylla — **scale-out tuyến tính + HA** — không demo trên 1 máy được. Đó mới là lý do Discord chọn." |
| 10:30–12:00 | Takeaway | "Wide-column không 'nhanh hơn SQL' — là **hợp đồng khác**: đổi JOIN/ad-hoc lấy write scale-out + partition read. Bạn có biết TRƯỚC mình sẽ query thế nào không?" |

**Quyết định "perfect":** cao trào là khoảnh khắc **TỪ CHỐI** (không phải con số). Đừng oversell read (nói thẳng "ngang"). Caveat 1-node **bắt buộc** nói trước để khỏi bị bắt bẻ "single-node không công bằng".
