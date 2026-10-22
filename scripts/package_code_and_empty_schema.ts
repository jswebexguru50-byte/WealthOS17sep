/**
 * scripts/package_code_and_empty_schema.ts
 *
 * Generates an ultra-lightweight "Code + Empty Schema Blueprint" (~45k tokens)
 * Contains:
 * 1. Complete Database Schema DDL (empty tables, columns, indexes, constraints)
 * 2. Frozen Production Strategy Engine Logic (S1–S11 formulas & thresholds)
 * 3. Execution Simulator & Next-Bar-Open Execution Model
 * 4. Python DB Populator & Query Engine for AI Studio Code Execution
 *
 * Consumes < 5% of Gemini's context window, leaving 95% free for reasoning & execution!
 */

import fs from 'node:fs';
import path from 'node:path';

const WORKSPACE_ROOT = process.cwd();
const OUTPUT_FILE = path.join(WORKSPACE_ROOT, 'data', 'WealthOS_Code_And_Empty_Schema_Blueprint.xml');

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function main() {
  console.log('Generating WealthOS Code & Empty Schema Blueprint for Google AI Studio...');

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<wealthos_system_blueprint>\n';
  xml += '  <system_metadata>\n';
  xml += '    <name>WealthOS / ITAS v6.3 Blueprint (Code & Empty Schema Architecture)</name>\n';
  xml += '    <concept>Dynamic DB Population via Python Code Execution (Zero Data Token Overhead)</concept>\n';
  xml += `    <timestamp>${new Date().toISOString()}</timestamp>\n`;
  xml += '  </system_metadata>\n\n';

  // 1. Database Schema DDL
  xml += '  <!-- SECTION 1: COMPLETE DATABASE SCHEMAS (EMPTY TABLES & CONSTRAINTS) -->\n';
  const schemaPath = path.join(WORKSPACE_ROOT, 'db', 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    xml += '  <database_schema name="core_schema.sql">\n';
    xml += `<![CDATA[${fs.readFileSync(schemaPath, 'utf8')}]]>\n`;
    xml += '  </database_schema>\n\n';
  }

  const pitSchemaPath = path.join(WORKSPACE_ROOT, 'db', 'migrations', '012_phase2_pit_research_schema.sql');
  if (fs.existsSync(pitSchemaPath)) {
    xml += '  <database_schema name="012_phase2_pit_research_schema.sql">\n';
    xml += `<![CDATA[${fs.readFileSync(pitSchemaPath, 'utf8')}]]>\n`;
    xml += '  </database_schema>\n\n';
  }

  // 2. Production Strategy Logic
  xml += '  <!-- SECTION 2: PRODUCTION STRATEGY ENGINES & S1-S11 LOGIC -->\n';
  const coreEngines = [
    'PureTechnicalStrategiesEngine.ts',
    'NewTechnicalStrategiesEngine.ts',
    'SignalQualityOverlay.ts',
    'CapitalProtectionEngine.ts',
    'StrategyParameterConfig.ts'
  ];
  for (const eng of coreEngines) {
    const p = path.join(WORKSPACE_ROOT, 'src', 'server', 'services', eng);
    if (fs.existsSync(p)) {
      xml += `  <production_engine name="${eng}">\n`;
      xml += `<![CDATA[${fs.readFileSync(p, 'utf8')}]]>\n`;
      xml += '  </production_engine>\n\n';
    }
  }

  // 3. Execution Simulator & Adapters
  xml += '  <!-- SECTION 3: RESEARCH & EXECUTION SIMULATOR -->\n';
  const researchEngines = [
    'ExecutionSimulator.ts',
    'FrozenSignalAdapter.ts',
    'TradingCalendarService.ts',
    'types.ts'
  ];
  for (const re of researchEngines) {
    const p = path.join(WORKSPACE_ROOT, 'src', 'server', 'services', 'research', re);
    if (fs.existsSync(p)) {
      xml += `  <research_engine name="${re}">\n`;
      xml += `<![CDATA[${fs.readFileSync(p, 'utf8')}]]>\n`;
      xml += '  </research_engine>\n\n';
    }
  }

  // 4. In-Memory / SQLite Python Populator
  xml += '  <!-- SECTION 4: PYTHON SQLITE DB POPULATOR FOR AI STUDIO CODE EXECUTION -->\n';
  const pythonPopulator = `
"""
WealthOS In-Memory / SQLite Database Populator & Replay Driver
Run this in Google AI Studio Code Execution to initialize an authentic
in-memory or on-disk SQLite database and execute S1-S11 strategies.
"""
import sqlite3
import json
import pandas as pd
from datetime import datetime

class WealthOSDatabaseManager:
    def __init__(self, db_path=':memory:'):
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row
        self.cursor = self.conn.cursor()
        
    def init_schema(self, ddl_statements):
        for stmt in ddl_statements.split(';'):
            if stmt.strip():
                self.cursor.execute(stmt)
        self.conn.commit()

    def query(self, sql, params=()):
        self.cursor.execute(sql, params)
        return [dict(r) for r in self.cursor.fetchall()]

    def insert_bars(self, bars):
        self.cursor.executemany("""
            INSERT OR REPLACE INTO DailyOHLCV (symbol, date, open, high, low, close, volume, turnover, delivery_percentage)
            VALUES (:symbol, :date, :open, :high, :low, :close, :volume, :turnover, :delivery_percentage)
        """, bars)
        self.conn.commit()
`;
  xml += '  <python_driver name="wealthos_db_populator.py">\n';
  xml += `<![CDATA[${pythonPopulator.trim()}]]>\n`;
  xml += '  </python_driver>\n\n';

  xml += '</wealthos_system_blueprint>\n';

  fs.writeFileSync(OUTPUT_FILE, xml, 'utf8');
  console.log(`✓ Generated Blueprint: ${OUTPUT_FILE}`);
  console.log(`✓ Total File Size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1)} KB (~${Math.round(fs.statSync(OUTPUT_FILE).size / 3.7).toLocaleString()} tokens)`);
}

main();
