# Pixiland DB Talk — SQL vs NoSQL

Tài liệu + slide + **demo chạy thật** cho buổi tech talk *"SQL vs NoSQL — chọn storage theo workload, consistency và scale"*, dùng case study **Pixiland** (game GameFi, 1M user / 50K DAU).

Thông điệp xuyên suốt: **không có DB nào thắng mọi bài toán** — chọn theo *workload · consistency · access pattern · scale bottleneck*. Và: **đo, đừng đoán** — benchmark trên hệ của mình, vì vài "sự thật" quen thuộc sai ở scale thật.

## Nội dung

| Phần | Mô tả |
|---|---|
| [`pixiland-db-talk.md`](pixiland-db-talk.md) | Kịch bản đầy đủ (source of truth): Hook → Pixiland → bản đồ SQL/NoSQL → Demo 1–5 → Pitfalls → Decision Framework → Q&A |
| [`runsheet/`](runsheet/) | Runsheet đứng nói — mỗi demo 1 file (trục cảm xúc · làm gì/nói gì theo phút · choreography KY VONG). Xem [runsheet/README.md](runsheet/README.md) |
| [`presentation/`](presentation/) | Deck reveal.js — 46 slide, no-build (mở `index.html` là chạy). Xem [presentation/README.md](presentation/README.md) |
| [`demos/`](demos/) | 5 demo CLI chạy thật, in bảng benchmark |
| `docker-compose.yml` | Postgres + Redis + MongoDB + ScyllaDB + ClickHouse |

## Yêu cầu

- Node ≥ 20 · Docker + Docker Compose
- Port host dùng **lệch chuẩn** để tránh đụng service local: Postgres `55432` · Redis `56379` · Mongo `57017` · ScyllaDB `59042` · ClickHouse `58123` (HTTP) / `59000` (native)
- ScyllaDB (Demo 5) **nặng** (~2GB RAM, khởi động ~20-30s) — `db:up` chờ healthy lâu hơn; chạy `developer-mode` nên số chỉ minh hoạ
- ClickHouse (Demo 4): user/pass `pixi`/`pixi`, DB `default` — DataGrip nối `localhost:58123` (HTTP) hoặc `59000` (native) để xem data

## Chạy demo

```bash
npm install
npm run db:up        # lên Postgres + Redis + Mongo + ScyllaDB + ClickHouse (chờ healthy — Scylla lâu nhất)

npm run demo:1       # house contention — in hướng dẫn từng case
npm run demo:1:naive       # case A: race condition (nhiều winners)
npm run demo:1:for-update  # case B: FOR UPDATE
npm run demo:1:redis       # case C: Redis SET NX
npm run demo:1:all         # cả 3 case + bảng tổng
# SQL chạy tay (DataGrip): demos/01-house-contention/queries.sql
npm run demo:2       # Hero config — full run (seed + Layer 1 + Layer 2)
npm run demo:2:seed        # nạp 100K hero (chạy 1 lần đầu buổi)
npm run demo:2:layer1      # Layer 1 — read patterns (xuôi / ngược / index)
npm run demo:2:layer2      # Layer 2 — schema evolution (lock dưới tải)
npm run demo:2:lock        # bằng chứng lock: ALTER rewrite giữ ACCESS EXCLUSIVE, chặn reader (in pg_locks)
# SQL chạy tay (DataGrip): demos/02-hero-config/queries.sql
npm run demo:3       # Leaderboard — Postgres vs Redis Sorted Set
npm run demo:4       # Analytics — Postgres vs ClickHouse
# SQL chạy tay (DataGrip): demos/04-analytics/queries.sql
npm run demo:5       # Match history (wide-column) — Postgres vs ScyllaDB (full)
npm run demo:5:seed        # ghi 200K event (đo write throughput)
npm run demo:5:read        # last-50 partition read
npm run demo:5:contract    # query-first contract: ad-hoc Scylla từ chối
# CQL/SQL chạy tay (DataGrip): demos/05-match-history/queries.cql

npm run db:size      # xem dung lượng DB (sau Demo 2)
npm run db:down      # dọn sạch (xoá volume)
```

Mỗi demo tự reset state đầu run nên chạy lại nhiều lần đều nhất quán. **Một lần `db:up` cho cả buổi** — không cần restart Docker giữa các demo. Demo 2 dùng 2 DB Postgres (`pixiland_norm`, `pixiland_jsonb`); demo 1/3/4 dùng `pixiland`; demo 5 dùng Postgres + keyspace `pixiland` trên ScyllaDB.

## Xem slide

Mở `presentation/index.html` bằng trình duyệt (cần mạng lần đầu để load reveal.js + font qua CDN).
`←/→` chuyển slide/bước · `F` fullscreen · `Esc` overview. Lời thoại + timing xem ở `pixiland-db-talk.md`.

## 5 demo & kết quả thật (localhost — số thay đổi theo máy)

Mỗi demo *đoán trước* rồi *chạy thật*. Phần lớn kết quả **khác trực giác**:

| Demo | Workload | Kết quả | Verdict |
|---|---|---|---|
| **1** House contention | coordination / race | naive ~80–96 winner (FAIL) **& chậm nhất** · FOR UPDATE & Redis đúng 1 | naive vẫn lock ở UPDATE → FOR UPDATE **không** chậm nhất |
| **2** Hero config | xuôi vs ngược vs JOIN vs migration | Mongo thắng xuôi · SQL thắng JOIN/ngược · migration rewrite PG **chặn reader** | **JSONB sweet spot**; đo lock, đừng đo backfill |
| **3** Leaderboard | read model vs truth | Redis write ~5x nhanh hơn · đọc top-N **ngang** PG (có index) | Redis thắng *write*, không phải *read* |
| **4** Analytics | OLAP scan | ClickHouse ~10–46x cho aggregate | Đúng như nghĩ — tách OLAP khỏi OLTP |
| **5** Match history | wide-column write-heavy | Scylla write ~2.3x · partition read **ngang** PG · ad-hoc Scylla **từ chối** | wide-column = hợp đồng khác, không "nhanh hơn mọi mặt" |

> Bài học: dùng đúng DB cho đúng workload, **và verify bằng benchmark** — đừng tin số trên blog người khác.

## Stack Pixiland (5 vai trò · 3 engine)

| Engine | Vai trò |
|---|---|
| PostgreSQL | transactional truth (user, wallet, NFT, battle result) |
| PostgreSQL JSONB | flexible config (hero, building) |
| Redis | coordination (house lock) + read model (leaderboard Sorted Set) |
| ClickHouse / DuckDB | analytics layer (dashboard, win rate, DAU) |

MongoDB **không** nằm trong stack — JSONB đã đủ; chỉ thêm khi document là access pattern chính.
ScyllaDB/Cassandra (wide-column) cũng vậy — chỉ thêm khi match-history/event write-heavy vượt sức 1 node Postgres (xem Demo 5).

## Cấu trúc

```
pixiland-db-talk.md      # kịch bản (source of truth)
presentation/            # slide reveal.js
demos/01-05/             # demo code (demo 2 & 5 tách script nhỏ; có queries.sql/.cql)
src/db/                  # factory: pg · redis · mongo · clickhouse · scylla
src/lib/                 # table (in bảng) · timer · env
docker-compose.yml
```
