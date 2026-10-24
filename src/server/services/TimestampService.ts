/**
 * src/server/services/TimestampService.ts
 * Provides current time and timestamp utilities
 */

export class TimestampService {
  private static instance: TimestampService;
  private mockTime?: Date;

  static getInstance(): TimestampService {
    if (!TimestampService.instance) {
      TimestampService.instance = new TimestampService();
    }
    return TimestampService.instance;
  }

  getCurrentTimestamp(): string {
    const now = this.mockTime || new Date();
    return now.toISOString();
  }

  getCurrentDate(): Date {
    return this.mockTime || new Date();
  }

  setMockTime(date: Date): void {
    this.mockTime = date;
  }

  clearMockTime(): void {
    this.mockTime = undefined;
  }

  isWithinDuration(timestamp: string, seconds: number): boolean {
    const parsed = new Date(timestamp);
    const now = this.getCurrentDate();
    const diff = Math.abs(now.getTime() - parsed.getTime());
    return diff < seconds * 1000;
  }

  getAgeInSeconds(timestamp: string): number {
    const parsed = new Date(timestamp);
    const now = this.getCurrentDate();
    return Math.floor((now.getTime() - parsed.getTime()) / 1000);
  }
}
