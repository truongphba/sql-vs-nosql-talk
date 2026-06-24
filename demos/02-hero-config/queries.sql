-- ============================================================================
-- Demo 2 — Hero config · SQL chạy tay (DataGrip)
-- ============================================================================
-- Chạy `npm run demo:2:seed` trước để có 100K hero trong cả 2 database.
-- Có HAI database Postgres riêng — đổi connection/schema trong DataGrip cho đúng:
--     gamedb_norm   → approach normalized (nhiều bảng + JOIN)
--     gamedb_jsonb  → approach JSONB (1 bảng heroes, cột config jsonb)
-- (MongoDB ở cuối file — chạy bằng mongosh / DataGrip Mongo.)
-- Mẹo: bật "Explain Plan" hoặc dùng EXPLAIN (ANALYZE, BUFFERS) để thấy index ăn hay không.
-- ============================================================================


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ LAYER 1 · READ PATTERNS                                                  ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────
-- 1A. ĐỌC XUÔI (hero + owner + wallet + skills)
-- ─────────────────────────────────────────────────────────────

-- >>> Connect: gamedb_norm  — phải JOIN 4 bảng + json_agg
EXPLAIN (ANALYZE, BUFFERS)
SELECT h.id, h.name, h.rarity, h.type, h.atk, h.def, h.hp,
       u.id AS owner_id, u.name AS owner_name, u.level,
       w.balance, w.vip_tier,
       COALESCE(json_agg(json_build_object('name', s.name, 'dmg', s.dmg))
                FILTER (WHERE s.hero_id IS NOT NULL), '[]') AS skills
FROM heroes h
JOIN users u    ON u.id = h.owner_id
JOIN wallets w  ON w.user_id = u.id
LEFT JOIN hero_skills s ON s.hero_id = h.id
WHERE h.id = 12345
GROUP BY h.id, u.id, w.user_id;

-- >>> Connect: gamedb_jsonb  — 1 read, owner/wallet/skills nằm sẵn trong config
EXPLAIN (ANALYZE, BUFFERS)
SELECT config FROM heroes WHERE id = 12345;


-- ─────────────────────────────────────────────────────────────
-- 1B. ĐỌC NGƯỢC (từ owner whale lấy toàn bộ heroes + wallet)
--     whale = user id nhỏ (1..5000). Thử id = 1.
-- ─────────────────────────────────────────────────────────────

-- >>> Connect: gamedb_norm
EXPLAIN (ANALYZE, BUFFERS)
SELECT u.id, u.name, w.balance, w.vip_tier,
       h.id AS hero_id, h.name AS hero_name, h.rarity
FROM users u
JOIN wallets w ON w.user_id = u.id
JOIN heroes  h ON h.owner_id = u.id
WHERE u.id = 1;

-- So sánh CÓ index vs MẤT index (chạy trên gamedb_norm):
--   DROP INDEX heroes_owner_id_idx;        -- bỏ index → seq scan, chậm hơn
--   (chạy lại query đọc ngược ở trên, xem EXPLAIN đổi sang Seq Scan)
--   CREATE INDEX heroes_owner_id_idx ON heroes (owner_id);   -- khôi phục


-- ─────────────────────────────────────────────────────────────
-- 1C. JSONB — truy vấn theo field bên trong config (cần index thủ công)
-- ─────────────────────────────────────────────────────────────

-- >>> Connect: gamedb_jsonb
-- Lọc theo field cụ thể — B-tree expression index:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name FROM heroes WHERE config->>'rarity' = 'UR' LIMIT 20;
-- Nếu chậm (Seq Scan) → tạo index rồi chạy lại:
--   CREATE INDEX heroes_rarity_idx ON heroes ((config->>'rarity'));

-- Truy vấn containment — GIN index:
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, name FROM heroes WHERE config @> '{"rarity":"UR"}' LIMIT 20;
--   CREATE INDEX heroes_config_gin ON heroes USING gin (config);
--   (GIN phủ nhiều field, nặng hơn B-tree expression cho 1 field)


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ LAYER 2 · SCHEMA EVOLUTION                                               ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ─────────────────────────────────────────────────────────────
-- 2A. ĐỌC FIELD MỚI TRÊN DATA CŨ (chưa migrate)
-- ─────────────────────────────────────────────────────────────

-- >>> Connect: gamedb_norm  → LỖI: cột chưa tồn tại → buộc phải ALTER
SELECT trait FROM heroes LIMIT 1;
-- ERROR: column "trait" does not exist

-- >>> Connect: gamedb_jsonb → trả null, KHÔNG lỗi → đọc lazy OK, 0 migration
SELECT id, config->>'trait' AS trait FROM heroes LIMIT 1;


