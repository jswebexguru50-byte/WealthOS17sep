import crypto from 'crypto';

export class SourceRequestHasher {
    public static hashRequest(
        source: string,
        sourceInstrumentId: string,
        startDate: string,
        endDate: string,
        interval: string,
        adjustmentMode: string
    ): string {
        const canonicalRequest = JSON.stringify({
            adjustmentMode,
            endDate,
            interval,
            source,
            sourceInstrumentId,
            startDate
        });
        return crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    }
}
