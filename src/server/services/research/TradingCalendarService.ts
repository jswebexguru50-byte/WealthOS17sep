/**
 * TRADING CALENDAR SERVICE (PIT Research Engine)
 * Milestone: v6.3.0-R1
 *
 * Deterministic, standalone, in-memory trading calendar for Indian equities (NSE).
 * Supports standard sessions (09:15–15:30 IST), Muhurat sessions, market holidays,
 * and exact trading-day arithmetic (preventing date + 1 errors).
 */

export interface MarketSession {
  date: string; // YYYY-MM-DD
  isTradingDay: boolean;
  sessionType: 'REGULAR' | 'MUHURAT' | 'SPECIAL' | 'CLOSED';
  holidayName?: string;
  openTimeIST: string; // e.g. "09:15"
  closeTimeIST: string; // e.g. "15:30"
}

// NSE Official Holidays (2020 - 2026 Canonical Reference)
const NSE_CALENDAR_MAP: Record<string, { name: string; type: 'CLOSED' | 'MUHURAT' }> = {
  // 2024
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
  '2024-11-01': { name: 'Diwali Laxmi Pujan (Muhurat Trading)', type: 'MUHURAT' },
  '2024-11-15': { name: 'Gurunanak Jayanti', type: 'CLOSED' },
  '2024-11-20': { name: 'Maharashtra Assembly Elections', type: 'CLOSED' },
  '2024-12-25': { name: 'Christmas', type: 'CLOSED' },

  // 2025
  '2025-01-26': { name: 'Republic Day', type: 'CLOSED' },
  '2025-02-26': { name: 'Maha Shivratri', type: 'CLOSED' },
  '2025-03-14': { name: 'Holi', type: 'CLOSED' },
  '2025-03-31': { name: 'Id-Ul-Fitr', type: 'CLOSED' },
  '2025-04-10': { name: 'Mahavir Jayanti', type: 'CLOSED' },
  '2025-04-14': { name: 'Dr. Baba Saheb Ambedkar Jayanti', type: 'CLOSED' },
  '2025-04-18': { name: 'Good Friday', type: 'CLOSED' },
  '2025-05-01': { name: 'Maharashtra Day', type: 'CLOSED' },
  '2025-08-15': { name: 'Independence Day', type: 'CLOSED' },
  '2025-08-27': { name: 'Ganesh Chaturthi', type: 'CLOSED' },
  '2025-10-02': { name: 'Mahatma Gandhi Jayanti / Dussehra', type: 'CLOSED' },
  '2025-10-21': { name: 'Diwali Laxmi Pujan (Muhurat Trading)', type: 'MUHURAT' },
  '2025-10-22': { name: 'Diwali Balipratipada', type: 'CLOSED' },
  '2025-11-05': { name: 'Prakash Gurpurb Sri Guru Nanak Dev', type: 'CLOSED' },
  '2025-12-25': { name: 'Christmas', type: 'CLOSED' },

  // 2026
  '2026-01-26': { name: 'Republic Day', type: 'CLOSED' },
  '2026-03-03': { name: 'Holi', type: 'CLOSED' },
  '2026-03-20': { name: 'Id-Ul-Fitr', type: 'CLOSED' },
  '2026-04-03': { name: 'Good Friday', type: 'CLOSED' },
  '2026-04-14': { name: 'Dr. Ambedkar Jayanti', type: 'CLOSED' },
  '2026-05-01': { name: 'Maharashtra Day', type: 'CLOSED' },
  '2026-05-27': { name: 'Bakri Id', type: 'CLOSED' },
  '2026-06-26': { name: 'Muharram', type: 'CLOSED' },
  '2026-08-15': { name: 'Independence Day', type: 'CLOSED' },
  '2026-10-02': { name: 'Mahatma Gandhi Jayanti', type: 'CLOSED' },
  '2026-10-20': { name: 'Dussehra', type: 'CLOSED' },
  '2026-11-08': { name: 'Diwali Laxmi Pujan (Muhurat Trading)', type: 'MUHURAT' },
  '2026-11-09': { name: 'Diwali Balipratipada', type: 'CLOSED' },
  '2026-11-24': { name: 'Gurunanak Jayanti', type: 'CLOSED' },
  '2026-12-25': { name: 'Christmas', type: 'CLOSED' }
};

