# Portfolio Tracker (Portable Release)

This is the clean, modular, and optimized offline production build of the Portfolio Tracker.

## How to Run Out of the Box:

### Option 1: One-Click Startup (Recommended)
Double click `start_app.bat` in this folder.
Open your browser at: **`http://localhost:3000`**

### Option 2: Command Line (Development Mode)
```bash
npm install
npm run dev
```
Open your browser at: **`http://localhost:5173`**

### Option 3: Production Server
```bash
node dist/server.cjs
```
Open your browser at: **`http://localhost:3000`**

## Database:
- The active SQLite database is stored locally in `portfolio.db` (WAL Mode enabled with automatic WAL checkpointing).
- All your portfolios, transactions, holdings, and custom settings are included out of the box.
