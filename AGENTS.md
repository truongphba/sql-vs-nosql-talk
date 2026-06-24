# Repository Guidelines

## Cấu Trúc Dự Án & Tổ Chức Module

Repo này phục vụ tech talk SQL vs NoSQL với case study một live game platform. `pixiland-db-talk.md` là nguồn chính.

- Mục tiêu cuối là trình bày được buổi talk nội bộ: **"SQL vs NoSQL — chọn storage theo workload, consistency và scale"** cho case study một live game platform (1M user / 50K DAU).
- Làm theo thứ tự ưu tiên: kịch bản `pixiland-db-talk.md` → slide reveal.js trong `presentation/` → demo code trong `demos/`.
- Quy tắc vàng: **kịch bản dẫn dắt mọi thứ**. Slide và demo phải bám sát kịch bản.
- `presentation/` chứa slide reveal.js không cần build và CSS chung.
- `demos/01-*` đến `demos/04-*` chứa demo CLI TypeScript, mỗi demo một `index.ts`.
- `src/db/` chứa factory kết nối database.
- `src/lib/` chứa helper env, timing, và bảng terminal.
- `docker-compose.yml` khai báo Postgres, Redis, MongoDB, ScyllaDB, ClickHouse local.

Vai trò từng DB trong talk:

- **PostgreSQL** — transactional truth, ACID, JSONB cho flexible config.
- **Redis** — coordination ngắn hạn (`SET NX`), read model (`Sorted Set`).
- **MongoDB** — document model, so sánh với JSONB.
- **ClickHouse** — OLAP columnar server, aggregate scan/analytics (Demo 5); DuckDB là lựa chọn in-process nhẹ hơn cùng họ.
- **ScyllaDB** — wide-column (CQL/Cassandra-compatible), write-heavy append + partition read (Demo 4).

## Lệnh Build, Test & Phát Triển

Dùng Node 20 trở lên.

```bash
npm install          # cài dependency
npm run db:up        # chạy Postgres, Redis, MongoDB và chờ healthy
npm run demo:1       # house contention (in usage; live: demo:1:naive → for-update → redis)
npm run demo:1:naive
npm run demo:1:for-update
npm run demo:1:redis
npm run demo:1:all   # SQL chạy tay (DataGrip): demos/01-house-contention/queries.sql
npm run demo:2       # hero config: full run (seed + Layer 1 + Layer 2)
npm run demo:2:seed  # nạp data 1 lần; rồi demo:2:layer1 / demo:2:layer2 / demo:2:lock
# SQL chạy tay (DataGrip): demos/02-hero-config/queries.sql
npm run demo:3       # leaderboard: Postgres vs Redis Sorted Set
npm run demo:4       # match history (wide-column): Postgres vs ScyllaDB (full)
npm run demo:4:seed  # ghi 200K event; rồi demo:4:read / demo:4:contract
# CQL/SQL chạy tay (DataGrip): demos/04-match-history/queries.cql
npm run demo:5       # analytics: Postgres vs ClickHouse
# SQL chạy tay (DataGrip): demos/05-analytics/queries.sql
npm run db:size      # xem dung lượng PG (pixiland*) + Mongo collections
npm run db:logs      # xem log database
npm run db:down      # dừng service và xoá volume
```

Mở trực tiếp `presentation/index.html` trong trình duyệt để trình chiếu slide.

## Quy Ước Code & Đặt Tên

Dùng TypeScript ESM với strict checking theo `tsconfig.json`. Ưu tiên indent 2 spaces, double quotes, named export cho helper chung, và return type rõ ràng cho exported function hoặc bước demo async. Đặt thư mục demo theo mẫu `demos/0N-short-topic/`. Giá trị env mặc định nằm trong `src/lib/env.ts`; không rải connection string.

## Hướng Dẫn Kiểm Thử

Hiện chưa có test suite tự động. Xem năm script demo như smoke test: chạy `npm run db:up`, rồi từng `npm run demo:N` trước khi đổi benchmark, logic database, hoặc helper chung. Mỗi demo phải tự reset state khi bắt đầu để chạy live nhiều lần vẫn ổn định.

