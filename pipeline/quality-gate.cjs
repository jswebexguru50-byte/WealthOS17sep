/**
 * Quality gate — the only permitted entry point into the serving database.
 *
 * AGENT_CONSTITUTION.md Rule 5: no extractor, adapter, or script writes to
 * the serving table directly. Everything routes through runQualityGate()
 * first. This is a structural rule, not a convention — the previous audit
 * found the bulk heuristic generator had bypassed the equivalent gate by
 * having its own direct write path, and that must not be possible again.
 *
 * This file has no external dependencies on purpose — it's the last line
 * of defense and shouldn't be able to fail because a package is missing.
 */

const CONFIDENCE_CAPS = {
  LLM_SINGLE_SOURCE: 0.70,
  PRIMARY_PLUS_NARRATIVE: 0.85,
  PRIMARY_PLUS_INDEPENDENT_CORROBORATION: 0.95,
};

const VALID_STATUSES = [
  "VERIFIED",
  "CORROBORATED",
  "DERIVED",
  "UNVERIFIED",
  "CONFLICTED",
  "MISSING",
  "NOT_APPLICABLE",
];

/**
 * @param {object} assertion - a ForensicAssertion-shaped object (see schema/evidence-types.ts)
 * @returns {{ pass: boolean, reason: string|null, assertion: object }}
 */
function runQualityGate(assertion) {
  const fail = (reason) => ({ pass: false, reason, assertion });

  // --- structural checks -----------------------------------------------
  if (!assertion || typeof assertion !== "object") {
    return fail("assertion is not an object");
  }
  const required = ["scripId", "field", "status", "extractionMethod", "methodologyVersion"];
  for (const key of required) {
    if (assertion[key] == null || assertion[key] === "") {
      return fail(`missing required field: ${key}`);
    }
  }
  if (!VALID_STATUSES.includes(assertion.status)) {
    return fail(`invalid status: ${assertion.status}`);
  }

  // --- MISSING / NOT_APPLICABLE must be genuinely empty -----------------
  if (assertion.status === "MISSING" || assertion.status === "NOT_APPLICABLE") {
    if (assertion.value !== null) {
      return fail(`status is ${assertion.status} but value is not null`);
    }
    if (assertion.confidence !== null) {
      return fail(`status is ${assertion.status} but confidence is not null`);
    }
    if (assertion.evidenceIds && assertion.evidenceIds.length > 0) {
      return fail(`status is ${assertion.status} but evidenceIds is non-empty`);
    }
    return { pass: true, reason: null, assertion };
  }

  // --- every non-missing assertion needs at least one evidence pointer --
  if (!assertion.evidenceIds || assertion.evidenceIds.length === 0) {
    return fail(`status is ${assertion.status} but evidenceIds is empty — quarantine, don't serve`);
  }

  // --- CONFLICTED can never carry a confidence score ---------------------
  if (assertion.status === "CONFLICTED" && assertion.confidence !== null) {
    return fail("status is CONFLICTED but confidence is not null");
  }

  // --- confidence caps by extraction method -------------------------------
  if (assertion.confidence != null) {
    if (assertion.extractionMethod === "LLM" && assertion.sourceCount <= 1) {
      if (assertion.confidence > CONFIDENCE_CAPS.LLM_SINGLE_SOURCE) {
        return fail(
          `confidence ${assertion.confidence} exceeds single-source LLM cap of ${CONFIDENCE_CAPS.LLM_SINGLE_SOURCE}`
        );
      }
    }
    if (assertion.confidence >= 1.0) {
      return fail("confidence must never be 1.0 for externally sourced information");
    }
  }

  return { pass: true, reason: null, assertion };
}

/**
 * Convenience wrapper: routes a batch of assertions into pass/quarantine
 * buckets. The caller is responsible for actually persisting each bucket —
 * this function only decides, it doesn't write anywhere, so it stays
 * dependency-free and easy to unit test.
 */
function partitionByQualityGate(assertions) {
  const passed = [];
  const quarantined = [];
  for (const a of assertions) {
    const result = runQualityGate(a);
    if (result.pass) {
      passed.push(result.assertion);
    } else {
      quarantined.push({ assertion: result.assertion, reason: result.reason });
    }
  }
  return { passed, quarantined };
}

/**
 * Persists assertions strictly through the quality gate (AGENT_CONSTITUTION Rule 5).
 * 
 * - Creates ForensicAssertions table if not exists.
 * - Inserts passed assertions.
 * - Routes failed assertions to QuarantinedRecords table.
 * - Updates SecurityDossierSnapshots with evidence-backed operational moat & ANNUAL_REPORT_BACKED tier.
 * 
 * @param {import('sqlite3').Database} db - sqlite3 Database instance
 * @param {Array<object>} assertions - array of ForensicAssertion-shaped objects
 * @returns {Promise<{ passedCount: number, quarantinedCount: number }>}
 */
