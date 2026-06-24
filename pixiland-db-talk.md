# SQL vs NoSQL — Chọn storage theo workload, consistency và scale
> SQL vs NoSQL · Tech Talk

---

## Thông tin buổi chia sẻ

- **Chủ đề:** SQL vs NoSQL — chọn storage theo workload, consistency và scale
- **Bối cảnh:** Live game platform — một game online thật (1M users, 50K DAU)
- **Định dạng:** Bài toán → Thiết kế → Benchmark → Scale bottleneck → Takeaway
- **DB cover:** PostgreSQL · MongoDB · Redis · ScyllaDB · ClickHouse
- **Slide mở đầu:** đặt câu hỏi tranh luận "SQL hay NoSQL — cái nào thật sự tốt hơn?", dùng badge đại diện rộng hơn cho landscape: PostgreSQL · MySQL · MongoDB · Redis · Cassandra · ClickHouse.

---

## Mục tiêu buổi chia sẻ

Sau buổi này, người nghe nên thấy rõ:

- Không có DB nào thắng mọi bài toán
- Một hệ thống thật thường có nhiều lớp dữ liệu: transactional truth, flexible config, realtime coordination, ranking/read model, event log, analytics
- Chọn DB không phải theo trend, mà theo: workload, consistency, access pattern, scale bottleneck

---

## Phase 1 — Hook (5 phút)

> Mục tiêu của 5 phút này **không phải dạy SQL vs NoSQL** — mà là (1) tạo nghịch lý, (2) cài thesis "chọn DB = đặt đúng câu hỏi", (3) mở một vòng lặp chỉ khép lại ở cuối buổi. Tránh định nghĩa SQL/NoSQL sớm — audience kỹ thuật biết rồi.

### Bước 1 — Mở bài + câu hỏi mồi (0:00–0:45)

Slide title chỉ đặt vấn đề, không giải thích framework sớm:

> "SQL hay NoSQL — cái nào thật sự tốt hơn?"

Ngay sau đó chuyển sang slide `THE DEBATE` với câu hỏi mà ai cũng nghĩ mình biết đáp án:

> "Một câu nhanh trước khi vào: SQL và NoSQL — theo mọi người cái nào **scale** tốt hơn?"

Để vài người trả lời (đa số sẽ nói NoSQL). Đó là cái bẫy.

> "Hầu hết sẽ nói NoSQL. Hết buổi hôm nay, mọi người sẽ thấy đây là **câu hỏi sai từ đầu** — và đó mới là điều đáng nói."

→ Tạo dissonance + mở vòng lặp ngay trong 45 giây đầu. Slide này không cần thêm objective hoặc agenda; để câu hỏi tự kéo audience vào nghịch lý kế tiếp.

### Bước 2 — Nghịch lý: cùng scale, chọn ngược nhau (0:45–2:30)

Đừng giải thích lý do ngay. Trước tiên cho slide hiện **chỉ logo công ty + DB lựa chọn**, chưa bật lý do. Cho mọi người tranh luận nhanh: cùng scale lớn, ai đang chọn đúng hơn?

> "Instagram — hàng trăm triệu user — chạy trên **PostgreSQL**, một relational DB. Discord — cũng khổng lồ — thì bỏ SQL, chạy **ScyllaDB**, một NoSQL wide-column. Cùng tầm scale, chọn ngược nhau hoàn toàn. Ai sai?"

Khoảng lặng 10–15 giây để mọi người đoán lý do. Sau đó reveal lý do lựa chọn trên slide, rồi chốt:

> "Không ai sai. Họ giải hai bài toán khác nhau. Instagram: data quan hệ chặt — user, post, like, comment đan vào nhau, cần consistency. Discord: một thứ duy nhất ở quy mô kinh khủng — message, chỉ ghi thêm, gần như không sửa."

### Bước 3 — Cú twist: ngay trong Instagram cũng không có 1 đáp án (2:30–3:45)

Đây là điểm "À há" mạnh nhất — dùng chính Instagram, không mở thêm công ty mới:

> "Ngay trong Instagram cũng không có một đáp án. Post, comment, like, follow là dữ liệu quan hệ chặt — PostgreSQL hợp lý làm source of truth. Nhưng Home Feed lại là workload khác: mở app phải thấy feed ngay, cần ranking và feed cache kiểu Redis, không thể mỗi lần mở app lại JOIN live toàn bộ follow graph. Vậy câu hỏi không phải 'Instagram dùng DB nào', mà là 'phần nào của Instagram cần gì'."

→ Phá tư duy "chọn 1 DB cho cả hệ thống" — đây chính là cái mở đường cho 4 demo, mỗi demo một layer.

### Bước 4 — Chuyển sang case study (3:45–5:00)

Không dùng slide thesis/bridge riêng nữa. Chốt bằng lời ngay sau twist Instagram:

> "Vậy từ giờ đừng hỏi 'dùng DB nào cho cả hệ thống'. Hỏi phần này là truth, feed/cache, coordination hay analytics. Hôm nay ta làm điều đó trên một hệ thống thật — một live game platform 1 triệu user. Trong cùng một game, mình sẽ gặp đủ mọi loại workload vừa nói tới."
>
> "Và một nguyên tắc xuyên suốt hôm nay: **đo, đừng đoán.** Mỗi demo mình sẽ đoán trước rồi chạy thật."

> **Ghi chú độ chính xác (kẻo bị bắt bẻ):**
> - Instagram: nói "data quan hệ chặt, cần consistency" — tránh nói "JOIN phức tạp" (Instagram shard Postgres và *tránh* cross-shard join).
> - Discord: con số là minh hoạ — nói "hàng tỷ message" thay vì cam kết "4 tỷ/ngày". Slide dùng **ScyllaDB** (đúng nơi Discord dừng lại, và là DB của Demo 4); nếu hỏi sâu lộ trình: Discord đi MongoDB → Cassandra → ScyllaDB. Cassandra là trạm giữa đường, Scylla là đích — nên Hook chốt thẳng Scylla để khớp callback ở Demo 4.
> - Home Feed trên slide dùng "Redis / feed cache" vì nguồn public cũ về Instagram stack có nhắc Redis cho fast feeds. Không khẳng định kiến trúc hiện tại của Instagram vẫn y nguyên; mục tiêu là phân biệt source of truth quan hệ với cache/read model phục vụ đọc nhanh.

---

## Phase 2 — Bối cảnh case study (5–7 phút)

### Live game platform — case study

**Quy mô:** 1 triệu User · 50K DAU

**Tính năng chính:**
- Xây làng, đất & nhà, building system
- Hero collection — PvP dungeon, PvE dungeon
- Marketplace mua bán vật phẩm giữa người chơi
- House occupancy — 1 user khai thác tại 1 thời điểm
- Event spike: đua top PvE, mining pools

### Một game — nhiều workload

Mỗi tính năng sinh ra một loại workload khác nhau, và chính là cái ta sẽ stress-test ở từng demo:

| Tính năng | Loại workload |
|---|---|
| House occupancy (1 user/lúc) | Race condition · coordination ngắn hạn |
| Hero / building / item config | Flexible schema · nested · evolve nhanh |
| PvP season ranking | Read model realtime + settlement đúng tuyệt đối |
| Match history / activity feed | Write-heavy append-only · đọc theo partition key · scale ngang |
| Admin metrics (DAU, win rate…) | OLAP · aggregate scan |
| Mua bán vật phẩm / inventory | Transactional truth (nền) |

