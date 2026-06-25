# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Dự án là gì

Đây là repo phục vụ một **buổi tech talk nội bộ**: *"SQL vs NoSQL — chọn storage theo workload, consistency và scale"*, dùng case study **một live game platform** (1M user / 50K DAU). Mục tiêu cuối là đứng trình bày được + chạy demo thật.

Repo gồm 3 phần, làm theo thứ tự:

1. **Kịch bản** — `pixiland-db-talk.md`. Đây là **source of truth** của toàn bộ buổi. Đang hoàn thiện.
2. **Trang present** — slide `reveal.js` được **gen ra từ kịch bản**. Nội dung slide phải bám sát kịch bản.
3. **Demo code** — code chạy thật từng demo trong kịch bản (race condition, config schema, leaderboard, analytics) để demo live.

> Quy tắc vàng: **kịch bản dẫn dắt mọi thứ.** Slide và demo phải nhất quán với kịch bản. Nếu demo cho ra số khác bảng benchmark trong kịch bản → cập nhật kịch bản (và báo cho người dùng), đừng để hai nơi lệch nhau.

## Tech stack

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ demo | TypeScript / Node.js (Node 20+) |
| Chạy script TS | `tsx` (chạy trực tiếp, không cần build) |
| Package manager | `npm` (default — đổi được nếu muốn) |
| Database runtime | Docker Compose (Postgres + MongoDB + Redis + ScyllaDB + ClickHouse) |
| Slide present | reveal.js (nhận markdown, code highlight, speaker notes) |
| Kiểu demo | CLI script — in ra bảng winners / latency / correctness đúng như bảng benchmark trong kịch bản |

5 DB và vai trò (xem chi tiết ở phần "Decision Framework" trong kịch bản):
- **PostgreSQL** — transactional truth, ACID, JSONB cho flexible config
- **Redis** — coordination ngắn hạn (SET NX), read model (Sorted Set)
- **MongoDB** — document model, so sánh với JSONB
- **ClickHouse** — OLAP columnar server, aggregate scan/analytics (Demo 5); DuckDB là lựa chọn in-process nhẹ hơn cùng họ
- **ScyllaDB** — wide-column (CQL/Cassandra-compatible), write-heavy append + partition read (Demo 4)

## Cấu trúc repo (đề xuất — tạo dần khi làm)

```
.
├── pixiland-db-talk.md        # SOURCE OF TRUTH — kịch bản buổi nói
├── CLAUDE.md
├── docker-compose.yml         # Postgres + Mongo + Redis + ScyllaDB + ClickHouse
├── package.json
├── presentation/              # slide reveal.js (gen từ kịch bản)
│   └── index.html
├── runsheet/                  # timing + lời nói từng demo (presenter cheat sheet)
├── src/
│   ├── db/                    # connection helper dùng chung cho các demo
│   └── lib/                   # env, timer, table (terminal), progress (spinner)
└── demos/
    ├── 01-reward-claim/       # Demo 1 — shared reward claim / race condition
    ├── 02-hero-config/        # Demo 2 — schema / JSONB / Mongo
    ├── 03-leaderboard/        # Demo 3 — PG monolith vs PG battle + Redis (cùng audit)
    ├── 04-match-history/      # Demo 4 — wide-column ScyllaDB vs Postgres
    └── 05-analytics/          # Demo 5 — ClickHouse vs Postgres OLAP
```

Mỗi demo nên có `npm run demo:1` ... `demo:5` để chạy nhanh khi đứng nói.

## Quy ước viết demo (quan trọng cho việc trình bày live)

- **Lặp lại được:** mỗi script tự reset state đầu run (TRUNCATE bảng / `FLUSHDB` / xoá collection) để chạy nhiều lần trên sân khấu không bị bẩn data.
- **Nhanh:** ưu tiên vài giây–~20s mỗi demo. Ngoại lệ chấp nhận được: Demo 3 (~25–35s, spike load), Demo 5 seed 5M rows (~vài chục giây). Đang trình bày — tránh chờ im lặng không feedback.
- **Có loading khi chạy lâu:** dùng `src/lib/progress.ts` (`withSpinner`, `runPoolWithSpinner`, `runConcurrentWithSpinner`). Spinner trên **stderr**; bảng kết quả in **stdout** — không đè nhau. Non-TTY (pipe/CI) fallback `…` / `✓`.
- **Output là điểm nhấn:** in ra **bảng so sánh** (approach × winners × latency × correctness) trông giống bảng trong kịch bản, để khán giả đối chiếu slide ↔ terminal.
- **Số benchmark trong kịch bản là mục tiêu minh hoạ**, không phải con số phải khớp tuyệt đối. Demo thật chỉ cần **cùng order-of-magnitude** và **đúng về mặt định tính** (vd Redis nhanh hơn ~10x, Postgres FOR UPDATE đúng nhưng chậm hơn). Nếu lệch xa → chỉnh kịch bản cho khớp thực tế.
- **Mỗi demo tự chứa:** đọc config DB từ env/`.env`, không hardcode credential rải rác.

## Quy ước nội dung

