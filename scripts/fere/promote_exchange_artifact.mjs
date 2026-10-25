#!/usr/bin/env node
import sqlite3 from 'sqlite3';
import { CanonicalFactIngestionService } from '../../src/server/services/CanonicalFactIngestionService.js';
const symbol = process.argv[2]?.trim().toUpperCase();
if (!symbol) throw new Error('Usage: node scripts/fere/promote_exchange_artifact.mjs SYMBOL');
const dbPath = (process.env.DATABASE_URL || 'portfolio.db').replace(/^sqlite:\/\//, '');
const db = new sqlite3.Database(dbPath);
const result = await new CanonicalFactIngestionService(db).ingestExchangeArtifactForSymbol(symbol);
db.close();
if (!result.factsInserted) process.exitCode = 2;
console.log(JSON.stringify({ symbol, ...result, status: result.factsInserted ? 'promoted' : 'not_promotable' }));
