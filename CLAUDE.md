# CLAUDE.md

Hướng dẫn cho Claude Code khi làm việc trong repo này.

## Dự án là gì

Đây là repo phục vụ một **buổi tech talk nội bộ**: *"SQL vs NoSQL — chọn storage theo workload, consistency và scale"*, dùng case study **Pixiland** (game GameFi, 1M user / 50K DAU). Mục tiêu cuối là đứng trình bày được + chạy demo thật.

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
| Database runtime | Docker Compose (Postgres + MongoDB + Redis); DuckDB chạy in-process |
| Slide present | reveal.js (nhận markdown, code highlight, speaker notes) |
| Kiểu demo | CLI script — in ra bảng winners / latency / correctness đúng như bảng benchmark trong kịch bản |

4 DB và vai trò (xem chi tiết ở phần "Decision Framework" trong kịch bản):
- **PostgreSQL** — transactional truth, ACID, JSONB cho flexible config
- **Redis** — coordination ngắn hạn (SET NX), read model (Sorted Set)
- **MongoDB** — document model, so sánh với JSONB
- **DuckDB** — OLAP/analytics in-process

## Cấu trúc repo (đề xuất — tạo dần khi làm)

```
.
├── pixiland-db-talk.md        # SOURCE OF TRUTH — kịch bản buổi nói
├── CLAUDE.md
├── docker-compose.yml         # Postgres + Mongo + Redis
├── package.json
├── presentation/              # slide reveal.js (gen từ kịch bản)
│   └── index.html
├── src/
│   └── db/                    # connection helper dùng chung cho các demo
└── demos/
    ├── 01-house-contention/   # Demo 1 — race condition
    ├── 02-hero-config/        # Demo 2 — schema / JSONB / Mongo
    ├── 03-leaderboard/        # Demo 3 — Redis Sorted Set vs Postgres
    └── 04-analytics/          # Demo 4 — DuckDB vs Postgres OLAP
```

Mỗi demo nên có `npm run demo:1` ... `demo:4` để chạy nhanh khi đứng nói.

## Quy ước viết demo (quan trọng cho việc trình bày live)

- **Lặp lại được:** mỗi script tự reset state đầu run (TRUNCATE bảng / `FLUSHDB` / xoá collection) để chạy nhiều lần trên sân khấu không bị bẩn data.
- **Nhanh:** mỗi demo chạy xong trong vài giây — đang trình bày, không ai chờ 30s.
- **Output là điểm nhấn:** in ra **bảng so sánh** (approach × winners × latency × correctness) trông giống bảng trong kịch bản, để khán giả đối chiếu slide ↔ terminal.
- **Số benchmark trong kịch bản là mục tiêu minh hoạ**, không phải con số phải khớp tuyệt đối. Demo thật chỉ cần **cùng order-of-magnitude** và **đúng về mặt định tính** (vd Redis nhanh hơn ~10x, Postgres FOR UPDATE đúng nhưng chậm hơn). Nếu lệch xa → chỉnh kịch bản cho khớp thực tế.
- **Mỗi demo tự chứa:** đọc config DB từ env/`.env`, không hardcode credential rải rác.

## Quy ước nội dung

- **Ngôn ngữ:** nội dung (kịch bản, slide) viết **tiếng Việt**, giữ thuật ngữ kỹ thuật bằng tiếng Anh như hiện tại (ACID, JSONB, Sorted Set, OLTP/OLAP...).
- **Độ chính xác kỹ thuật:** đây là talk cho dev — số liệu/khẳng định phải đúng, kẻo bị bắt bẻ. Khi nêu ví dụ công ty (Instagram, Discord...), số minh hoạ thì nói rõ là xấp xỉ. Kịch bản đã có sẵn các "ghi chú độ chính xác" — giữ tinh thần đó.
- **Giọng văn kịch bản:** súc tích, có timing từng phase, có khối "Takeaway" dạng code block. Khi thêm nội dung mới, theo đúng format đang có.

## Design system (slide — `presentation/`)

Hướng **Pixel / GameFi (disciplined)**. Token gốc nằm ở đầu `presentation/theme.css` — Phase sau bám file này, đừng đặt màu/font rời.

- **Màu:** nền `--bg #161426` (tối, không đen tuyền) · brand `--accent #FFC53D` (coin gold). Mỗi DB một màu signature dùng xuyên deck: Postgres `#3D9BE9` · Redis `#E5484D` · MongoDB `#13AA52` · DuckDB `#F2C94C` (phụ: MySQL/ScyllaDB/Cassandra/Oracle).
- **Font 3 vai trò:** Be Vietnam Pro 800 (tiêu đề VN) · JetBrains Mono (body/data) · Press Start 2P (accent).
- ⚠ **Press Start 2P chỉ dùng cho ASCII** (eyebrow tiếng Anh, số, "VS", tên DB). KHÔNG đặt chữ có dấu tiếng Việt vào pixel font → vỡ glyph. Vì vậy eyebrow/label viết tiếng Anh (OBJECTIVES, THE PARADOX...).
- **Signature:** "DB chip" (badge viền pixel theo màu DB) + slide nghịch lý kiểu "VS screen".
- **Mở deck:** double-click `presentation/index.html` (cần mạng để load CDN). Verify bằng headless: `google-chrome-stable --headless=new --screenshot=out.png --window-size=1280,720 --virtual-time-budget=9000 "file://<path>/index.html#/<n>"`.

## Trạng thái hiện tại

- [x] Kịch bản — bản nháp đầy đủ, đang tinh chỉnh (Phase 1 đã viết lại theo hướng "câu hỏi sai" + có timing chi tiết).
- [x] Slide reveal.js — **toàn bộ buổi xong** (`presentation/`: 46 slide). Benchmark Demo 1–4 dùng cơ chế **"Đo, đừng đoán"**: banner `KY VONG` (số giả định) hiện trước → bảng số thật là fragment (reveal sau khi chạy demo terminal) → `verdict-box` bust/confirm. Spine gài ở Hook (thesis) + slide payoff "Đo, đừng đoán" trước Closing (3/4 demo khác trực giác).
- [x] Demo code — **Demo 1–4 chạy thật** (`docker-compose` + `demos/0X`, tsx). `npm run db:up` rồi `npm run demo:1..4`.
  - Số thật đã chỉnh lại 2 narrative cho trung thực: Demo 1 (FOR UPDATE không phải chậm nhất ở scale này), Demo 3 (PG có index đọc top-N ngang Redis — Redis thắng ở write throughput + tách OLTP, không phải "đọc 200x"). Demo 2 & 4 số thật khớp narrative cũ.

## Lưu ý môi trường

- Repo **chưa init git**. Hỏi người dùng trước khi `git init` / commit.
- Có folder `.idea/` (JetBrains) — không đụng tới.