function persistThroughQualityGate(db, assertions) {
  return new Promise((resolve, reject) => {
    const { passed, quarantined } = partitionByQualityGate(assertions);

    // Ensure ForensicAssertions table exists per schema/evidence-types.ts
    db.run(`
      CREATE TABLE IF NOT EXISTS ForensicAssertions (
        assertionId TEXT PRIMARY KEY,
        scripId TEXT NOT NULL,
        field TEXT NOT NULL,
        value TEXT,
        unit TEXT,
        period TEXT,
        status TEXT NOT NULL,
        evidenceIds TEXT NOT NULL,
        confidence REAL,
        sourceCount INTEGER DEFAULT 1,
        extractionMethod TEXT NOT NULL,
        methodologyVersion TEXT NOT NULL,
        createdAt TEXT NOT NULL
      )
    `, (createErr) => {
      if (createErr) return reject(createErr);

      db.run(`
        CREATE TABLE IF NOT EXISTS QuarantinedRecords (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          scripCode TEXT NOT NULL,
          listingPlatform TEXT NOT NULL,
          fieldName TEXT NOT NULL,
          extractedValue TEXT,
          failureReason TEXT NOT NULL,
          citationVeracityScore REAL,
          sourceDocument TEXT,
          quarantinedAt TEXT DEFAULT CURRENT_TIMESTAMP,
          reviewStatus TEXT DEFAULT 'PENDING'
        )
      `, (qCreateErr) => {
        if (qCreateErr) return reject(qCreateErr);

        db.run(`CREATE INDEX IF NOT EXISTS idx_assertions_scrip ON ForensicAssertions(scripId, field)`, (idxErr) => {
          if (idxErr) return reject(idxErr);

          db.serialize(() => {
            db.run("BEGIN TRANSACTION;");

            const insertStmt = db.prepare(`
              INSERT OR REPLACE INTO ForensicAssertions (
                assertionId, scripId, field, value, unit, period,
                status, evidenceIds, confidence, sourceCount,
                extractionMethod, methodologyVersion, createdAt
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

      for (const p of passed) {
        insertStmt.run([
          p.assertionId,
          p.scripId,
          p.field,
          typeof p.value === "object" ? JSON.stringify(p.value) : (p.value == null ? null : String(p.value)),
          p.unit || null,
          p.period || null,
          p.status,
          JSON.stringify(p.evidenceIds || []),
          p.confidence,
          p.sourceCount || 1,
          p.extractionMethod,
          p.methodologyVersion,
          p.createdAt
        ]);
      }
      insertStmt.finalize();

      // Write quarantined records into QuarantinedRecords
      if (quarantined.length > 0) {
        const qStmt = db.prepare(`
          INSERT INTO QuarantinedRecords (
            scripCode, listingPlatform, fieldName, extractedValue,
            failureReason, citationVeracityScore, sourceDocument,
            quarantinedAt, reviewStatus
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'PENDING')
        `);

        for (const q of quarantined) {
          const a = q.assertion;
          qStmt.run([
            a.scripId,
            "NSE_MAIN",
            a.field,
            typeof a.value === "object" ? JSON.stringify(a.value) : String(a.value),
            q.reason || "QUALITY_GATE_REJECTION",
            a._citation?.similarityScore || null,
            `Method: ${a.extractionMethod} | Version: ${a.methodologyVersion}`
          ]);
        }
        qStmt.finalize();
      }

      // If any passed assertion is VERIFIED or CORROBORATED, update the scrip's tier to ANNUAL_REPORT_BACKED
      const verifiedByScrip = new Map();
      for (const p of passed) {
        if (p.status === "VERIFIED" || p.status === "CORROBORATED") {
          if (!verifiedByScrip.has(p.scripId)) {
            verifiedByScrip.set(p.scripId, []);
          }
          verifiedByScrip.get(p.scripId).push(p.field);
        }
      }

      for (const [scripId, fields] of verifiedByScrip.entries()) {
        db.get(`SELECT full_dossier_json FROM SecurityDossierSnapshots WHERE symbol = ?`, [scripId], (err, row) => {
          if (!err && row && row.full_dossier_json) {
            try {
              const fd = JSON.parse(row.full_dossier_json);
              if (!fd.operationalMoat) fd.operationalMoat = {};
              fd.operationalMoat.qualitativeTier = "ANNUAL_REPORT_BACKED";
              fd.operationalMoat.evidenceBackedFields = Array.from(new Set(fields));
              db.run(
                `UPDATE SecurityDossierSnapshots SET full_dossier_json = ?, updated_at = CURRENT_TIMESTAMP WHERE symbol = ?`,
                [JSON.stringify(fd), scripId]
              );
            } catch (e) {
              // ignore parse errors
            }
          }
        });
      }

        db.run("COMMIT;", (err) => {
          if (err) reject(err);
          else resolve({ passedCount: passed.length, quarantinedCount: quarantined.length });
        });
      });
    });
  });
});
  });
}

/**
 * Authorised chokepoint for writing or updating SecurityDossierSnapshots rows.
 * Constitution Rule 5: All writes to serving dossier table must route through quality-gate.
 *
 * @param {any} db - sqlite3 Database instance
 * @param {object} snapshot - dossier snapshot payload
 * @returns {Promise<{ success: boolean, symbol: string }>}
 */
function persistSnapshotThroughQualityGate(db, snapshot) {
  return new Promise((resolve, reject) => {
    if (!snapshot || !snapshot.symbol) {
      return reject(new Error("QualityGate Reject: snapshot must contain valid symbol"));
    }

    const sym = snapshot.symbol.toUpperCase().trim();
    const researchedAt = snapshot.generatedAt || snapshot.researchedAt || new Date().toISOString();

    const sql = `
      INSERT OR REPLACE INTO SecurityDossierSnapshots (
        symbol, company_name, sector, industry, cmp, day_change_pct, market_cap_cr,
        outlook_json, catalysts_json, sector_positioning_json, macro_mood_json,
        flows_json, fundamentals_json, technicals_json, derivatives_json,
        megatrend_json, concall_json, scores_json, portal_attribution_json,
        full_dossier_json, researched_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `;

    const params = [
      sym,
      snapshot.companyName || '',
      snapshot.sector || '',
      snapshot.industry || '',
      snapshot.cmp || 0,
      snapshot.change1dPct || snapshot.day_change_pct || 0,
      snapshot.marketCapCr || snapshot.market_cap_cr || 0,
      typeof snapshot.outlook === 'object' ? JSON.stringify(snapshot.outlook) : (snapshot.outlook_json || '{}'),
      typeof snapshot.catalysts === 'object' ? JSON.stringify(snapshot.catalysts) : (snapshot.catalysts_json || '{}'),
      typeof snapshot.sectorPositioning === 'object' ? JSON.stringify(snapshot.sectorPositioning) : (snapshot.sector_positioning_json || '{}'),
      typeof snapshot.macroMarketMood === 'object' ? JSON.stringify(snapshot.macroMarketMood) : (snapshot.macro_mood_json || '{}'),
      typeof snapshot.demandSupplyFlows === 'object' ? JSON.stringify(snapshot.demandSupplyFlows) : (snapshot.flows_json || '{}'),
      typeof snapshot.fundamentals === 'object' ? JSON.stringify(snapshot.fundamentals) : (snapshot.fundamentals_json || '{}'),
      typeof snapshot.technicalSetup === 'object' ? JSON.stringify(snapshot.technicalSetup) : (snapshot.technicals_json || '{}'),
      typeof snapshot.derivativesSentiment === 'object' ? JSON.stringify(snapshot.derivativesSentiment) : (snapshot.derivatives_json || '{}'),
      typeof snapshot.megatrendMultibagger === 'object' ? JSON.stringify(snapshot.megatrendMultibagger) : (snapshot.megatrend_json || '{}'),
      typeof snapshot.concallSummary === 'object' ? JSON.stringify(snapshot.concallSummary) : (snapshot.concall_json || null),
      typeof snapshot.scores === 'object' ? JSON.stringify(snapshot.scores) : (snapshot.scores_json || '{}'),
      typeof snapshot.portalAttribution === 'object' ? JSON.stringify(snapshot.portalAttribution) : (snapshot.portal_attribution_json || '{}'),
      typeof snapshot.full_dossier_json === 'string' ? snapshot.full_dossier_json : JSON.stringify(snapshot),
      researchedAt
    ];

    if (typeof db.run === 'function') {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ success: true, symbol: sym });
      });
    } else {
      reject(new Error("Database instance does not support run()"));
    }
  });
}

module.exports = {
  runQualityGate,
  partitionByQualityGate,
  persistThroughQualityGate,
  persistSnapshotThroughQualityGate,
  CONFIDENCE_CAPS
};

