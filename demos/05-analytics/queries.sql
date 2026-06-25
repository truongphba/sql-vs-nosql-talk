-- ============================================================================
-- Demo 5 — Analytics (OLAP) · chạy tay (DataGrip)
--   ClickHouse → data source ClickHouse, host localhost (HTTP 58123 hoặc native 59000),
--                user "game", password "game", database "default".
--   PostgreSQL → data source Postgres, database gamedb.
-- Chạy `npm run demo:5` trước để seed 5M battle_logs vào CẢ HAI.
-- ============================================================================


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ CLICKHOUSE (columnar OLAP) — xem data + 3 aggregate                      ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Xem nhanh + dung lượng (columnar nén rất tốt):
SELECT count() AS rows FROM battle_logs;
SELECT * FROM battle_logs LIMIT 20;
SELECT formatReadableSize(sum(bytes_on_disk)) AS on_disk, sum(rows) AS rows
FROM system.parts WHERE table = 'battle_logs' AND active;

-- 1) Hero win rate (90 ngày) — avg(win) vì win là UInt8 (0/1)
SELECT hero_id, avg(win) AS wr, count() AS n
FROM battle_logs WHERE day < 90 GROUP BY hero_id ORDER BY wr DESC LIMIT 20;

-- 2) DAU theo ngày — count(distinct) = uniqExact trong ClickHouse
SELECT day, count(DISTINCT player_id) AS dau FROM battle_logs GROUP BY day ORDER BY day;
--   (ClickHouse-native nhanh hơn nếu chấp nhận xấp xỉ: uniq(player_id) ~ HyperLogLog)
SELECT day, uniq(player_id) AS dau_approx FROM battle_logs GROUP BY day ORDER BY day;

-- 3) Battles theo region + giờ
SELECT region, hour, count() AS battles FROM battle_logs GROUP BY region, hour ORDER BY region, hour;

-- Vì sao nhanh: chỉ đọc CỘT cần (columnar) + LowCardinality(region) + MergeTree.
-- EXPLAIN PIPELINE SELECT region, count() FROM battle_logs GROUP BY region;


-- ────────────────────────────────────────────────────────────────────────────
-- CẤU TRÚC VẬT LÝ — nhìn ra "columnar" (DataGrip view hàng×cột nhìn giống PG,
-- khác biệt nằm ở storage). Chạy mấy query system.* này cho khán giả thấy tận mắt.
-- ────────────────────────────────────────────────────────────────────────────

-- (A) NÉN TỪNG CỘT — chữ ký rõ nhất của columnar: mỗi cột 1 file, nén riêng.
--     `day` nén ~200x (vì ORDER BY (day,hero_id) → day sắp xếp → lặp liền → nén sạch);
--     `player_id` ~1x (random int, không nén được). Row store KHÔNG làm được kiểu này.
SELECT name AS column,
       formatReadableSize(sum(data_compressed_bytes))   AS compressed,
       formatReadableSize(sum(data_uncompressed_bytes)) AS uncompressed,
       round(sum(data_uncompressed_bytes) / sum(data_compressed_bytes), 1) AS ratio
FROM system.columns
WHERE table = 'battle_logs' AND database = currentDatabase()
GROUP BY name ORDER BY sum(data_compressed_bytes) DESC;

-- (B) MergeTree PARTS + SPARSE INDEX — không index từng row:
--     `marks` = số granule (1 mark / 8192 row); `primary_key_bytes_in_memory` chỉ vài trăm byte
--     cho cả triệu row. Nhiều part = ghi thành part bất biến rồi merge nền (LSM-style).
SELECT part_type, rows, marks,
       formatReadableSize(data_compressed_bytes)        AS compressed,
       formatReadableSize(primary_key_bytes_in_memory)  AS pk_in_mem
FROM system.parts WHERE table = 'battle_logs' AND active;
-- OPTIMIZE TABLE battle_logs FINAL;   -- gộp hết part lại 1 part (demo merge)

-- (C) index_granularity = 8192 (mặc định): xem trong DDL.
SHOW CREATE TABLE battle_logs;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ [PG] PostgreSQL (row store) — CÙNG query, đổi sang data source Postgres  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

SELECT pg_size_pretty(pg_total_relation_size('battle_logs')) AS on_disk, count(*) AS rows FROM battle_logs;
--   So với ClickHouse ~43 MiB → PG ~249 MB (~6x): row heap không nén theo cột.
--   PG KHÔNG có khái niệm "dung lượng/nén theo cột" — cả hàng nằm chung trong heap page,
--   nên không có query nào liệt kê compressed-bytes-per-column như system.columns của ClickHouse.
--   Muốn nhìn tận byte layout của 1 page (whole-row store):
--     CREATE EXTENSION IF NOT EXISTS pageinspect;
--     SELECT lp, t_ctid, t_data FROM heap_page_items(get_raw_page('battle_logs', 0)) LIMIT 5;

-- 1) Hero win rate — win là boolean ở PG
EXPLAIN (ANALYZE, BUFFERS)
SELECT hero_id, avg(case when win then 1 else 0 end) AS wr, count(*) AS n
FROM battle_logs WHERE day < 90 GROUP BY hero_id ORDER BY wr DESC LIMIT 20;

-- 2) DAU theo ngày — count(distinct) phải scan + hash toàn bộ
EXPLAIN (ANALYZE, BUFFERS)
SELECT day, count(DISTINCT player_id) AS dau FROM battle_logs GROUP BY day ORDER BY day;

-- 3) Battles theo region + giờ
EXPLAIN (ANALYZE, BUFFERS)
SELECT region, hour, count(*) AS battles FROM battle_logs GROUP BY region, hour ORDER BY region, hour;

-- → Row store phải đọc CẢ HÀNG để lấy vài cột; OLTP index không cứu được aggregate scan.
--   Đây là lý do columnar (ClickHouse) thắng tuyệt đối ở analytics — và vì sao
--   tách OLAP khỏi OLTP là quyết định KIẾN TRÚC, không phải tối ưu query.