**Thông điệp:** Cùng một game — nhiều loại workload dữ liệu khác nhau, không có DB nào phù hợp cho tất cả.

---

## Phase 3 — Khung lý thuyết (7–9 phút)

> Trước khi vào demo, nhìn nhanh tấm bản đồ DB để biết mình đang đứng ở đâu — rồi mới zoom vào 4 cái sẽ test hôm nay (lướt nhanh, không đọc từng dòng).

### Họ nhà SQL (Relational) — điểm chung: ACID + ngôn ngữ SQL

| Nhóm | Đặc trưng | Đại diện |
|---|---|---|
| RDBMS (OLTP) | schema chặt, JOIN, transaction | PostgreSQL · MySQL · Oracle · SQL Server · SQLite (embedded) |
| Distributed SQL (NewSQL) | ACID **+ scale ngang** | CockroachDB · Google Spanner · TiDB · YugabyteDB |
| OLAP columnar | vẫn SQL, lưu theo **cột** cho analytics | ClickHouse · DuckDB · Apache Druid · BigQuery |

### Họ nhà NoSQL — bỏ bớt ràng buộc relational để đổi lấy scale / flexibility / đặc thù

| Loại | Đặc trưng | Đại diện | Hợp với |
|---|---|---|---|
| **Key-Value** | get/set theo key, cực nhanh | Redis · Memcached · DynamoDB · etcd | cache, session, counter, lock |
| **Document** | JSON nested, đọc nguyên object | MongoDB · CouchDB · Firestore | config, catalog, content |
| **Wide-column** | column-family, ghi cực nhiều | Cassandra · ScyllaDB · HBase · Bigtable | message/event log, feed |
| **Graph** | node + edge, traversal quan hệ | Neo4j · Neptune · ArangoDB | social, đề xuất, fraud |
| **Search** | full-text, inverted index | Elasticsearch · OpenSearch · Solr | search, log analytics |
| **Time-series** | tối ưu theo trục thời gian | InfluxDB · TimescaleDB · Prometheus | metrics, monitoring, IoT |
| **Vector** | similarity search trên embedding | pgvector · Pinecone · Qdrant · Weaviate | AI / RAG, semantic search |

### Hai điều dễ nhầm

**Wide-column ≠ columnar OLAP.** Tên na ná, mục đích ngược nhau. Cassandra (wide-column) tối ưu ghi/đọc theo partition key — vẫn là OLTP. ClickHouse/DuckDB (columnar OLAP) tối ưu scan + aggregate trên cả cột — là analytics.

**Ranh giới SQL/NoSQL đang mờ dần.** PostgreSQL nuốt dần nhiều loại: JSONB (document), pgvector (vector), TimescaleDB (time-series), PostGIS (geo). Nhiều khi không cần thêm DB mới — chỉ cần một extension. (Chính là lý do JSONB sẽ xuất hiện ở Demo 2.)

### 4 đại diện sẽ benchmark hôm nay

> Từ cả bản đồ trên, đây là 4 cái ta sẽ chạy demo thật hôm nay — mỗi cái đại diện cho một workload chính của game.

| DB | Họ | Vai trò |
|---|---|---|
| **PostgreSQL** | Relational SQL | ACID, JOIN, index, transactional truth |
| **MongoDB** | Document | Schema-flexible, nested object, evolve nhanh |
| **Redis** | Key-Value / data-structure | In-memory, atomic, TTL, Sorted Set |
| **ScyllaDB** | Wide-column | Write-heavy append, partition read, scale-out (Demo 4) |
| **ClickHouse** | OLAP Columnar | Aggregate scan, analytics, columnar server (Demo 5) |

> Buổi này không cover hết — Wide-column, Graph, Search… sẽ được nhắc khi liên quan.

### Chuẩn bị môi trường demo (Docker)

**Một lần `npm run db:up` cho cả buổi** — không cần `docker compose down/up` giữa từng demo. Mỗi script tự reset state đầu run (TRUNCATE / DROP TABLE / `del` key / drop collection).

| Demo | Postgres | Redis | MongoDB |
|---|---|---|---|
| 1 House | `pixiland` · bảng `houses` | key `house:1` | — |
| 2 Hero config | `pixiland_norm` + `pixiland_jsonb` (2 DB riêng) | — | DB `pixiland` · `users` / `wallets` / `heroes` |
| 3 Leaderboard | `pixiland` · bảng `leaderboard` | key `lb` | — |
| 4 Match history | `pixiland` · `matches` | — | — |
| 5 Analytics | `pixiland` · `battle_logs` | — | — |

> Demo 5 thêm **ClickHouse** (container, DB `default` · bảng `battle_logs`); Demo 4 thêm **ScyllaDB** (container, keyspace `pixiland` · bảng `matches_by_player`). Cả hai là engine riêng, không nằm trong cột Postgres/Redis/Mongo ở trên.

**Không xung đột:** demo 1 và 3 dùng chung DB `pixiland` nhưng bảng/key khác nhau; demo 2 tách 2 DB Postgres để so dung lượng embed vs normalized.

**Khi nào `npm run db:down -v`:** rehearsal sạch, lần đầu tạo `pixiland_norm` / `pixiland_jsonb` (init script chỉ chạy khi volume mới), hoặc sau khi đổi `docker/postgres-init/`.

```bash
npm run db:up      # đầu buổi
npm run demo:1..4  # chạy liên tiếp, không cần restart Docker
npm run db:size    # sau Demo 2 — xem dung lượng DB (optional live)
npm run db:down    # cuối buổi / dọn sạch
```

---

## Demo 1 — House contention / Race condition (12–15 phút)

### Bài toán

Một house chỉ cho 1 user khai thác tài nguyên tại 1 thời điểm. Khi event mining pool bắt đầu, hàng trăm request cùng hit một house đang trống trong vài millisecond.

**Scenario:** 100 user → 1 house trống → cùng 1 lúc → chỉ 1 người được thắng.

**Chạy live — từng case** (để khán giả thấy race trước khi so latency):

```bash
npm run demo:1:naive        # FAIL — nhiều winners, race lộ rõ
npm run demo:1:for-update   # đúng 1 winner, chậm hơn
npm run demo:1:redis        # đúng 1 winner, nhanh nhất
npm run demo:1:all          # rehearsal: cả 3 + bảng tổng
# SQL chạy tay trên DataGrip (diễn race + FOR UPDATE 2 session + pg_locks): demos/01-house-contention/queries.sql
```

Mỗi lệnh reset state (`TRUNCATE` / `DEL`) — chạy lại nhiều lần vẫn ổn.

### So sánh 3 approach

**Naive PostgreSQL (không lock)**

Đọc `occupant_id`, thấy NULL thì update. Vấn đề: giữa lúc đọc và lúc write, nhiều request cùng pass check và cùng ghi đè nhau. Kết quả: nhiều user cùng "thắng" — oversubscribed, bug nghiêm trọng.

**PostgreSQL SELECT FOR UPDATE**

Wrap trong transaction, lock row trước khi đọc. Correct hoàn toàn — chỉ 1 request thắng. Vấn đề: dưới spike lớn, tất cả request xếp hàng sau một row lock, latency tăng tuyến tính.

**Redis SET NX EX**

Atomic ở tầng Redis — set key nếu chưa tồn tại, expire sau 30 phút. Không có lock, không có queue, không có transaction overhead.

### Benchmark — 100 concurrent requests