export class TradingCalendarService {
  private static instance: TradingCalendarService;
  private dbSessionMap = new Map<string, MarketSession>();

  public static getInstance(): TradingCalendarService {
    if (!TradingCalendarService.instance) {
      TradingCalendarService.instance = new TradingCalendarService();
    }
    return TradingCalendarService.instance;
  }

  /**
   * Load authoritative sessions directly from database or fixture
   */
  public loadFromSessions(sessions: MarketSession[]): void {
    for (const s of sessions) {
      this.dbSessionMap.set(s.date, s);
    }
  }

  /**
   * Determine whether a given YYYY-MM-DD date is an active trading session.
   */
  public isTradingDay(dateStr: string): boolean {
    const session = this.getSessionInfo(dateStr);
    return session.isTradingDay;
  }

  /**
   * Full session details for a given date.
   */
  public getSessionInfo(dateStr: string): MarketSession {
    if (this.dbSessionMap.has(dateStr)) {
      return this.dbSessionMap.get(dateStr)!;
    }

    const d = new Date(`${dateStr}T00:00:00Z`);
    const dayOfWeek = d.getUTCDay(); // 0 = Sunday, 6 = Saturday

    const holiday = NSE_CALENDAR_MAP[dateStr];

    if (holiday) {
      if (holiday.type === 'MUHURAT') {
        return {
          date: dateStr,
          isTradingDay: true,
          sessionType: 'MUHURAT',
          holidayName: holiday.name,
          openTimeIST: '18:15',
          closeTimeIST: '19:15'
        };
      }
      return {
        date: dateStr,
        isTradingDay: false,
        sessionType: 'CLOSED',
        holidayName: holiday.name,
        openTimeIST: '00:00',
        closeTimeIST: '00:00'
      };
    }

    // Standard Weekend check
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return {
        date: dateStr,
        isTradingDay: false,
        sessionType: 'CLOSED',
        holidayName: dayOfWeek === 0 ? 'Sunday' : 'Saturday',
        openTimeIST: '00:00',
        closeTimeIST: '00:00'
      };
    }

    // Regular trading day
    return {
      date: dateStr,
      isTradingDay: true,
      sessionType: 'REGULAR',
      openTimeIST: '09:15',
      closeTimeIST: '15:30'
    };
  }

  /**
   * Returns the next valid trading day strictly after dateStr.
   * NEVER uses date + 1.
   */
  public getNextTradingDay(dateStr: string): string {
    let curr = new Date(`${dateStr}T00:00:00Z`);
    while (true) {
      curr.setUTCDate(curr.getUTCDate() + 1);
      const nextStr = curr.toISOString().split('T')[0];
      if (this.isTradingDay(nextStr)) {
        return nextStr;
      }
    }
  }

  /**
   * Returns the previous valid trading day strictly before dateStr.
   */
  public getPrevTradingDay(dateStr: string): string {
    let curr = new Date(`${dateStr}T00:00:00Z`);
    while (true) {
      curr.setUTCDate(curr.getUTCDate() - 1);
      const prevStr = curr.toISOString().split('T')[0];
      if (this.isTradingDay(prevStr)) {
        return prevStr;
      }
    }
  }

  /**
   * Returns list of all active trading days in range [startDate, endDate] inclusive.
   */
  public getTradingDaysBetween(startDate: string, endDate: string): string[] {
    const res: string[] = [];
    let curr = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);

    while (curr <= end) {
      const dStr = curr.toISOString().split('T')[0];
      if (this.isTradingDay(dStr)) {
        res.push(dStr);
      }
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
    return res;
  }
}
