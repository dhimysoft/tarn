// Migration integrity.
//
// Checks that the schema the migrations produce actually enforces the product
// rules — rather than trusting that Sequelize validators alone will. A
// validator protects the app; a database constraint protects the data from
// anything that writes to it, including a future script.

const test = require("node:test");
const assert = require("node:assert/strict");

const { db, resetDatabase } = require("./helpers");

test.before(resetDatabase);
test.after(async () => db.close());

async function one(sql, replacements = {}) {
  const [rows] = await db.query(sql, { replacements });
  return rows;
}

test("every expected table exists", async () => {
  const rows = await one(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
  );
  const names = rows.map((r) => r.tablename);

  for (const table of ["users", "wellness_check_ins", "user_consents", "session"]) {
    assert.ok(names.includes(table), `missing table: ${table}`);
  }
});

test("migrations are recorded, so they will not re-run", async () => {
  const rows = await one(`SELECT name FROM sequelize_meta ORDER BY name`);
  assert.ok(rows.length >= 4, `expected at least 4 applied migrations, found ${rows.length}`);
});

test("every private record requires a userId", async () => {
  for (const table of ["wellness_check_ins", "user_consents"]) {
    const rows = await one(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = :table AND column_name = 'userId'`,
      { table },
    );
    assert.equal(rows[0]?.is_nullable, "NO", `${table}.userId must be NOT NULL`);
  }
});

test("deleting a user cascades in the database itself", async () => {
  const rows = await one(`
    SELECT tc.table_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name IN ('wellness_check_ins', 'user_consents')
  `);

  assert.equal(rows.length, 2, "both private tables need a foreign key to users");
  for (const row of rows) {
    assert.equal(row.delete_rule, "CASCADE", `${row.table_name} must cascade on delete`);
  }
});

// The database refuses an impossible signal even if the application layer is
// bypassed entirely.
test("the CHECK constraint rejects an out-of-range signal", async () => {
  const [user] = await one(
    `INSERT INTO users (email, "passwordHash") VALUES ('check@example.com', 'x') RETURNING id`,
  );

  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO wellness_check_ins
           ("userId","sleepQuality","stressLevel","mood","energy","focus")
         VALUES (:id, 99, 5, 5, 5, 5)`,
        { replacements: { id: user.id } },
      ),
    /wellness_signals_in_range|check constraint/i,
    "the database must reject a signal outside 1-10",
  );
});

test("a check-in cannot be orphaned", async () => {
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO wellness_check_ins
           ("userId","sleepQuality","stressLevel","mood","energy","focus")
         VALUES ('00000000-0000-4000-8000-000000000000', 5, 5, 5, 5, 5)`,
      ),
    /foreign key|violates/i,
    "a check-in must reference a real user",
  );
});

// This is what stops the localStorage import running twice.
test("the same import checksum cannot be inserted twice for one user", async () => {
  const [user] = await one(
    `INSERT INTO users (email, "passwordHash") VALUES ('import@example.com', 'x') RETURNING id`,
  );

  const insert = () =>
    db.query(
      `INSERT INTO wellness_check_ins
         ("userId","sleepQuality","stressLevel","mood","energy","focus","importChecksum")
       VALUES (:id, 5, 5, 5, 5, 5, 'abc123')`,
      { replacements: { id: user.id } },
    );

  await insert();
  await assert.rejects(insert, /unique|duplicate/i, "a duplicate import must be impossible");
});

test("rows with no checksum are unaffected by that unique index", async () => {
  const [user] = await one(
    `INSERT INTO users (email, "passwordHash") VALUES ('manual@example.com', 'x') RETURNING id`,
  );

  const insert = () =>
    db.query(
      `INSERT INTO wellness_check_ins
         ("userId","sleepQuality","stressLevel","mood","energy","focus")
       VALUES (:id, 5, 5, 5, 5, 5)`,
      { replacements: { id: user.id } },
    );

  // The index is partial, so many NULL-checksum rows must still be allowed.
  await insert();
  await insert();

  const rows = await one(
    `SELECT COUNT(*)::int AS n FROM wellness_check_ins WHERE "userId" = :id`,
    { id: user.id },
  );
  assert.equal(rows[0].n, 2);
});
