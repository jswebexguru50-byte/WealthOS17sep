import { Response } from 'express';
import crypto from 'crypto';

/**
 * RFC 8594 compliant deprecation header setter
 * https://tools.ietf.org/html/rfc8594
 */
export function setSunsetHeader(res: Response, sunsetDate: string): void {
  res.set('Sunset', formatHttpDate(new Date(sunsetDate)));
}

export function setDeprecationHeader(res: Response): void {
  res.set('Deprecation', 'true');
}

export function setLinkHeader(res: Response, canonicalPath: string): void {
  res.set('Link', `<${canonicalPath}>; rel="deprecation"`);
}

export function setDeprecationInfoHeader(res: Response, canonicalPath: string, sunsetDate: string): void {
  res.set('X-Deprecation-Info', `Canonical: ${canonicalPath}, Sunset: ${sunsetDate}`);
}

export function setWealthOSLegacyPathHeader(res: Response): void {
  res.set('X-WealthOS-Legacy-Path', 'true');
}

export function formatHttpDate(date: Date): string {
  return date.toUTCString();
}

export function calculateHashDiff(obj1: any, obj2: any): string {
  const str1 = JSON.stringify(obj1);
  const str2 = JSON.stringify(obj2);
  const hash = crypto.createHash('sha256');
  hash.update(str1 + '::' + str2);
  return hash.digest('hex');
}

export function extractClientIp(req: any): string {
  const xForwardedFor = req.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const xRealIp = req.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }
  return req.ip || req.connection?.remoteAddress || '';
}

export function extractBrowserUserAgent(req: any): string {
  return req.get('user-agent') || '';
}