-- ─────────────────────────────────────────────────────────────
-- 2B. CÁC KIỂU MIGRATION & CHI PHÍ LOCK  (chạy trên gamedb_norm)
-- ─────────────────────────────────────────────────────────────

-- (i) ADD COLUMN nullable = METADATA-ONLY (PG 11+), gần như tức thì, không rewrite:
ALTER TABLE heroes ADD COLUMN trait_lazy text;
ALTER TABLE heroes DROP COLUMN trait_lazy;   -- dọn lại

-- (ii) ADD COLUMN có DEFAULT HẰNG SỐ = vẫn metadata-only (PG 11+), không rewrite:
ALTER TABLE heroes ADD COLUMN trait_const text DEFAULT 'Steadfast';
ALTER TABLE heroes DROP COLUMN trait_const;

-- (iii) ADD COLUMN NOT NULL + DEFAULT TÍNH PER-ROW (volatile) = REWRITE TOÀN BẢNG
--       → giữ ACCESS EXCLUSIVE suốt quá trình → CHẶN cả reader. (xem mục LOCK PROOF)
--   ALTER TABLE heroes ADD COLUMN trait text NOT NULL DEFAULT md5(random()::text);
--   ALTER TABLE heroes DROP COLUMN trait;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ LOCK PROOF · 3 session trên bảng heroes THẬT (gamedb_norm)             ║
-- ║ Lock 1 ALTER auto-commit chỉ sống ~vài trăm ms — query tay không kịp.    ║
-- ║ Mẹo: bọc trong transaction CHƯA commit để giữ lock bao lâu tuỳ ý.        ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- ── SESSION 1 (giữ lock) ── mở 1 console DataGrip trỏ gamedb_norm:
BEGIN;
ALTER TABLE heroes ADD COLUMN trait_demo text NOT NULL DEFAULT md5(random()::text);
-- để nguyên, CHƯA commit → AccessExclusiveLock đang bị giữ

-- ── SESSION 2 (đọc heroes → sẽ TREO) ── console thứ hai, gamedb_norm:
SELECT id, name FROM heroes WHERE id = 1;   -- treo, xếp hàng chờ lock

-- ── SESSION 3 (xem lock queue → chạy ngay, KHÔNG treo) ── console thứ ba:
SELECT l.pid, a.state, l.mode, l.granted, left(a.query, 50) AS query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE l.relation = 'heroes'::regclass
ORDER BY l.granted DESC, l.pid;
-- Thấy: ALTER = AccessExclusiveLock granted=t · SELECT (session 2) = AccessShareLock granted=f

-- ── SESSION 1 (nhả lock + undo) ──
ROLLBACK;   -- bỏ cột trait_demo, trả heroes về nguyên trạng; session 2 lập tức trả kết quả

-- ── ĐỐI CHỨNG: JSONB backfill KHÔNG chặn reader (gamedb_jsonb) ──
-- Session 1:  BEGIN; UPDATE heroes SET config = config || '{"trait":"X"}'::jsonb; -- chưa commit
-- Session 2:  SELECT id FROM heroes WHERE id = 1;   -- VẪN CHẠY (chỉ RowExclusiveLock, MVCC)
-- Session 3:  query pg_locks ở trên với 'heroes'::regclass → thấy RowExclusiveLock, không phải AccessExclusive
-- Session 1:  ROLLBACK;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ DUNG LƯỢNG (so embed vs normalized)                                      ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Kích thước từng database (chạy ở DB bất kỳ, vd postgres):
SELECT datname AS db, pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database WHERE datname LIKE 'gamedb%' ORDER BY datname;

-- Kích thước từng bảng (chạy trong gamedb_norm rồi gamedb_jsonb):
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS total
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;


-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║ MONGODB (mongosh / DataGrip Mongo) — không phải SQL                      ║
-- ╚════════════════════════════════════════════════════════════════════════╝
-- use gamedb
-- Xuôi:  db.heroes.findOne({ _id: 12345 })
-- Ngược: db.users.aggregate([
--          { $match: { _id: 1 } },
--          { $lookup: { from: "wallets", localField: "_id", foreignField: "userId", as: "wallet" } },
--          { $unwind: "$wallet" },
--          { $lookup: { from: "heroes",  localField: "_id", foreignField: "ownerId", as: "heroes" } }
--        ])
-- Mất index (đắt):  db.heroes.dropIndex("ownerId_1")  → chạy lại aggregate  → db.heroes.createIndex({ ownerId: 1 })
-- Thêm field:       db.heroes.updateMany({}, { $set: { trait: "Steadfast" } })   // không DDL, không khoá bảng
