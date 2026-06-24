# Demo 3 — Leaderboard realtime (12–15 phút)

← [Demo 2](02-hero-config.md) · [Index](README.md) · Demo 4 → [Match history](04-match-history.md)

**Trục:** cùng INSERT battle mỗi trận → so **PG UPSERT LB** vs **PG battle + Redis LB** → tách read model.

**Lệnh:**
```bash
npm run demo:3   # 60K trận · 40 reader spike · 2 cột
```

| Phút | Làm gì | Nói gì / điểm nhấn |
|---|---|---|
| 0:00–2:30 | Slide D3 + read model vs truth | "Display vs Settlement. Cả hai approach đều ghi battle — **công bằng**." |
| 2:30–3:30 | APPROACHES (2 bậc) | "01: rank + display trên PG. 02: battle PG, rank Redis. **Chỉ khác chỗ rank & đọc top-N.**" |
| 3:30–3:45 | KY VONG "cùng audit thì tách Redis không khác" | "Nghe hợp lý. Đo." |
| 3:45–7:30 RUN | `npm run demo:3` | Spike = **40 client refresh top-10** song song flood trận. **PG ~3ms vs Redis ~0.8ms** — vì cột trái đọc PG lúc PG đang battle+UPSERT; cột phải đọc Redis only. |
| 8:00–10:00 | Slide pattern | Khớp cột phải: battle PG + Redis display. Reward từ `battle_results`. |
| 10:00–13:30 | Takeaway | "Không phải Redis *hay* PG — **phần nào audit, phần nào display**." |

**Terminal — 2 cột:**
1. **PG BATTLE + UPSERT LB** — anti-pattern có audit.
2. **PG BATTLE + REDIS LB** — pattern production.

**Câu nối → Demo 4:** "Battle log append-only ở quy mô lớn → wide-column."