| Approach | Winners | min · avg · max | Correctness |
|---|---|---|---|
| Naive PostgreSQL | ~86 ❌ | ~73 · 81 · 93ms (**spread nhỏ — ai cũng chậm**) | FAIL — oversubscribed |
| PostgreSQL FOR UPDATE | 1 ✓ | ~4 · 21 · 37ms (**spread rộng — đuôi dài**) | Correct — row lock queue |
| Redis SET NX | 1 ✓ | ~0.4 · 1.3 · 2.1ms (latency phẳng) | Correct — không queue lock |

> Script in thêm **min / avg / p95 / max** mỗi case. Case 2 trade-off lộ ở **spread rộng** (request cuối xếp hàng sau `FOR UPDATE`). Case 3 **latency phẳng** — không hot row lock trên Postgres.

> **Cú twist nhất — naive lại CHẬM NHẤT:** `min` của naive (~73ms) còn cao hơn `max` của FOR UPDATE (~37ms) — request *nhanh nhất* của naive vẫn chậm hơn request *chậm nhất* của FOR UPDATE.
>
> **Tại sao "naive không lock" là sai:** mọi `UPDATE` đều tự lấy **row write-lock** trên tuple nó sửa — không phải đặc quyền của `FOR UPDATE`. Naive để ~86 request cùng vượt qua check `NULL` rồi cùng `UPDATE` một row → **86 lần ghi serialize** trên cùng row lock + mỗi lần tạo version mới (MVCC bloat) + 86 commit/fsync. FOR UPDATE giành lock SỚM ở `SELECT` nên 99/100 thấy "đã có chủ" → **bỏ cuộc trước khi ghi**, chỉ 1 lần `UPDATE`. → Naive dời lock xuống `UPDATE` và **nhân lên 86 lần**; ít ghi hơn ⇒ FOR UPDATE nhanh hơn dù vẫn xếp hàng.
>
> *Số đo thật trên localhost, 100 request đồng thời (order-of-magnitude). Điều luôn đúng bất kể scale: naive oversubscribed + làm việc thừa, FOR UPDATE đúng, Redis né lock nên nhanh nhất. Lưu ý: ở contention cao hơn nhiều (hàng nghìn request + network) thì đuôi của FOR UPDATE mới phình to.*

### Điểm then chốt

Redis SET NX không phải silver bullet. Nếu server crash sau khi Redis set key nhưng trước khi ghi vào PostgreSQL → state lệch: Redis nói house đang có người, PostgreSQL không biết gì.

**Pattern đúng — kết hợp cả hai:**

```
User request
    ↓
Redis SET NX     → chặn race condition, coordination ngắn hạn
    ↓ success
PostgreSQL UPDATE → ghi truth, audit log
    ↓
Khai thác bắt đầu ✓
    ↓ 30 phút sau
Redis TTL expire + PostgreSQL cleanup
```

> Vậy còn crash giữa hai bước thì sao? **TTL chính là cái cứu.** Redis lock tự hết hạn sau 30 phút nên không kẹt vĩnh viễn — xấu nhất là một house bị "khoá nhầm" tạm thời rồi tự mở. Và vì **PostgreSQL là truth**, khi hai bên lệch thì đối soát theo PostgreSQL chứ không theo Redis. Độ lệch luôn bị chặn trên (bounded), không tích luỹ. (Cùng nguyên tắc "PostgreSQL thắng khi lệch" sẽ gặp lại ở Demo 3.)

### Scale bottleneck (DB level)

- **PostgreSQL hot row** — hàng nghìn transaction cùng lock một row, write throughput cả table bị ảnh hưởng
- **Redis hot key** — single key bị hit quá throughput của 1 Redis instance

Bottleneck khi scale thường nằm ở **access pattern**, không phải lượng data.

### Takeaway

```
Redis   → coordination ngắn hạn, atomic, cực nhanh
Postgres → final truth, audit log, không mất khi restart

Không để Redis làm truth cuối cùng.
Không để Postgres làm coordination layer dưới spike.
```

---

## Demo 2 — Hero / building / item config (15–18 phút)

### Bài toán

Hero Tank khác Hero AP, Building Farm khác Building Barracks — config nested, optional fields, evolve nhanh. Mỗi hero còn cần đọc kèm thông tin user sở hữu. Game iterate liên tục, tuần nào cũng thêm skill mới, hero type mới.

**So sánh:** PostgreSQL thuần (`pixiland_norm`) · PostgreSQL JSONB (`pixiland_jsonb`) · MongoDB (`pixiland`)

> Demo 2 seed **2 database Postgres riêng** — cùng schema table (`users`, `wallets`, `heroes`) nhưng norm vs JSONB embed. Sau benchmark read/migration, chạy `npm run db:size` để so disk live (embed trả giá storage).

**Chạy live — tách từng phần** (seed một lần, rồi chạy từng layer cho dễ theo dõi):

```bash
npm run demo:2:seed     # đầu buổi: nạp 100K hero vào norm/jsonb/mongo (~10s)
npm run demo:2:layer1   # Layer 1 — read patterns (xuôi / ngược / index)
npm run demo:2:layer2   # Layer 2 — schema evolution (lock dưới tải)
npm run demo:2:lock     # bằng chứng pg_locks (ALTER rewrite chặn reader)
npm run db:size         # so dung lượng norm vs jsonb vs mongo
# demo:2 (không hậu tố) = chạy cả chuỗi để rehearsal
# SQL chạy tay trên DataGrip: demos/02-hero-config/queries.sql
```

### So sánh 3 approach

**PostgreSQL thuần — normalized**

Tạo bảng riêng cho từng loại entity: `users`, `heroes`, `hero_skills`, `hero_effects`... Query một hero kèm owner phải JOIN qua `users`.

- ✓ Constraint rõ ràng, FK đảm bảo integrity
- ✗ Thêm field mới → ALTER TABLE hoặc thêm bảng → schema migration chậm, team velocity giảm

**PostgreSQL JSONB**

Giữ một bảng với cột `config JSONB` chứa nested data, gồm cả owner snapshot. Phần còn lại vẫn SQL bình thường.

- ✓ Schema linh hoạt trong khi vẫn giữ ACID, JOIN với SQL tables bình thường
- ✓ Một DB duy nhất — một connection string, một backup strategy
- ✓ Index nested field được — **B-tree expression** cho field cụ thể (`CREATE INDEX ON heroes ((config->>'rarity'))`), hoặc **GIN** cho truy vấn containment (`config @> '{"rarity":"SSR"}'`)
- ✗ Owner snapshot duplicate — user đổi tên/level thì app phải sync hoặc chấp nhận snapshot cũ
- ✗ Không có constraint trên nested field — validate phải ở application layer

**MongoDB**

Document tự nhiên, không cần khai báo schema. Hero document có thể embed owner snapshot. Thêm field mới: chỉ cần ghi document mới với field đó.

- ✓ Developer experience tốt nhất khi schema thay đổi liên tục
- ✓ Đọc hero kèm owner một query, không cần JOIN
- ✓ Đọc ngược owner → heroes bằng index trên `owner.id`
- ✗ Không có foreign key — `owner_id` trỏ vào đâu không ai kiểm tra
- ✗ Owner đổi tên/level → phải update nhiều document hoặc chấp nhận denormalized snapshot

### Benchmark — Layer 1: Read patterns (100K hero · 5K user · whale skew)

