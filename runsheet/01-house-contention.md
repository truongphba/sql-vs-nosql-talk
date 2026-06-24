# Demo 1 — House contention / Race condition (12–15 phút)

← [Runsheet index](README.md) · Demo 2 → [Hero config](02-hero-config.md)

**Trục:** Race condition (đau) → FOR UPDATE (đúng nhưng có giá) → Redis (nhanh) → "Redis không phải silver bullet" → kết hợp cả hai.

**Lệnh:**
```bash
npm run demo:1:naive · demo:1:for-update · demo:1:redis · demo:1:all
# SQL tay: demos/01-house-contention/queries.sql (race 2-session + FOR UPDATE + pg_locks)
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–1:30 | Slide D1 + KY VONG | "100 request đập 1 house trống. Đoán: FOR UPDATE chậm nhất, naive lệch vài winner nhưng nhanh, Redis nhanh nhất." |
| 1:30–4:00 BUG | `demo:1:naive` → ~86 winners | Lặng 3-4s. "86/100 cùng tưởng thắng — không phải chậm, mà **sai**. Oversubscribed." |
| *(tuỳ chọn)* | DataGrip Case A 2-session | A1/B1 đều SELECT thấy NULL → A2/B2 cùng UPDATE → cả hai tưởng thắng. Race **sờ được**. |
| 4:00–6:30 FIX | `demo:1:for-update` → 1 winner | Chỉ `min/avg/p95/max`. "Đúng 1 winner. Cái giá: request sau xếp hàng sau row lock → đuôi dài." |
| *(tuỳ chọn)* | DataGrip Case B 3-session | console 2 `FOR UPDATE` **treo**; console 3 `pg_blocking_pids` → blocked_by. "Lock có thật." |
| 6:30–8:00 | `demo:1:redis` → 1 winner, phẳng | "Atomic tại Redis, không queue. Latency phẳng." |
| 8:00–9:30 REVEAL | Đối chiếu KY VONG | **Cú twist:** naive lại **chậm nhất** — `min` naive (~73ms) > `max` FOR UPDATE (~37ms). |
| 9:30–12:30 TWIST | Slide "không silver bullet" + flow | "Redis crash trước khi ghi PG → lệch. Cứu: **PG là truth** + **TTL** chặn kẹt. Lệch luôn bounded." |
| 12:30–13:30 | Takeaway | "Redis = coordination ngắn hạn. Postgres = truth. Đừng đảo vai." |

**Vì sao naive chậm nhất (giải thích nếu bị hỏi):** mọi `UPDATE` đều tự lấy **row write-lock**; naive để ~86 request cùng vượt check NULL rồi cùng ghi → **86 lần ghi serialize** + MVCC bloat + 86 commit. FOR UPDATE giành lock sớm ở SELECT → 99/100 bỏ cuộc trước khi ghi, chỉ 1 lần `UPDATE`. Ít ghi hơn ⇒ nhanh hơn.

**Quyết định "perfect":** dẫn cảm xúc theo **bug trước, fix sau**; terminal lo số, DataGrip chỉ 1-2 khoảnh khắc trực quan; kẹt giờ thì bỏ DataGrip.

**Câu nối → Demo 2:** "Race là về *ghi tranh nhau*. Tiếp theo: dữ liệu *hình dạng linh hoạt* lưu sao."