Demo phục vụ trình bày live nên cần:

- Chạy nhanh trong vài giây.
- Tự reset state đầu run (`TRUNCATE`, `FLUSHDB`, xoá collection...).
- In bảng so sánh rõ ràng để khán giả đối chiếu slide ↔ terminal.
- Kết quả benchmark không cần khớp tuyệt đối với kịch bản, nhưng phải đúng định tính và cùng order-of-magnitude. Nếu lệch xa, cập nhật kịch bản và slide liên quan.

Trạng thái hiện tại:

- Kịch bản đã có bản nháp đầy đủ, đang tinh chỉnh.
- Slide reveal.js đã xong toàn bộ deck trong `presentation/` với 46 slide. Cơ chế **"Đo, đừng đoán"**: slide benchmark chỉ ghi **KY VONG** (banner myth + bảng số dự đoán, đều là kỳ vọng) — **KHÔNG pre-bake số thật, KHÔNG verdict-box**. Số thật chạy **live ở terminal** rồi đối chiếu với kỳ vọng trên slide; confirm/bust nói bằng lời.
- Demo 1–5 đã có code chạy thật qua `npm run db:up` rồi `npm run demo:1..5`. Demo 1, 2, 4 tách script nhỏ để demo live (`demo:1:naive|for-update|redis|all`; `demo:2:seed|layer1|layer2|lock`; `demo:4:seed|read|contract`); có `queries.sql`/`.cql` mỗi demo để chạy tay trên DataGrip. Demo 4 dùng ScyllaDB (wide-column) — container nặng, khởi động chậm.
- Narrative benchmark đã chỉnh trung thực: Demo 1 — naive **chậm nhất** vì mọi `UPDATE` vẫn lấy row write-lock, naive ghi ~86 lần thay vì 1 (FOR UPDATE giành lock sớm nên 99/100 bỏ cuộc trước khi ghi). Demo 2 Layer 2 — đo **migration dưới tải OLTP**: PG rewrite DDL giữ `ACCESS EXCLUSIVE` chặn reader, JSONB/Mongo field trong blob không rewrite. Demo 3 — PG có index đọc top-N ngang Redis, Redis thắng write throughput + tách OLTP.

## Quy Ước Commit & Pull Request

Git history hiện chỉ có một initial commit, nên chưa có convention chi tiết. Dùng subject ngắn dạng imperative, ví dụ `Update leaderboard demo narrative` hoặc `Fix Redis cleanup in demo 1`.

Pull request nên mô tả nội dung hoặc hành vi demo đã đổi, liệt kê lệnh đã chạy, và nêu rõ mọi thay đổi benchmark cần cập nhật trong `pixiland-db-talk.md` hoặc `presentation/`.

## Hướng Dẫn Riêng Cho Agent

Không để kịch bản, slide, và output demo lệch nhau. Nếu kết quả demo đổi narrative, cập nhật kịch bản trước, rồi đồng bộ slide và benchmark liên quan.

Slide benchmark chỉ chứa **kỳ vọng** (`KY VONG`): banner myth + bảng số dự đoán phải nhất quán với nhau. **Không** ghi số đo thật lên slide và **không** thêm `verdict-box` confirm/bust — số thật chỉ xuất hiện live ở terminal (hoặc `queries.sql` trên DataGrip), đối chiếu bằng lời. Số đo thật + caveat thì ghi trong kịch bản (`pixiland-db-talk.md`, tài liệu của người nói), không lên slide.

Nội dung kịch bản và slide viết tiếng Việt, giữ thuật ngữ kỹ thuật bằng tiếng Anh như ACID, JSONB, Sorted Set, OLTP/OLAP. Giọng văn cần súc tích, có timing từng phase, và giữ format `Takeaway` dạng code block khi thêm nội dung.

Slide dùng design system Pixel / Game trong `presentation/theme.css`. Không đặt màu/font rời ngoài token có sẵn. Font Press Start 2P chỉ dùng cho ASCII, không dùng cho chữ tiếng Việt có dấu.

Không đụng vào `.idea/`. Repo hiện đã có git; không tự tạo commit trừ khi người dùng yêu cầu.
