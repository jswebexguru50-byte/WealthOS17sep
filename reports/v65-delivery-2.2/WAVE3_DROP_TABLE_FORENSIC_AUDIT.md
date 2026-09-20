# P5-B `DROP TABLE` Forensic Investigation

## Finding
The command `DROP TABLE IF EXISTS DatasetPromotionManifests` was **never executed in production code**. A search of the Git history confirms that this destructive statement only exists within the adversarial test suites (`tests/fasttrack_d2/Delivery2Persistence.test.ts` and `PhysicalPersistenceIntegration.test.ts`), where it is used to guarantee an empty, disposable schema for isolation.

However, there is a material defect regarding the P4 implementation:

## The Production Migration Defect
During P4, the `valid_promoted_evidence` `CHECK` constraint was added directly into the `CREATE TABLE IF NOT EXISTS DatasetPromotionManifests` statement within `src/server/database.ts` (Line 2502).

Because SQLite **does not apply** new schema changes or constraints to an existing table when using `IF NOT EXISTS`, and because it does not support `ALTER TABLE ADD CONSTRAINT` for `CHECK` constraints, **any deployed database will quietly ignore the P4 constraint**.

## Impact
The database was genuinely disposable in the test environments (where `DROP TABLE` is run before each suite). But in a live, populated database, the persistence boundary remains completely undefended because the constraint was never applied to existing instances.

## Next Required Action
As per P5 rules, no production code is remediated in this step.
To fix this, a **formal SQLite migration script** must be designed and authorized in a future step. The migration design must follow the standard SQLite 12-step table schema alteration procedure:

1. `PRAGMA foreign_keys=off;`
2. `BEGIN TRANSACTION;`
3. `CREATE TABLE DatasetPromotionManifests_new (...)` (with the new constraints)
4. `INSERT INTO DatasetPromotionManifests_new SELECT * FROM DatasetPromotionManifests;`
5. `DROP TABLE DatasetPromotionManifests;`
6. `ALTER TABLE DatasetPromotionManifests_new RENAME TO DatasetPromotionManifests;`
7. `COMMIT;`
8. `PRAGMA foreign_keys=on;`