- **Ngôn ngữ:** nội dung (kịch bản, slide) viết **tiếng Việt**, giữ thuật ngữ kỹ thuật bằng tiếng Anh như hiện tại (ACID, JSONB, Sorted Set, OLTP/OLAP...).
- **Độ chính xác kỹ thuật:** đây là talk cho dev — số liệu/khẳng định phải đúng, kẻo bị bắt bẻ. Khi nêu ví dụ công ty (Instagram, Discord...), số minh hoạ thì nói rõ là xấp xỉ. Kịch bản đã có sẵn các "ghi chú độ chính xác" — giữ tinh thần đó.
- **Giọng văn kịch bản:** súc tích, có timing từng phase, có khối "Takeaway" dạng code block. Khi thêm nội dung mới, theo đúng format đang có.

## Design system (slide — `presentation/`)

Hướng **Pixel / Game (disciplined)**. Token gốc nằm ở đầu `presentation/theme.css` — Phase sau bám file này, đừng đặt màu/font rời.

- **Màu:** nền `--bg #161426` (tối, không đen tuyền) · brand `--accent #FFC53D` (coin gold). Mỗi DB một màu signature dùng xuyên deck: Postgres `#3D9BE9` · Redis `#E5484D` · MongoDB `#13AA52` · ScyllaDB `#8A6BFF` · ClickHouse `#FF8C42` (phụ: DuckDB `#F2C94C`/MySQL/Cassandra/Oracle).
- **Font 3 vai trò:** Be Vietnam Pro 800 (tiêu đề VN) · JetBrains Mono (body/data) · Press Start 2P (accent).
- ⚠ **Press Start 2P chỉ dùng cho ASCII** (eyebrow tiếng Anh, số, "VS", tên DB). KHÔNG đặt chữ có dấu tiếng Việt vào pixel font → vỡ glyph. Vì vậy eyebrow/label viết tiếng Anh (OBJECTIVES, THE PARADOX...).
- **Signature:** "DB chip" (badge viền pixel theo màu DB) + slide nghịch lý kiểu "VS screen".
- **Mở deck:** double-click `presentation/index.html` (cần mạng để load CDN). Verify bằng headless: `google-chrome-stable --headless=new --screenshot=out.png --window-size=1280,720 --virtual-time-budget=9000 "file://<path>/index.html#/<n>"`.

## Trạng thái hiện tại

- [x] Kịch bản — bản nháp đầy đủ, đang tinh chỉnh (Phase 1 đã viết lại theo hướng "câu hỏi sai" + có timing chi tiết).
- [x] Slide reveal.js — **toàn bộ buổi xong** (`presentation/`: 48 slide). Benchmark Demo 1–5 dùng cơ chế **"Đo, đừng đoán"**: slide chỉ ghi **KY VONG** (banner myth + bảng số dự đoán, đều là kỳ vọng) — **KHÔNG pre-bake số thật, KHÔNG verdict-box**. Số thật chạy **live ở terminal** rồi đối chiếu với kỳ vọng trên slide (confirm/bust diễn ra bằng lời lúc đứng nói). Spine gài ở Hook (thesis) + slide payoff "Đo, đừng đoán" trước Closing (phần lớn demo khác trực giác).
- [x] Demo code — **Demo 1–5 chạy thật** (`docker-compose` + `demos/0X`, tsx). `npm run db:up` rồi `npm run demo:1..5`. Demo 4 dùng ScyllaDB (wide-column) — container nặng, khởi động chậm. Tất cả demo dài đã có **spinner/progress** qua `src/lib/progress.ts`.
  - Narrative benchmark đã chỉnh trung thực: Demo 1 (naive chậm nhất vì row lock + nhiều UPDATE thừa), Demo 3 (**cùng INSERT battle** — so `PG battle + UPSERT LB` vs `PG battle + Redis LB`; idle read gần nhau, spike + throughput lộ lợi tách display), Demo 2 Layer 2 (migration dưới OLTP load).

### Demo 3 — leaderboard (chi tiết quan trọng)

**So sánh công bằng** — mỗi trận đều `INSERT battle_results` (audit). Khác nhau ở rank + display:

| Approach | Rank update | Display read |
|---|---|---|
| PG battle + UPSERT LB | PostgreSQL `leaderboard` | PostgreSQL `ORDER BY score` |
| PG battle + Redis LB | Redis `ZINCRBY` | Redis `ZREVRANGE` |

**Param demo** (`demos/03-leaderboard/index.ts`): `UPDATES=60_000`, `PLAYERS=500`, `CONC=50`, `SPIKE_READERS=40` (client refresh top-10 song song), `POOL_MAX=40` (monolith xếp hàng). Metric spike = avg latency nhiều reader trong lúc flood write.

**Điểm bán khi nói:** không phải "Redis đọc nhanh 200x lúc rảnh" — mà **throughput + tách display khỏi OLTP** khi cùng có audit trail.

## Lưu ý môi trường

- Repo đã có git; **không tự commit** trừ khi người dùng yêu cầu.
- Có folder `.idea/` (JetBrains) — không đụng tới.
