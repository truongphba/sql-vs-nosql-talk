# Demo 5 — Analytics: Postgres vs ClickHouse (12–15 phút)

← [Demo 4](04-match-history.md) · [Index](README.md)

**Trục (demo CONFIRM duy nhất):** "ClickHouse nhanh hơn?" — đúng (~10-46x) → "nhưng đó KHÔNG phải câu hỏi" → câu hỏi thật: **có nên để aggregate nặng tranh CPU/IO với người chơi không?** Mở bằng confirm, đóng bằng kiến trúc.

**Lệnh:**
```bash
npm run demo:5   # 5M battle_logs · 3 aggregate · Postgres vs ClickHouse
# SQL tay (DataGrip): demos/05-analytics/queries.sql (xem data ClickHouse tận tay)
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–2:00 | Slide D5 + OLTP vs OLAP | "Admin cần DAU/win rate/region. 50-100M rows. OLTP (point query, index) và OLAP (scan cả cột) **ngược nhau** — không tối ưu cùng lúc." |
| 2:00–3:00 | KY VONG "ClickHouse nhanh hơn ~10-40x" | "Lần này trực giác **đúng** — nhưng tôi sẽ cho thấy tốc độ KHÔNG phải bài học." |
| 3:00–6:00 RUN | `npm run demo:5` | "ClickHouse ~10-46x. `count(distinct)` ở DAU chênh nhất (~46x, quét 1 cột thay vì cả hàng). Confirmed. ... Giờ là phần quan trọng." |
| 6:00–9:30 PIVOT ⭐ | Chỉ dòng cuối `Chạy chung OLTP?` | "Không phải 'ClickHouse nhanh hơn'. Mà: chạy aggregate này **trên Postgres** = tranh CPU/IO/buffer cache với transaction người chơi → game lag đúng giờ peak. Tách engine → analytics không đụng production." |
| *(tuỳ chọn)* ⭐ | DataGrip → ClickHouse · **lộ columnar** | "DataGrip xem hàng×cột nhìn **giống hệt** Postgres — khác biệt ở storage." Chạy `system.columns`: cột `day` nén **~200x** (sắp xếp theo ORDER BY) vs `player_id` ~1x (random). `system.parts`: 1.1M row chỉ **137 marks**, PK in-mem **~800 byte** (sparse index, không index từng row). Tổng đĩa **~43 MiB vs PG ~249 MB**. Query sẵn ở queries.sql mục (A)(B)(C). |
| 9:30–12:00 | Slide điều kiện | "'Không đụng OLTP' chỉ đúng khi data **đã** ở layer riêng: Parquet export / CDC / read-replica. Và **khâu sync cũng tốn** — off-peak / replica." |
| 12:00–13:30 | Takeaway | "Câu hỏi không phải query *chạy được không* — mà *có nên* để analytics trên OLTP không. Tách = quyết định **kiến trúc**." |

**Về contention (nếu bị hỏi "đo được không?"):** contention = tranh tài nguyên dùng chung (CPU · I/O · **buffer cache** · connection). Trên localhost **không đo ra** (OLTP table nhỏ + cached + dư core); production mới lộ (working set lớn không vừa cache). → giữ ở mức luận điểm, **không ép số giả** trên sân khấu.

**Quyết định "perfect":** mở bằng confirm (số đẹp), **đóng bằng kiến trúc** (dòng `Chạy chung OLTP?` + slide điều kiện). Nếu chỉ dừng ở "46x" thì demo vô vị. Gọi tên: "phần lớn demo lật trực giác — riêng cái này xác nhận, để rồi nói tốc độ không phải vấn đề."

**Câu nối → Pitfalls:** "Tách OLAP khỏi OLTP là quyết định kiến trúc. Giờ xem điều gì xảy ra khi những kiến trúc đẹp này gặp thực tế — các pitfall hay vấp."