| Operation | Postgres thuần | Postgres JSONB | MongoDB |
|---|---|---|---|
| Bulk insert 100K | ~4s (4 bảng) | ~3.5s | ~1.2s |
| Hero full view (đọc xuôi) | ~0.9ms (JOIN 4 bảng, live) | ~0.5ms (1 JSONB) | ~0.5ms (1 document) |
| Owner → heroes **multi (idx)** | ~1ms (users ⋈ wallets ⋈ heroes) | ~1ms (3 bảng JOIN) | ~2ms (`$lookup` ×2) |
| Owner → heroes **multi NO idx** | ~4ms | ~9ms | ~27ms (`$lookup` scan) |

> **Bulk insert:** PG dùng `unnest` (1 query/bảng), Mongo `insertMany` — so sánh công bằng, không row-by-row. PG normalized vẫn chậm hơn vì ghi **4 bảng** (heroes + 90K skill rows), không phải vì API insert kém.
>
> **Hero full view:** PG **JOIN 4 bảng** + `json_agg` (live). JSONB/Mongo **1 read** (snapshot).
>
> **Đọc ngược:** từ user lấy heroes + wallet — PG/JSONB **multi JOIN**; Mongo **`$lookup` wallets + heroes**. Có index PG thắng; NO idx Mongo `$lookup` scan ~27ms. PG normalized thêm `hero_skills` = bảng thứ 4 khi cần skill.

### Kiểm tra dung lượng (live — sau seed)

Embed owner/wallet snapshot → trả bằng disk. **Không in trong script** — presenter chạy tay:

```bash
npm run db:size           # tổng từng PG database + Mongo collections
npm run db:size:pg:tables # chi tiết bảng trong norm vs jsonb
```

Kỳ vọng định tính (100K hero): `pixiland_jsonb` **lớn hơn** `pixiland_norm` (~1.5–1.7×) vì duplicate snapshot trong `config`; `users`/`wallets` gần bằng nhau. Mongo embed tương tự nhưng BSON gọn hơn JSONB text.

> **Ghi chú:** PG dùng `pg_database_size`; Mongo dùng `collStats` (logical + disk). Nhấn **ratio norm vs jsonb**, không so byte tuyệt đối PG vs Mongo.

### Benchmark — Layer 2: Schema evolution (thêm field `trait`)

Tuần mới thêm passive trait cho hero. **Đừng đo "backfill nhanh hay chậm"** — đo sai thì SQL trông *thắng* (backfill `UPDATE` của PG nhanh hơn Mongo). Hai câu hỏi đúng là: (A) migration có **bắt buộc** không, và (B) migration có **block traffic đang chạy** không.

**Part A — đọc field mới trên data CŨ (chưa migrate):**

| | Postgres thuần | Postgres JSONB | MongoDB |
|---|---|---|---|
| `SELECT trait` trên row cũ | ❌ `ERROR: column "trait" does not exist` | ✓ `null` | ✓ `null` |
| Migration có **bắt buộc**? | **Có** — phải ALTER trước khi dùng được | Không — đọc lazy, default ở app | Không — đọc lazy, default ở app |

→ Normalized: field phải tồn tại như **cột thật** thì mới đọc được → buộc DDL. JSONB/Mongo: field vắng đọc ra `null` → app `trait ?? 'Steadfast'` chạy luôn, **0 migration**.

**Part B — chạy migration trong khi OLTP đang đọc `heroes` (6 luồng song song):**

| Migration (under load) | Migrate time | OLTP max | OLTP avg | Block? |
|---|---|---|---|---|
| PG norm — `ADD COL NOT NULL DEFAULT` (rewrite) | ~140ms | **~130ms** | ~4ms | **CÓ** — 6/6 reader kẹt ≈ trọn lock |
| PG JSONB — backfill `UPDATE` | ~0.9s | ~40ms | ~0.1ms | Không (reader chạy ~33K query) |
| Mongo — `updateMany` | ~0.6s | ~13ms | ~0.4ms | Không |

> **Cú twist:** PG-norm rewrite *nhanh hơn* về tổng thời gian (~140ms vs ~0.9s) **nhưng giữ `ACCESS EXCLUSIVE`** suốt lúc rewrite → mọi reader **đóng băng** đúng bằng thời gian đó (`OLTP max ≈ migrate time`). JSONB backfill *lâu hơn* nhưng chỉ row-lock MVCC → reader **không bị chặn**, vẫn chạy hàng chục nghìn query. Nhanh trên giấy ≠ an toàn khi đang live.

> **Bằng chứng lock (live):** `npm run demo:2:lock` — script chạy ALTER rewrite trong khi 6 reader đọc song song, rồi in snapshot `pg_locks` bắt được: 1 dòng `AccessExclusiveLock granted=t` (ALTER) + 6 dòng `AccessShareLock granted=f (waiting)` (reader xếp hàng). Đây là cái queue có thật, không phải mô phỏng.
>
> ```sql
> -- query quan sát (psql) — chạy trong lúc ALTER đang giữ lock:
> SELECT l.pid, a.state, l.mode, l.granted
> FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
> WHERE l.relation = 'lock_demo'::regclass
> ORDER BY l.granted DESC, l.pid;
> ```

> **Ghi chú độ chính xác (kẻo bị bắt bẻ):**
> - PG 11+ `ADD COLUMN` nullable / `DEFAULT` hằng số = **metadata-only** (~vài ms, không rewrite). Demo cố tình dùng `DEFAULT` tính per-row (volatile) để minh hoạ **migration rewrite thật** — cùng họ với đổi type, `SET NOT NULL`, `ADD CONSTRAINT ... CHECK` (validate scan). Không phải mọi ALTER đều khoá.
> - Điểm cốt lõi: với normalized, field là **cột** → một số schema change buộc rewrite/scan giữ lock. Với JSONB/Mongo field nằm trong **blob linh hoạt** → thêm field **không bao giờ rewrite bảng** → không đụng traffic đang chạy.
> - Đây là **developer velocity + safe-migration scale**, không phải throughput scale.

### Tổng hợp trade-off

| | Đọc xuôi (embed) | Cross-table / JOIN | Đọc ngược | Schema evolve |
|---|---|---|---|---|
| PG thuần | Chậm hơn (JOIN) | **Thắng** | **Thắng** (btree FK) | ALTER + backfill |
| PG JSONB | Nhanh | **Thắng** (hybrid) | Cần index | Không DDL |
| MongoDB | Nhanh | Chậm (`$lookup`) | Cần index | Không DDL |

| Thêm field mới | ALTER TABLE ⚠ | Không cần | Không cần |
| Foreign key constraint | ✓ DB level | ✓ SQL tables | ✗ Application only |
| Operational overhead | 1 DB | 1 DB | DB riêng, maintain thêm |

> Không có approach nào thắng mọi chiều. **Mongo/JSONB thắng đọc xuôi + schema evolve; SQL thắng cross-table JOIN + đọc ngược quan hệ.** JSONB là sweet spot khi cần cả hai.

### Scale bottleneck

Bottleneck của demo này **không chỉ** query speed — mà là access pattern + schema evolution:

- **Access pattern:** embed thắng đọc xuôi; quan hệ chéo bảng + đọc ngược thắng SQL
- **Schema evolution:** PG thuần = migration file + ALTER + backfill; JSONB/Mongo = ship code trước, backfill sau (hoặc không backfill)
- **Data integrity:** JSONB và MongoDB đẩy trách nhiệm validate lên application layer
- **Duplicate snapshot:** embed owner giúp đọc xuôi; đọc ngược vẫn cần index. User đổi tên → fan-out update
- **Operational complexity:** MongoDB là một DB riêng — thêm một hệ thống cần maintain

