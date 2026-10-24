import { Response } from 'express';

/**
 * Handle errors during legacy path redirect to canonical endpoint
 * Does NOT revert to deprecated implementation (prevents outdated data)
 */
export function handleCanonicalServiceError(error: any, res: Response, legacyPath: string, canonicalPath: string) {
  // Catch and error handling: log original error separately with stack trace for debugging
  try {
    console.error(`[Deprecation] Error in canonical service (called via legacy ${legacyPath}):`, error);
  } catch (logErr) {
    // Error logging should not cause additional failures
  }

  // Return 503 Service Unavailable to client (NEVER return to deprecated implementation)
  // This prevents returning stale or outdated data from the deprecated service
  try {
    res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: `The canonical endpoint ${canonicalPath} is temporarily unavailable. Please try again later.`,
      support: 'For persistent issues, contact support@wealthos.example.com',
      documentation: `See migration guide at /docs/MIGRATION_GUIDE_${extractPathName(legacyPath)}.md`
    });
  } catch (sendErr) {
    // If response is already sent, catch the error
    console.error('[Deprecation] Failed to send error response:', sendErr);
  }
}

/**
 * Detect if canonical implementation already executed
 * Prevents duplicate writes when both legacy and canonical paths are called
 */
export function checkForDuplicateWrite(requestId: string, canonicalPath: string, isDuplicate: boolean): boolean {
  if (isDuplicate) {
    console.warn(`[Deprecation] Duplicate write detected: canonical path ${canonicalPath} already executed for request ${requestId}`);
    return true;
  }
  return false;
}

/**
 * Validate request matches legacy API contract
 * Ensures backward compatibility - response shape unchanged
 */
export function validateLegacyContractCompliance(legacyPath: string, responseShape: any): boolean {
  // Check that response includes expected fields for backward compatibility
  const requiredFields: Record<string, string[]> = {
    '/api/audit': ['transactions', 'summary'],
    '/api/reconciliation-audit': ['transactions', 'summary']
  };

  const required = requiredFields[legacyPath] || [];
  return required.every(field => field in responseShape);
}

/**
 * Extract path name from /api/path format for file naming
 */
function extractPathName(path: string): string {
  return path.replace(/^\/api\//, '').replace(/\//g, '_');
}
