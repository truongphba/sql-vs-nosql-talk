-- ============================================================================
-- Demo 4 — Match history (wide-column) · chạy tay
--   CQL  → ScyllaDB  (DataGrip: data source Cassandra/Scylla, host localhost:59042)
--   SQL  → PostgreSQL (database pixiland) — phần ở cuối, đánh dấu [PG]
-- Chạy `npm run demo:4:seed` trước để có dữ liệu.
-- ============================================================================


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ SCYLLA · MÔ HÌNH query-first (CQL)                                       ║
-- ╚════════════════════════════════════════════════════════════════════════╝
USE pixiland;

-- Bảng được thiết kế THEO QUERY: partition = player_id, clustering = thời gian giảm dần.
-- DESCRIBE để thấy partition key vs clustering key:
DESCRIBE TABLE matches_by_player;

-- ── Partition read: "50 trận gần nhất của player X" — seek 1 partition, đã sort sẵn ──
SELECT match_id, match_time, opponent, result
FROM matches_by_player
WHERE player_id = 1
LIMIT 50;
-- TRACING ON;  -- bật để thấy chỉ chạm 1 partition (rồi TRACING OFF;)


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ SCYLLA · CONTRACT — chỗ wide-column TỪ CHỐI                              ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- (1) Query theo cột THƯỜNG (opponent, không phải partition key) → BỊ TỪ CHỐI hẳn:
SELECT player_id, match_id FROM matches_by_player WHERE opponent = 1 LIMIT 100;
-- InvalidRequest: ... use ALLOW FILTERING  ← engine từ chối query không lường được hiệu năng

-- (2) Ép chạy = full cluster scan (đắt, KHÔNG khuyến nghị production):
SELECT player_id, match_id FROM matches_by_player WHERE opponent = 1 LIMIT 100 ALLOW FILTERING;

-- (3) Filter theo CLUSTERING col (match_time) thì ĐƯỢC nhưng kèm cảnh báo + sẽ bị chặn ở version sau:
SELECT player_id, match_id FROM matches_by_player WHERE match_time > '2025-01-01' LIMIT 100;
-- Warning: "This query should use ALLOW FILTERING and will be rejected in future versions."

-- → Cách "đúng" của wide-column: tạo BẢNG MỚI denormalized, ghi event NHIỀU LẦN:
--   CREATE TABLE matches_by_opponent (
--     opponent int, match_time timestamp, match_id int, player_id int, result text,
--     PRIMARY KEY ((opponent), match_time, match_id)
--   ) WITH CLUSTERING ORDER BY (match_time DESC, match_id DESC);
--   → mỗi trận: INSERT vào matches_by_player VÀ matches_by_opponent.

-- KHÔNG có JOIN trong CQL. Muốn ghép owner/wallet/hero → đọc nhiều query ở app, hoặc denormalize.


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ [PG] PostgreSQL — cùng workload, linh hoạt hơn nhưng 1-node ceiling      ║
-- ║ DataGrip: đổi sang data source Postgres (database pixiland)              ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Partition read tương đương (index (player_id, match_time DESC)):
EXPLAIN (ANALYZE, BUFFERS)
SELECT match_id, match_time, opponent, result
FROM matches WHERE player_id = 1 ORDER BY match_time DESC LIMIT 50;

-- Ad-hoc theo thời gian — PG chỉ cần THÊM INDEX là chạy nhanh (không cần bảng mới):
EXPLAIN (ANALYZE, BUFFERS)
SELECT player_id, match_id FROM matches WHERE match_time > now() - interval '1 hour' LIMIT 100;  -- chưa index → seq scan
-- CREATE INDEX matches_time_idx ON matches (match_time);   -- thêm index
-- (chạy lại query trên → Index Scan, nhanh)
-- DROP INDEX matches_time_idx;

-- Ad-hoc theo opponent — cũng chỉ cần thêm index, KHÔNG phải bảng mới:
-- CREATE INDEX matches_opponent_idx ON matches (opponent);
SELECT * FROM matches WHERE opponent = 1 LIMIT 10;

-- → Đánh đổi: PG cho query bất kỳ (index/JOIN/ad-hoc) nhưng write throughput đụng trần 1 node.
--   Wide-column ép query-first + denormalize, đổi lại write scale-out tuyến tính nhiều node.