### Khi nào chọn gì

- **PostgreSQL thuần:** entity có quan hệ phức tạp, schema ổn định → `users`, `wallets`, `transactions`
- **PostgreSQL JSONB:** muốn flexibility nhưng không muốn thêm DB mới → `hero_config`, `building_config`
- **MongoDB:** team đã quen document model, hoặc object rất lớn, nested sâu, ít JOIN

### Takeaway

```
Không có storage nào thắng mọi access pattern.
Mongo/JSONB thắng đọc xuôi + schema evolve (không DDL).
SQL thắng cross-table JOIN + đọc ngược quan hệ.
PostgreSQL JSONB là sweet spot — flexible config + vẫn JOIN wallet/user.
Chọn MongoDB khi document là access pattern chính, không phải chỉ vì schema hay đổi.
```

---

## Demo 3 — Leaderboard realtime (12–15 phút)

### Bài toán

PvP season ranking: điểm tăng sau mỗi trận, top 100 hiển thị realtime, cuối season top 10 nhận phần thưởng (vật phẩm / tiền in-game).

**Hai yêu cầu trông giống nhau nhưng thực ra rất khác:**

| | Realtime display | Settlement cuối season |
|---|---|---|
| Mục tiêu | Top 100 trên màn hình | Reward chính xác |
| Yêu cầu | Nhanh, latency thấp | Đúng tuyệt đối |
| Sai một bậc | Chấp nhận được | Mất phần thưởng thật |
| Audit trail | Không cần | Bắt buộc |

→ Đây là lúc introduce khái niệm **read model vs truth**.

### So sánh 2 approach

**PostgreSQL UPSERT + ORDER BY**

Mỗi trận update điểm vào bảng `leaderboard`. Query top N bằng `ORDER BY score DESC LIMIT 100`.

- ✓ Data luôn consistent, cuối season query ra số chính xác, có audit trail từng trận
- ✓ Top-N nhanh **nếu có index `(score DESC)`** — kể cả lúc write spike, ở scale vừa
- ✗ Tải leaderboard đè chung lên OLTP game; chỉ thật sự chậm khi scale rất lớn hoặc thiếu index

**Redis Sorted Set**

`ZADD` update điểm (O log N), `ZREVRANGE` query top N (O log N + M). Tự động maintain thứ tự, không có lock, không có sort lúc query.

- ✓ Write throughput cao (~5x), tách hẳn tải leaderboard khỏi OLTP, O(log N) tự giữ thứ tự
- ✗ In-memory — restart mất data nếu không config persistence đúng
- ✗ Không có audit trail, không query phức tạp theo region

### Benchmark — 100K update + top-10 query (idle & dưới spike)

| | PostgreSQL (có index) | Redis Sorted Set |
|---|---|---|
| 100K update (throughput) | ~2.8s | ~0.5s |
| top-10 read — lúc rảnh | ~0.1ms | ~0.0ms |
| top-10 read — dưới write spike | ~0.5ms | ~0.4ms |
| Data sau restart | ✓ | Cần config AOF/RDB |
| Audit trail | ✓ | ✗ |

> Số đo thật (localhost, 100K update). **Bất ngờ:** với index `(score DESC)`, top-10 của Postgres nhanh ngang Redis — kể cả lúc spike. "Redis nhanh hơn 200 lần" là **myth** khi PG được index đúng. Khác biệt thật: **Redis thắng write throughput (~5x) và tách tải leaderboard khỏi OLTP**. Đừng thêm Redis chỉ vì sợ đọc chậm — thêm khi write rate rất cao hoặc muốn cô lập spike khỏi DB chính (Pitfall 6).
>
> Câu hỏi vẫn đúng: bạn có dám dùng Redis (in-memory, không audit) để quyết định ai nhận reward cuối season không? → không. Reward tính từ Postgres.

### Pattern đúng — tách read model và truth

```
Mỗi trận kết thúc:
  → PostgreSQL: ghi battle result (truth, audit log)
  → Redis ZADD: update score (read model, realtime display)

Cuối season:
  → PostgreSQL: tính lại từ battle results → final ranking → reward
  → Redis: clear, reset cho season mới
```

Nếu Redis và PostgreSQL lệch nhau → **PostgreSQL thắng**.

> Hệ quả đẹp: Redis crash mất sạch leaderboard cũng **không sao** — vì nó chỉ là read model, rebuild lại từ battle results trong PostgreSQL là xong. Cái "✗ restart mất data" ở trên vì vậy không còn đáng sợ trong kiến trúc này. Đó chính là lợi ích của việc tách read model khỏi truth.

### Scale bottleneck (DB level)

- **High-frequency writes vào PostgreSQL:** batch insert thay vì insert từng record, partition table theo season
- **Hot leaderboard Redis:** shard leaderboard theo region, dùng Redis Cluster
- **Divergence Redis vs PostgreSQL:** chấp nhận eventual consistency cho display; PostgreSQL là truth, định kỳ rebuild Redis từ PostgreSQL khi lệch. Lưu ý: Lua script chỉ đảm bảo atomic cho nhiều thao tác *trong Redis* — không thể atomic xuyên hai hệ thống; muốn ghi nhất quán cả hai cần outbox / transactional pattern

### Takeaway

```
Read model và truth không nhất thiết cùng một chỗ.

Redis Sorted Set → read model: write throughput cao, tách tải khỏi OLTP
PostgreSQL       → settlement, reward, audit trail (truth)

Câu hỏi không phải "dùng cái nào"
mà là "phần nào cần đúng tuyệt đối, phần nào cần nhanh tuyệt đối".
```

---

## Demo 4 — Match history / activity feed (wide-column) (12–15 phút)

### Bài toán

Mỗi trận PvP sinh một event, **append-only** (gần như không sửa). Hai nhu cầu: (1) ghi **cực nhiều** event liên tục, (2) đọc nhanh "**50 trận gần nhất của player X**" cho màn history. Đây đúng họ workload Discord mô tả ở Hook — và Discord dừng lại ở **ScyllaDB** (wide-column).

> Demo này dùng **ScyllaDB** — CQL/Cassandra-compatible nhưng viết bằng C++ (shard-per-core, không JVM). Cùng `cassandra-driver`, cùng mô hình dữ liệu Cassandra; gọn và nhanh hơn để demo.

**Chạy live — từng phần** (Scylla khởi động chậm, `db:up` 1 lần đầu buổi):

```bash
npm run demo:4:seed      # ghi 200K event vào PG + Scylla (đo write throughput)
npm run demo:4:read      # "last 50 của player X" — partition read
npm run demo:4:contract  # query-first contract: ad-hoc Scylla từ chối
npm run demo:4           # cả ba
# CQL/SQL chạy tay (DataGrip): demos/04-match-history/queries.cql
```

### So sánh 2 approach

**PostgreSQL** — `matches(player_id, match_time, …)` + index `(player_id, match_time DESC)`.
- ✓ Query bất kỳ: JOIN, ad-hoc WHERE, thêm index cho pattern mới — rất linh hoạt
- ✓ Đọc "last 50" nhanh nhờ index
- ✗ Write throughput đụng **trần 1 node** (B-tree + WAL/fsync); scale ngang khó

