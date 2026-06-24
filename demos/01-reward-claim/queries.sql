-- ═══════════════════════════════════════════════════════════════════════════
-- Demo 1 — Shared reward claim / Race condition · SQL chạy tay (DataGrip)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1 reward pool chỉ cho 1 user claim tại 1 thời điểm. Mở NHIỀU console DataGrip
-- (hoặc tab query) chạy song song để thấy race / FOR UPDATE queue.
--
-- DB: gamedb @ localhost:55432 · user/pass game/game
--

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ SETUP — tạo & reset reward pool chưa claim (chạy lại trước mỗi demo)   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS shared_rewards (
  id int PRIMARY KEY,
  claimer_id text,
  claimed_at timestamptz
);
TRUNCATE shared_rewards;
INSERT INTO shared_rewards (id, claimer_id) VALUES (1, NULL);
SELECT * FROM shared_rewards;   -- claimer_id = NULL → chưa ai claim


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ NAIVE — race condition (2 session, không lock)                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Console A:
BEGIN;
SELECT claimer_id FROM shared_rewards WHERE id = 1;          -- NULL

-- Console B (trước khi A commit):
SELECT claimer_id FROM shared_rewards WHERE id = 1;          -- NULL  ← cả hai đều tưởng pool còn trống

-- Console A:
UPDATE shared_rewards SET claimer_id = 'userA', claimed_at = now() WHERE id = 1;   -- A tưởng mình thắng
COMMIT;

-- Console B:
UPDATE shared_rewards SET claimer_id = 'userB', claimed_at = now() WHERE id = 1;   -- B cũng tưởng thắng
COMMIT;

-- Kết quả: DB chỉ giữ 1 claimer (userB, last-write-wins) nhưng CẢ HAI client
-- đều nghĩ mình claim được → oversubscribed.
SELECT * FROM shared_rewards;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FOR UPDATE — đúng 1 winner (2 session)                                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Console A:
BEGIN;
SELECT claimer_id FROM shared_rewards WHERE id = 1 FOR UPDATE;   -- NULL, GIỮ row lock tới khi COMMIT

-- Console B:
BEGIN;
SELECT claimer_id FROM shared_rewards WHERE id = 1 FOR UPDATE;   -- treo... (đang chờ lock của A)

-- Console A: claim reward rồi nhả lock
UPDATE shared_rewards SET claimer_id = 'userA', claimed_at = now() WHERE id = 1;
COMMIT;

-- Console B lúc này trả về: claimer_id = 'userA' (KHÔNG còn NULL)
-- → B không UPDATE, ROLLBACK
ROLLBACK;

SELECT * FROM shared_rewards;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ pg_locks — xem row lock khi FOR UPDATE đang chờ                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Chạy trong session B khi đang treo ở FOR UPDATE:
SELECT l.mode, l.granted, a.query
FROM pg_locks l
JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.relation = 'shared_rewards'::regclass
  AND a.datname = current_database();


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ CLEANUP (tuỳ chọn)                                                       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- DROP TABLE shared_rewards;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Redis SET NX (redis-cli / DataGrip Redis)                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--   DEL reward:1
--   SET reward:1 userA EX 1800 NX   → OK      (winner: nhận được khoá)
--   SET reward:1 userB EX 1800 NX   → (nil)   (đến sau, không ghi đè → đúng 1 winner)
--   TTL reward:1                     → ~1800   (tự hết hạn, không cần dọn tay)
