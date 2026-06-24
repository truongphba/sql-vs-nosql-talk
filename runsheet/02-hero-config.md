# Demo 2 — Hero / building config (15–18 phút)

← [Demo 1](01-house-contention.md) · [Index](README.md) · Demo 3 → [Leaderboard](03-leaderboard.md)

**Trục:** Layer 1 read patterns (Mongo nhanh mọi hướng? → đọc ngược cần index, `$lookup` đắt) → Layer 2 schema evolution (backfill nhanh = tốt? → **đo lock**, PG rewrite chặn reader) → bằng chứng `pg_locks`.

**Lệnh (seed một lần, rồi chạy từng layer):**
```bash
npm run demo:2:seed     # nạp 100K hero (~10s)
npm run demo:2:layer1   # read patterns
npm run demo:2:layer2   # schema evolution (lock dưới tải)
npm run demo:2:lock     # bằng chứng pg_locks
npm run db:size         # so disk norm vs jsonb (embed trả giá storage)
# SQL tay: demos/02-hero-config/queries.sql
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–2:00 | Slide D2 + approach (3 card) | "Hero config nested + kèm owner, evolve mỗi tuần. PG thuần vs JSONB vs Mongo." |
| 2:00–3:00 | `demo:2:seed` (nền) | Trong lúc seed: giới thiệu whale skew (10% user giữ 75% hero). |
| 3:00–6:30 LAYER 1 | KY VONG "Mongo nhanh mọi hướng" → `demo:2:layer1` | "Xuôi: 1 doc thắng. **Ngược: có index PG ngang, MẤT index Mongo `$lookup` ~27ms đắt nhất.** 'Mongo nhanh mọi hướng' bị lật." |
| 6:30–7:30 DISK | `npm run db:size` | "Embed trả giá: `pixiland_jsonb` lớn hơn norm ~1.5-1.7× vì duplicate snapshot." |
| 7:30–11:00 LAYER 2 ⭐ | KY VONG "backfill nhanh = tốt" → `demo:2:layer2` | **Part A:** đọc `trait` trên data cũ → PG **ERROR no column** (buộc ALTER) vs JSONB/Mongo **null** (lazy, 0 migration). **Part B:** PG rewrite *nhanh hơn* nhưng giữ `ACCESS EXCLUSIVE` → **6/6 reader kẹt**; JSONB/Mongo không block. |
| 11:00–13:00 LOCK | `demo:2:lock` (hoặc DataGrip 3-session trên `heroes`) | In `pg_locks`: 1 `AccessExclusiveLock granted=t` + 6 `AccessShareLock granted=f (waiting)`. "Khoá có thật." |
| 13:00–15:00 | Trade-off + takeaway | "Không storage nào thắng mọi access pattern. JSONB là sweet spot: flexible + vẫn JOIN. Mongo khi document là access pattern chính." |

**Vì sao PG rewrite chặn mà JSONB không:** `ADD COLUMN NOT NULL DEFAULT (tính per-row)` → **rewrite toàn bảng** → `ACCESS EXCLUSIVE` chặn cả reader suốt thời gian đó. JSONB/Mongo thêm field = ghi vào blob, **không rewrite**. (Nullable ADD COLUMN ở PG 11+ thì rẻ — cái khoá là rewrite/scan: đổi type, SET NOT NULL, validate constraint.)

**Quyết định "perfect":** Layer 2 là cao trào — đừng đo "backfill nhanh/chậm" (PG thắng → sai narrative); đo **lock dưới tải**. Câu chốt: "nhanh trên giấy ≠ an toàn khi đang live."

**Câu nối → Demo 3:** "Config là *đọc xuôi*. Tiếp theo: leaderboard — *read model* tách khỏi *truth*."