**ScyllaDB (wide-column)** — `PRIMARY KEY ((player_id), match_time, match_id)`, clustering `match_time DESC`.
- ✓ Write throughput cao (LSM append, shard-per-core), **scale-out tuyến tính** nhiều node + HA multi-DC
- ✓ Partition read "last 50" = seek 1 partition, đã sort sẵn — phẳng bất kể bảng to
- ✗ **Query-first contract:** không JOIN, không ad-hoc; query theo cột không phải partition key → **từ chối** (cần `ALLOW FILTERING` = full scan, hoặc tạo bảng denormalized mới, ghi event nhiều lần)

### Benchmark — 200K event (số đo thật, 1 node localhost)

| | PostgreSQL | ScyllaDB |
|---|---|---|
| Write 200K event (concurrent, append) | ~3.9s · **~51k/s** | ~1.7s · **~120k/s** |
| Partition read "last 50 của player X" | ~0.2ms | ~0.3ms |
| Ad-hoc theo `opponent` (không phải PK) | seq scan ~16ms → **thêm index ~1ms** | **TỪ CHỐI** · ALLOW FILTERING scan ~9ms · hoặc tạo bảng mới |

> **Đo, đừng đoán — KY VONG: "Scylla nhanh hơn Postgres mọi mặt".** Số thật:
> - **Write: Scylla thắng thật (~2.3x)** trên 1 node — shard-per-core, append-only LSM. Đây là win trung thực.
> - **Read partition: NGANG nhau** — đừng oversell "NoSQL đọc nhanh hơn"; PG có index đọc top-N ngang Scylla.
> - **Ad-hoc/JOIN: Scylla THUA** — nó *từ chối* query ngoài partition key. PG chỉ cần thêm 1 index.
>
> **Cảnh báo trung thực (kẻo bị bắt bẻ):** demo chạy **1 node + developer-mode** → số minh hoạ. Thế mạnh THẬT của Scylla — **scale-out tuyến tính nhiều node + HA multi-DC** — *không thể demo trên 1 container*; đó mới là lý do Discord chọn nó cho hàng nghìn tỷ message. 1 node chỉ cho thấy *write path nhanh + contract query-first*.

### Pattern đúng — query-first, denormalize có chủ đích

```
Wide-column: thiết kế BẢNG THEO QUERY, không theo entity.
  matches_by_player   → đọc theo player (history)
  matches_by_opponent → đọc theo đối thủ (nếu cần) — GHI EVENT 2 LẦN

Không JOIN, không ad-hoc. Mỗi access pattern = một bảng.
Đổi flexibility lấy: write throughput + scale ngang tuyến tính + HA.
```

### Scale bottleneck (DB level)

- **PostgreSQL:** write throughput trần 1 node; phải partition table + (cuối cùng) sharding thủ công khi event vượt sức 1 máy
- **ScyllaDB:** thêm node → throughput + dung lượng tăng gần tuyến tính (consistent hashing); bottleneck chuyển sang **thiết kế partition key** (hot partition nếu key lệch) và **chi phí denormalize** (mỗi query pattern = 1 bảng + 1 lần ghi)

### Takeaway

```
Wide-column không "nhanh hơn SQL" — nó là HỢP ĐỒNG KHÁC.
Đổi: JOIN + ad-hoc query  →  lấy: write scale-out tuyến tính + partition read phẳng.

ScyllaDB/Cassandra → write-heavy, append-only, đọc theo partition key đã biết trước,
                     cần scale ngang nhiều node (Discord: nghìn tỷ message).
PostgreSQL         → cần query linh hoạt (JOIN, ad-hoc, index tuỳ ý), scale 1 node là đủ.

Câu hỏi vẫn là access pattern: bạn có biết TRƯỚC mình sẽ query thế nào không?
```

---

## Demo 5 — Analytics (12–15 phút)

### Bài toán

Admin cần: DAU theo ngày, hero win rate, region active nhất, mining pool participation theo giờ.

Với 50K DAU, battle log sau 6 tháng vẫn có thể đạt **50–100 triệu rows**. Query `SUM`, `COUNT`, `GROUP BY` trên hàng chục triệu rows trong khi PostgreSQL đang đồng thời phục vụ transaction game → tranh CPU, I/O → latency toàn hệ thống tăng đúng lúc người đang chơi.

**Tại sao đây là vấn đề kiến trúc, không phải query optimization:**

```
OLTP  → ít rows, nhiều lần, write + read lẫn nhau → point query, index tối ưu
OLAP  → nhiều rows, ít lần, read-heavy, aggregate nặng → columnar storage, scan theo cột
```

Hai pattern này **ngược nhau** — không thể tối ưu cùng một lúc.

### Tại sao ClickHouse cho demo này

ClickHouse là **production choice** cho OLAP: columnar server riêng (MergeTree + `LowCardinality`), scale-out được, và DataGrip nối native để xem data tận tay. Vì là engine riêng (process/máy riêng) nên minh hoạ rõ điểm "tách analytics khỏi OLTP". (DuckDB là lựa chọn **in-process** nhẹ hơn — không cần server, đọc thẳng Parquet — hợp khi chỉ cần embed analytics; cùng tư duy columnar.)

### Benchmark — 5 triệu battle log rows (demo scale; production thực tế 50–100 triệu rows)

| Query | PostgreSQL | ClickHouse |
|---|---|---|
| Hero win rate (90 ngày) | ~208ms | ~16ms (13x) |
| DAU theo ngày | ~2.3s | ~49ms (46x) |
| Battles theo region+giờ | ~238ms | ~24ms (10x) |
| **Chạy chung OLTP?** | **tranh CPU/IO với game** | **engine riêng — không đụng** |

> Số đo thật (localhost, 5M rows). ClickHouse nhanh hơn **~10–46x** cho aggregate scan — `count(distinct)` ở DAU chênh nhất (~46x, columnar quét 1 cột thay vì cả hàng). Nhưng điểm quan trọng nhất không phải tốc độ: khi analytics chạy engine riêng, query nặng không tranh CPU/IO với transaction người đang chơi (contention) — xem giải thích contention ở phần dưới.

### "Không ảnh hưởng OLTP" — với một điều kiện

Dòng cuối chỉ đúng khi data **đã** nằm ở layer riêng. Vậy `battle_logs` (event log append-only của hệ thống) đi sang OLAP bằng cách nào:

- **Export Parquet định kỳ** — cron dump theo batch, đơn giản nhất cho demo / scale vừa
- **CDC** (Debezium…) — stream thay đổi gần realtime sang OLAP
- **Read-replica** — chạy analytics trên bản replica, không đụng primary

Mấu chốt: **chính khâu sync cũng tốn tài nguyên** — cho nó chạy off-peak hoặc trên replica, đừng scan nặng từ primary đúng giờ cao điểm. "Tách OLAP" nghĩa là tách cả compute lẫn đường lấy data, không chỉ đổi chỗ chạy query.

### Scale bottleneck (DB level)

- **Data volume:** battle log tăng tuyến tính theo active user và thời gian. PostgreSQL bắt đầu chật vật khi table vượt vài trăm triệu rows dù có partition
- **Aggregate scan:** OLTP index tối ưu cho point query, không phải aggregate scan — đây là lý do columnar thắng tuyệt đối ở analytics workload
- **Dashboard đè OLTP:** càng nhiều admin dùng đồng thời, càng nhiều heavy query song song — không có index nào cứu được

### Takeaway

```
Vấn đề không phải query có chạy được không.
Vấn đề là có nên để analytics chạy trên OLTP không.

PostgreSQL       → OLTP, transaction path, source of truth
ClickHouse/DuckDB → OLAP, analytics, dashboard — không đụng production

Tách hai layer này ra là quyết định kiến trúc, không phải tối ưu performance.
```

