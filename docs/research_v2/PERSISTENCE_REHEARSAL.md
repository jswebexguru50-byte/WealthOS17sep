# Persistence rehearsal

Run this against the canonical database before any production write:

```powershell
npx tsx scripts/research_v2/rehearse_persistence.ts "C:\path\to\portfolio.db"
```

The command copies the source to a temporary SQLite file, applies the research V2 schema,
performs a guarded write, verifies rollback, and checks that an unapproved write to the
supplied source is refused. The required result includes `sourceUnchanged: true`.
It never enables `--allow-production` and never writes the source file.
