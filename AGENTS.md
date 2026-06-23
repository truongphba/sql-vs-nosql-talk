# Repository Guidelines

## Cấu Trúc Dự Án & Tổ Chức Module

Repo này phục vụ tech talk SQL vs NoSQL với case study Pixiland. `pixiland-db-talk.md` là nguồn chính.

- Mục tiêu cuối là trình bày được buổi talk nội bộ: **"SQL vs NoSQL — chọn storage theo workload, consistency và scale"** cho case Pixiland (GameFi, 1M user / 50K DAU).
- Làm theo thứ tự ưu tiên: kịch bản `pixiland-db-talk.md` → slide reveal.js trong `presentation/` → demo code trong `demos/`.
- Quy tắc vàng: **kịch bản dẫn dắt mọi thứ**. Slide và demo phải bám sát kịch bản.
- `presentation/` chứa slide reveal.js không cần build và CSS chung.
- `demos/01-*` đến `demos/04-*` chứa demo CLI TypeScript, mỗi demo một `index.ts`.
- `src/db/` chứa factory kết nối database.
- `src/lib/` chứa helper env, timing, và bảng terminal.
- `docker-compose.yml` khai báo Postgres, Redis, MongoDB local; DuckDB chạy in-process.

Vai trò từng DB trong talk:

- **PostgreSQL** — transactional truth, ACID, JSONB cho flexible config.
- **Redis** — coordination ngắn hạn (`SET NX`), read model (`Sorted Set`).
- **MongoDB** — document model, so sánh với JSONB.
- **DuckDB** — OLAP/analytics in-process.

## Lệnh Build, Test & Phát Triển

Dùng Node 20 trở lên.

```bash
npm install          # cài dependency
npm run db:up        # chạy Postgres, Redis, MongoDB và chờ healthy
npm run demo:1       # house contention / race condition
npm run demo:2       # hero config: normalized SQL vs JSONB vs MongoDB
npm run demo:3       # leaderboard: Postgres vs Redis Sorted Set
npm run demo:4       # analytics: Postgres vs DuckDB
npm run db:logs      # xem log database
npm run db:down      # dừng service và xoá volume
```

Mở trực tiếp `presentation/index.html` trong trình duyệt để trình chiếu slide.

## Quy Ước Code & Đặt Tên

Dùng TypeScript ESM với strict checking theo `tsconfig.json`. Ưu tiên indent 2 spaces, double quotes, named export cho helper chung, và return type rõ ràng cho exported function hoặc bước demo async. Đặt thư mục demo theo mẫu `demos/0N-short-topic/`. Giá trị env mặc định nằm trong `src/lib/env.ts`; không rải connection string.

## Hướng Dẫn Kiểm Thử

Hiện chưa có test suite tự động. Xem bốn script demo như smoke test: chạy `npm run db:up`, rồi từng `npm run demo:N` trước khi đổi benchmark, logic database, hoặc helper chung. Mỗi demo phải tự reset state khi bắt đầu để chạy live nhiều lần vẫn ổn định.

Demo phục vụ trình bày live nên cần:

- Chạy nhanh trong vài giây.
- Tự reset state đầu run (`TRUNCATE`, `FLUSHDB`, xoá collection...).
- In bảng so sánh rõ ràng để khán giả đối chiếu slide ↔ terminal.
- Kết quả benchmark không cần khớp tuyệt đối với kịch bản, nhưng phải đúng định tính và cùng order-of-magnitude. Nếu lệch xa, cập nhật kịch bản và slide liên quan.

Trạng thái hiện tại:

- Kịch bản đã có bản nháp đầy đủ, đang tinh chỉnh.
- Slide reveal.js đã xong toàn bộ deck trong `presentation/` với 46 slide.
- Demo 1–4 đã có code chạy thật qua `npm run db:up` rồi `npm run demo:1..4`.
- Narrative benchmark đã được chỉnh trung thực ở Demo 1 và Demo 3: Demo 1 `FOR UPDATE` không luôn chậm nhất ở scale này; Demo 3 Postgres có index đọc top-N ngang Redis, Redis thắng ở write throughput và tách OLTP.

## Quy Ước Commit & Pull Request

Git history hiện chỉ có một initial commit, nên chưa có convention chi tiết. Dùng subject ngắn dạng imperative, ví dụ `Update leaderboard demo narrative` hoặc `Fix Redis cleanup in demo 1`.

Pull request nên mô tả nội dung hoặc hành vi demo đã đổi, liệt kê lệnh đã chạy, và nêu rõ mọi thay đổi benchmark cần cập nhật trong `pixiland-db-talk.md` hoặc `presentation/`.

## Hướng Dẫn Riêng Cho Agent

Không để kịch bản, slide, và output demo lệch nhau. Nếu kết quả demo đổi narrative, cập nhật kịch bản trước, rồi đồng bộ slide và benchmark liên quan.

Nội dung kịch bản và slide viết tiếng Việt, giữ thuật ngữ kỹ thuật bằng tiếng Anh như ACID, JSONB, Sorted Set, OLTP/OLAP. Giọng văn cần súc tích, có timing từng phase, và giữ format `Takeaway` dạng code block khi thêm nội dung.

Slide dùng design system Pixel / GameFi trong `presentation/theme.css`. Không đặt màu/font rời ngoài token có sẵn. Font Press Start 2P chỉ dùng cho ASCII, không dùng cho chữ tiếng Việt có dấu.

Không đụng vào `.idea/`. Repo hiện đã có git; không tự tạo commit trừ khi người dùng yêu cầu.