---

## Pitfalls (12–15 phút)

> "Tất cả những gì vừa demo đều trông rõ ràng và hợp lý. Nhưng thực tế các team thường không bắt đầu với kiến trúc đẹp — họ bắt đầu với deadline, rồi dần dần accumulate những quyết định nhỏ tưởng vô hại."

### Pitfall 1 — Redis làm source of truth

**Xảy ra khi nào:** team thấy Redis nhanh, tiện, bắt đầu lưu thêm nhiều thứ — balance tài nguyên, trạng thái quest, inventory.

**Vấn đề:** Redis mặc định in-memory, restart là mất data (trừ khi config AOF/RDB đúng). Có `MULTI/EXEC` và Lua cho atomic nhiều key, nhưng không có rollback thật, không có isolation level như SQL, durability mặc định yếu — không thay thế được ACID của một transactional DB.

**Dấu hiệu:** team viết script "sync Redis về PostgreSQL" chạy định kỳ.

> Nếu Redis restart ngay lúc này, hệ thống có mất data quan trọng không? Nếu có — Redis đang làm việc của PostgreSQL.

---

### Pitfall 2 — MongoDB nhưng tư duy SQL

**Xảy ra khi nào:** team chọn MongoDB vì "flexible" nhưng vẫn model data theo kiểu relational — mỗi entity một collection, reference qua ID, query bằng `$lookup` khắp nơi.

**Vấn đề:** `$lookup` không có query planner thông minh như SQL JOIN. Không có FK index tự động. Query tưởng đơn giản lại chậm hơn PostgreSQL JOIN, không có cách enforce referential integrity.

**Dấu hiệu:** codebase có nhiều `$lookup` 3–4 stage pipeline, hoặc application phải làm nhiều round-trip để assemble một object đầy đủ.

> MongoDB không phải SQL với JSON. Nếu data tự nhiên là relational, đừng ép nó vào document model.

---

### Pitfall 3 — Duplicate data không kiểm soát

**Xảy ra khi nào:** team embed/denormalize data cho tiện — tên hero, rarity, stats nhét thẳng vào document (MongoDB) hoặc cột JSONB — rồi data thay đổi nhưng chỉ update một chỗ.

**Vấn đề:** không có single source of truth. `battle_logs` lưu rarity "SR", `heroes` đã update lên "SSR" sau event. Query từ hai collection ra kết quả khác nhau.

**Dấu hiệu:** bug report kiểu "data hiển thị khác nhau tùy chỗ", hoặc team phải họp để thống nhất "collection nào là đúng".

> Denormalization là công cụ, không phải default. Mỗi lần embed data, hỏi: khi data này thay đổi, bao nhiêu chỗ cần update?

---

### Pitfall 4 — SQL ôm luôn analytics

**Xảy ra khi nào:** ban đầu vài query báo cáo đơn giản, chạy tốt. Dần dần thêm nhiều dashboard hơn, query phức tạp hơn, data lớn hơn — nhưng vẫn chạy trên PostgreSQL production.

**Vấn đề:** càng thêm index cho analytics, write performance của OLTP càng chậm vì mỗi write phải update nhiều index hơn. Hai workload tự triệt tiêu nhau.

**Dấu hiệu:** báo cáo được schedule chạy lúc 2 giờ sáng để tránh giờ cao điểm. Đây là dấu hiệu rõ nhất cần tách OLAP layer.

---

### Pitfall 5 — Hiểu sai scalability

**Nhiều user ≠ cùng bottleneck.** 1M user / 50K DAU nhưng peak concurrent thường chỉ vài nghìn đến hơn 10K. PostgreSQL handle được tốt. Nhưng nếu event spike — lượng lớn user cùng login trong vài phút — bottleneck là connection pool, không phải query speed.

**Contention scale ≠ data volume scale.** House occupation — bottleneck không phải vì nhiều data, mà vì nhiều request tranh cùng một row. Thêm read replica không giải quyết được write contention.

**Schema scale ≠ write scale.** MongoDB flexible schema giúp team iterate nhanh hơn — đây là *developer velocity scale*, không phải *throughput scale*. Nhiều team chọn MongoDB vì nghĩ nó "scale hơn SQL" nhưng đang giải quyết nhầm vấn đề.

> Trước khi nói hệ thống không scale, xác định bottleneck nằm ở đâu: data volume, write contention, read throughput, hay schema evolution? Mỗi cái có giải pháp DB khác nhau.

---

### Pitfall 6 — Vội polyglot, thêm DB quá sớm

**Xảy ra khi nào:** mới khởi động đã dựng Postgres + Redis + Mongo + ClickHouse "cho đúng best practice", trong khi traffic còn nhỏ và một mình Postgres thừa sức gánh.

**Vấn đề:** mỗi DB thêm vào là thêm một hệ thống phải vận hành — backup, monitoring, on-call — cộng bài toán giữ consistency giữa các store. Độ phức tạp tăng *trước cả khi* có vấn đề scale thật cần giải.

**Dấu hiệu:** có service cho mỗi DB nhưng phần lớn chỉ chứa vài nghìn record; team tốn thời gian sync giữa các store hơn là làm feature.

> Polyglot là đích đến khi bottleneck buộc phải tách, không phải điểm xuất phát. Bắt đầu với Postgres (+ JSONB), chỉ thêm Redis/OLAP khi **đo được** nút thắt thật.

---

### Chốt Pitfalls

```
Không có database nào tệ tuyệt đối.
Vấn đề đến từ việc dùng sai storage cho sai workload.

Redis làm truth          → mất data
MongoDB tư duy SQL       → chậm hơn SQL thật
Duplicate không kiểm soát → không biết đâu là đúng
Analytics đè OLTP        → cả hai đều chậm
Hiểu sai bottleneck      → giải pháp đúng, sai vấn đề
Vội polyglot             → phức tạp trước khi cần
```

---

## Decision Framework (8–10 phút)

> "Sau tất cả những gì vừa demo, câu hỏi thực tế là: khi gặp bài toán mới, bắt đầu từ đâu? Không phải từ 'dùng DB gì' — mà từ 'data này đóng vai trò gì trong hệ thống'."

### Bước 1 — Xác định layer của data

```
Transactional truth    → data phải đúng tuyệt đối, có audit
Flexible config        → nested, evolve nhanh, đọc nguyên object
Realtime coordination  → ngắn hạn, atomic, không cần persist lâu
Read model / ranking   → display nhanh, chấp nhận eventual
Event log              → append-only, volume lớn, ít update
Analytics              → aggregate nặng, scan lớn, offline ok
```

### Bước 2 — 4 câu hỏi trước khi chọn DB

**Câu 1: Workload là gì?**
- Đọc nhiều, point query → SQL với index tốt là đủ
- Ghi nhiều, append-only → wide-column hoặc partition table
- Aggregate scan → OLAP layer riêng

**Câu 2: Consistency level cần là gì?**
- Sai là mất tiền, mất vật phẩm → ACID, PostgreSQL
- Sai là hiển thị rank lệch vài giây → eventual ok, Redis
- Sai là analytics report hơi cũ → batch sync ok, ClickHouse

**Câu 3: Access pattern là gì?**
- Đọc theo ID, JOIN nhiều bảng → relational SQL
- Đọc nguyên object, nested field → document hoặc JSONB
- Đọc top N liên tục → Sorted Set
- Đọc theo time range, aggregate → columnar

