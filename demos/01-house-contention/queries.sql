-- ============================================================================
-- Demo 1 — House contention / Race condition · SQL chạy tay (DataGrip)
-- ============================================================================
-- >>> Connect: database  pixiland  (Postgres)
-- 1 house chỉ cho 1 user khai thác tại 1 thời điểm. Mở NHIỀU console DataGrip
-- (mỗi console = 1 session/connection riêng) để diễn lại race và row lock bằng tay.
-- Redis ở cuối file (redis-cli) — không phải SQL.
-- ============================================================================


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ SETUP — tạo & reset house trống (chạy lại trước mỗi lần demo)            ║
-- ╚════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS houses (
  id          int PRIMARY KEY,
  occupant_id text,
  occupied_at timestamptz
);
TRUNCATE houses;
INSERT INTO houses (id, occupant_id) VALUES (1, NULL);
SELECT * FROM houses;   -- occupant_id = NULL → đang trống


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ CASE A · NAIVE (không lock) → RACE CONDITION                             ║
-- ║ Mở 2 console. Chạy XEN KẼ theo đúng thứ tự A1 → B1 → A2 → B2.            ║
-- ║ Mỗi câu tự autocommit (không BEGIN) → lộ khe hở read-rồi-write.          ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- A1 (console 1): đọc thấy trống
SELECT occupant_id FROM houses WHERE id = 1;          -- NULL

-- B1 (console 2): cũng đọc thấy trống (chưa ai ghi)
SELECT occupant_id FROM houses WHERE id = 1;          -- NULL  ← cả hai đều tưởng house trống

-- A2 (console 1): thấy NULL nên "chiếm"
UPDATE houses SET occupant_id = 'userA', occupied_at = now() WHERE id = 1;   -- A tưởng mình thắng

-- B2 (console 2): cũng đã thấy NULL ở B1 nên "chiếm" → ghi đè
UPDATE houses SET occupant_id = 'userB', occupied_at = now() WHERE id = 1;   -- B cũng tưởng thắng

-- Kết quả: DB chỉ giữ 1 occupant (userB, last-write-wins) nhưng CẢ HAI client
-- đều tin mình thắng → oversubscribed. Ở scale 100 request = ~80 winner ảo.
SELECT * FROM houses;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ CASE B · SELECT ... FOR UPDATE → ĐÚNG 1 WINNER (row lock)                ║
-- ║ Reset trước (chạy lại block SETUP). Rồi 2 console theo thứ tự A1→B1→A2…  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- A1 (console 1): mở transaction, khoá row
BEGIN;
SELECT occupant_id FROM houses WHERE id = 1 FOR UPDATE;   -- NULL, GIỮ row lock tới khi COMMIT

-- B1 (console 2): cũng xin row lock → TREO, xếp hàng chờ console 1
BEGIN;
SELECT occupant_id FROM houses WHERE id = 1 FOR UPDATE;   -- treo... (đang chờ lock của A)

-- A2 (console 1): chiếm house rồi nhả lock
UPDATE houses SET occupant_id = 'userA', occupied_at = now() WHERE id = 1;
COMMIT;                                                    -- nhả lock → B1 chạy tiếp ngay

-- B1 lúc này trả về: occupant_id = 'userA' (KHÔNG còn NULL)
-- B2 (console 2): vì đã thấy có chủ → KHÔNG chiếm; kết thúc transaction
ROLLBACK;                                                  -- (hoặc COMMIT, B không ghi gì)

-- Kết quả: đúng 1 winner (userA). Đây là cái giá: request đến sau phải XẾP HÀNG
-- sau row lock → latency đuôi dài (max >> avg) khi đông request.
SELECT * FROM houses;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ QUAN SÁT LOCK QUEUE (console thứ 3) — chạy KHI B1 đang treo chờ          ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Ai đang chờ ai (rõ nhất cho row lock):
SELECT pid, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by, left(query, 50) AS query
FROM pg_stat_activity
WHERE datname = 'pixiland' AND state <> 'idle'
ORDER BY blocked_by;
--  → session B: wait_event_type = 'Lock', blocked_by = {pid của A}

-- Lock ở cấp bảng (FOR UPDATE giữ RowShareLock trên houses):
SELECT l.pid, l.mode, l.granted
FROM pg_locks l
WHERE l.relation = 'houses'::regclass
ORDER BY l.granted DESC, l.pid;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ DỌN DẸP                                                                  ║
-- ╚════════════════════════════════════════════════════════════════════════╝
-- Nếu còn console nào kẹt transaction: COMMIT; hoặc ROLLBACK;
-- DROP TABLE houses;   -- nếu muốn xoá hẳn


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ CASE C · REDIS SET NX (redis-cli) — không phải SQL                       ║
-- ╚════════════════════════════════════════════════════════════════════════╝
-- redis-cli -p 56379          # port host trong docker-compose
--   DEL house:1
--   SET house:1 userA EX 1800 NX   → OK      (winner: nhận được khoá)
--   SET house:1 userB EX 1800 NX   → (nil)   (đến sau, không ghi đè → đúng 1 winner)
--   TTL house:1                     → ~1800   (tự hết hạn, không cần dọn tay)
-- Atomic ngay tại tầng Redis: không transaction, không xếp hàng row lock → latency phẳng.
