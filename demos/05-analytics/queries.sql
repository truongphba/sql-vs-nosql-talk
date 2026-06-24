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


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ [PG] PostgreSQL (row store) — CÙNG query, đổi sang data source Postgres  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

SELECT pg_size_pretty(pg_total_relation_size('battle_logs')) AS on_disk, count(*) AS rows FROM battle_logs;

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