**Câu 4: Bottleneck khi scale sẽ nằm ở đâu?**
- Data volume lớn → partition, OLAP
- Write contention → Redis coordination
- Schema thay đổi nhanh → JSONB hoặc document
- Read spike → cache layer, read replica

### Bước 3 — Chọn DB

| Câu hỏi | Chọn | Ví dụ trong game |
|---|---|---|
| Cần ACID / source of truth? | **PostgreSQL** | user, vÃ­ in-game, váº­t pháº©m, káº¿t quáº£ tráº­n |
| Coordination ngắn hạn / atomic? | **Redis** | house lock, cooldown, rate limit |
| Realtime rank / read model? | **Redis Sorted Set** | PvP leaderboard display |
| Aggregate scan / analytics? | **ClickHouse / DuckDB** | dashboard, win rate, DAU |
| Schema nested + cần JOIN? | **Postgres JSONB** | hero config, building config |
| Document là access pattern chính? | **MongoDB** | khi ít JOIN, đọc nguyên object |

### Production stack đề xuất — nhìn toàn cảnh

```
PostgreSQL        → user, vÃ­ in-game, váº­t pháº©m, káº¿t quáº£ tráº­n     (transactional truth)
PostgreSQL JSONB  → hero config, building config          (flexible truth)
Redis             → house lock, resource counter idle     (coordination)
Redis Sorted Set  → PvP leaderboard display               (read model)
ClickHouse/DuckDB → dashboard, analytics, win rate        (analytics layer)
```

**5 vai trò · 3 engine** (Postgres · Redis · ClickHouse) — Postgres đóng 2 vai (truth + JSONB config), Redis đóng 2 vai (lock + Sorted Set). Một engine gánh nhiều vai; chưa cần đến vai nào thì chưa thêm engine cho vai đó.

> MongoDB **không** nằm trong stack — JSONB đã đủ cho config. Chỉ thêm Mongo khi document trở thành access pattern chính. (Đúng tinh thần Pitfall 6: thêm engine chỉ khi đo được nhu cầu thật.)

---

## Q&A / Discussion (10 phút)

### Câu hỏi gợi mở — kick off discussion

Chọn 2–3 câu tùy cảm nhận audience, không cần hỏi hết:

1. **Tìm sai layer:** Trong hệ thống hiện tại, có chỗ nào analytics đang chạy trên OLTP không? Báo cáo có được schedule chạy lúc 2 giờ sáng không?

2. **Tìm truth:** Nếu hỏi "đâu là source of truth cho user balance hoặc inventory" — trả lời được ngay không, hay phải họp team?

3. **Schema evolution:** Lần gần nhất thêm field mới vào entity chính — mất bao lâu từ quyết định đến deploy? Hơn 1 ngày?

4. **Analytics:** Có dashboard nào đang được schedule chạy lúc ít traffic không? Đó là dấu hiệu analytics đang đè OLTP.

5. **Bottleneck thật:** Lần gần nhất hệ thống bị chậm — bottleneck nằm ở đâu? Data volume, write contention, query nặng, hay connection pool?

### Câu hỏi audience hay hỏi

**"Khi nào nên migrate từ SQL sang NoSQL?"**

Câu hỏi đúng hơn là: workload nào đang bị SQL handle không tốt? Nếu bottleneck là schema evolution thì thêm JSONB trước, chưa cần migrate. Nếu bottleneck là write throughput thì tách workload đó ra riêng, không phải migrate toàn bộ.

**"Supabase có đủ không hay cần thêm DB khác?"**

Supabase là PostgreSQL — đủ cho transactional truth, JSONB, và phần lớn workload ở scale vừa. Thêm Redis khi cần coordination và leaderboard realtime. Thêm OLAP layer khi analytics bắt đầu ảnh hưởng OLTP. Không cần thêm gì cho đến khi thấy bottleneck thật.

**"MongoDB có thật sự cần thiết không hay JSONB là đủ?"**

JSONB đủ cho phần lớn use case document-shaped trong hệ thống đã dùng PostgreSQL. MongoDB có giá trị khi team đã quen document model hoàn toàn, hoặc object rất lớn, nested sâu. Nếu bắt đầu từ đầu và chưa có lý do cụ thể — JSONB trước, MongoDB khi thật sự cần.

**"Discord chuyển sang ScyllaDB có nghĩa là Cassandra tệ không?"**

Không — ScyllaDB là Cassandra-compatible nhưng viết lại bằng C++, latency thấp hơn và dùng ít resource hơn. Discord chuyển vì operational cost, không phải vì Cassandra sai về data model. Wide-column vẫn đúng cho append-heavy workload ở scale đó.

**"Discord edit được message mà — Cassandra không phải append-only hoàn toàn?"**

Đúng. Message trong Cassandra được lưu theo `message_id` immutable. Khi user edit, Discord không update record cũ mà ghi thêm bản ghi mới với cùng `message_id` — đây là **upsert**, last write wins. Cassandra hỗ trợ upsert tốt vì bản chất write là append vào commit log trước, không lock row. Nên nói chính xác: message là **immutable event** — kể cả edit cũng là ghi version mới, không phải sửa record cũ.

**"Game này có cần Graph / Search / Vector DB như slide không?"**

Chưa — nhưng đó là lúc chúng xuất hiện *nếu* workload tới:
- **Graph** (Neo4j…): friend/guild network sâu, đề xuất "bạn của bạn", phát hiện gian lận chuỗi giao dịch / hành vi bất thường.
- **Search** (Elasticsearch…): marketplace cần full-text + filter phức tạp trên item/hero.
- **Vector** (pgvector…): khi thêm AI — gợi ý hero/loadout theo similarity, semantic search.

Nguyên tắc vẫn vậy: thêm khi workload thật xuất hiện, không phải vì nó có trong slide. Và nhiều cái khởi đầu được ngay trong Postgres (pgvector, full-text search built-in) trước khi cần engine riêng.

---

## Câu chốt buổi

> Takeaway quan trọng nhất không phải biết thêm mấy loại DB — mà là biết đặt câu hỏi đúng trước khi chọn: **đây là truth, read model, coordination, hay analytics?** Câu trả lời đó sẽ chỉ ra DB phù hợp.
>
> Và: **đo, đừng đoán.** Hôm nay 3/4 demo cho kết quả khác trực giác — FOR UPDATE không phải chậm nhất, JSONB đủ thay MongoDB, Redis thắng ở write throughput chứ không phải đọc. Đừng tin benchmark trên máy người khác; đo trên hệ của bạn.

---

## Timeline gợi ý

| Phase | Nội dung | Thời gian |
|---|---|---|
| 1 | Hook — nghịch lý cùng scale khác DB | 5 phút |
| 2 | Bối cảnh case study | 5–7 phút |
| 3 | Khung lý thuyết + bản đồ SQL/NoSQL | 7–9 phút |
| 4 | Demo 1 — House race condition | 12–15 phút |
| 5 | Demo 2 — Hero/config schema | 15–18 phút |
| 6 | Demo 3 — Leaderboard realtime | 12–15 phút |
| 7 | Demo 4 — Match history (wide-column) | 12–15 phút |
| 8 | Demo 5 — Analytics | 12–15 phút |
| 9 | Pitfalls | 12–15 phút |
| 10 | Decision framework | 8–10 phút |
| 11 | Q&A / Discussion | 10 phút |
| **Tổng** | | **~120–140 phút** |

> Có thể co nhẹ ở: phần lý thuyết, Demo 2 (bỏ benchmark), Pitfalls (chỉ nêu 3 cái nổi bật nhất).
