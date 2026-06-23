# Pixiland DB Talk — SQL vs NoSQL

Tài liệu + slide + **demo chạy thật** cho buổi tech talk *"SQL vs NoSQL — chọn storage theo workload, consistency và scale"*, dùng case study **Pixiland** (game GameFi, 1M user / 300K MAU).

Thông điệp xuyên suốt: **không có DB nào thắng mọi bài toán** — chọn theo *workload · consistency · access pattern · scale bottleneck*. Và: **đo, đừng đoán** — benchmark trên hệ của mình, vì vài "sự thật" quen thuộc sai ở scale thật.

## Nội dung

| Phần | Mô tả |
|---|---|
| [`pixiland-db-talk.md`](pixiland-db-talk.md) | Kịch bản đầy đủ (source of truth): Hook → Pixiland → bản đồ SQL/NoSQL → Demo 1–4 → Pitfalls → Decision Framework → Q&A |
| [`presentation/`](presentation/) | Deck reveal.js — 46 slide, no-build (mở `index.html` là chạy). Xem [presentation/README.md](presentation/README.md) |
| [`demos/`](demos/) | 4 demo CLI chạy thật, in bảng benchmark |
| `docker-compose.yml` | Postgres + Redis + MongoDB (DuckDB chạy in-process) |

## Yêu cầu

- Node ≥ 20 · Docker + Docker Compose
- Port host dùng **lệch chuẩn** để tránh đụng service local: Postgres `55432` · Redis `56379` · Mongo `57017`

## Chạy demo

```bash
npm install
npm run db:up        # lên Postgres + Redis + Mongo (chờ healthy)

npm run demo:1       # House contention — race condition
npm run demo:2       # Hero config — normalized vs JSONB vs MongoDB
npm run demo:3       # Leaderboard — Postgres vs Redis Sorted Set
npm run demo:4       # Analytics — Postgres vs DuckDB

npm run db:down      # dọn sạch (xoá volume)
```

Mỗi demo tự reset state đầu run nên chạy lại nhiều lần đều nhất quán.

## Xem slide

Mở `presentation/index.html` bằng trình duyệt (cần mạng lần đầu để load reveal.js + font qua CDN).
`←/→` chuyển slide/bước · `F` fullscreen · `Esc` overview. Lời thoại + timing xem ở `pixiland-db-talk.md`.

## 4 demo & kết quả thật (localhost — số thay đổi theo máy)

Mỗi demo *đoán trước* rồi *chạy thật*. 3/4 lần kết quả **khác trực giác**:

| Demo | Workload | Kết quả | Verdict |
|---|---|---|---|
| **1** House contention | coordination / race | naive ~80–96 winner (FAIL) · FOR UPDATE & Redis đúng 1 · Redis ~3ms | FOR UPDATE **không** phải chậm nhất |
| **2** Hero config | flexible schema | insert/query cả 3 ngang nhau ở 10K | **JSONB đủ**, không cần MongoDB |
| **3** Leaderboard | read model vs truth | Redis write ~5x nhanh hơn · đọc top-N **ngang** PG (có index) | Redis thắng *write*, không phải *read* |
| **4** Analytics | OLAP scan | DuckDB ~10–30x cho aggregate | Đúng như nghĩ — tách OLAP khỏi OLTP |

> Bài học: dùng đúng DB cho đúng workload, **và verify bằng benchmark** — đừng tin số trên blog người khác.

## Stack Pixiland (5 vai trò · 3 engine)

| Engine | Vai trò |
|---|---|
| PostgreSQL | transactional truth (user, wallet, NFT, battle result) |
| PostgreSQL JSONB | flexible config (hero, building) |
| Redis | coordination (house lock) + read model (leaderboard Sorted Set) |
| DuckDB / ClickHouse | analytics layer (dashboard, win rate, DAU) |

MongoDB **không** nằm trong stack — JSONB đã đủ; chỉ thêm khi document là access pattern chính.

## Cấu trúc

```
pixiland-db-talk.md      # kịch bản (source of truth)
presentation/            # slide reveal.js
demos/01-04/             # demo code (1 file/demo)
src/db/                  # factory: pg · redis · mongo · duck
src/lib/                 # table (in bảng) · timer · env
docker-compose.yml
```
