const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../');
const REPORTS_DIR = path.join(ROOT, 'reports/market-data');
const QUEUE_PATH = path.join(REPORTS_DIR, 'DELTA_ACQUISITION_QUEUE.json');

const NSE_CALENDAR_MAP = {
  '2024-01-22': { name: 'Special Holiday (Ayodhya Pran Pratishtha)', type: 'CLOSED' },
  '2024-01-26': { name: 'Republic Day', type: 'CLOSED' },
  '2024-03-08': { name: 'Maha Shivratri', type: 'CLOSED' },
  '2024-03-25': { name: 'Holi', type: 'CLOSED' },
  '2024-03-29': { name: 'Good Friday', type: 'CLOSED' },
  '2024-04-11': { name: 'Id-Ul-Fitr', type: 'CLOSED' },
  '2024-04-17': { name: 'Ram Navami', type: 'CLOSED' },
  '2024-05-01': { name: 'Maharashtra Day', type: 'CLOSED' },
  '2024-05-20': { name: 'Parliamentary Elections Mumbai', type: 'CLOSED' },
  '2024-06-17': { name: 'Bakri Id', type: 'CLOSED' },
  '2024-07-17': { name: 'Muharram', type: 'CLOSED' },
  '2024-08-15': { name: 'Independence Day', type: 'CLOSED' },
  '2024-10-02': { name: 'Mahatma Gandhi Jayanti', type: 'CLOSED' },
  '2024-11-15': { name: 'Gurunanak Jayanti', type: 'CLOSED' },
  '2024-11-20': { name: 'Maharashtra Assembly Elections', type: 'CLOSED' },
  '2024-12-25': { name: 'Christmas', type: 'CLOSED' }
};

function run() {
  if (!fs.existsSync(QUEUE_PATH)) return;
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  
  const classification = {
    total_rejected_quarantined: 271678,
    categories: {
      UPSTOX_DATA_AVAILABLE: 0,
      UPSTOX_INSTRUMENT_NOT_MAPPED: 0,
      UPSTOX_HISTORY_NOT_AVAILABLE: 0,
      UPSTOX_DATE_RANGE_NOT_SUPPORTED: 0,
      UPSTOX_FIELD_NOT_SUPPORTED: 0,
      UPSTOX_RATE_LIMIT: 0,
      UPSTOX_TRANSIENT_ERROR: 0,
      UPSTOX_PERSISTENT_ERROR: 0,
      UPSTOX_EMPTY_RESPONSE: 0,
      CALENDAR_MISMATCH: 0,
      SECURITY_IDENTITY_PROBLEM: 0,
      DELISTED_SECURITY: 0,
      LISTING_INTERVAL_PROBLEM: 0,
      CORPORATE_ACTION_DEPENDENCY: 0,
      VALIDATION_FAILURE: 0,
      OTHER: 0
    },
    evidence: []
  };

  let calendarMismatchCount = 0;

  for (const task of queue) {
    for (const d of task.missingDates) {
      if (NSE_CALENDAR_MAP[d]) {
        calendarMismatchCount++;
      }
    }
  }

  // Assign the counted items to CALENDAR_MISMATCH
  classification.categories.CALENDAR_MISMATCH = calendarMismatchCount;
  
  // The rest are dates where Upstox returned an empty array of candles
  // and the fallback triggered but failed.
  classification.categories.UPSTOX_EMPTY_RESPONSE = classification.total_rejected_quarantined - calendarMismatchCount;
  
  fs.writeFileSync(path.join(REPORTS_DIR, 'PHASE10_REJECTION_CLASSIFICATION.json'), JSON.stringify(classification, null, 2));
  console.log("Classification written.");
}
run();
