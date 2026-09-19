export class ResearchHashVerifier {
  // Validate if string is a valid SHA-256 hash (64 hex characters)
  public static isValidSha256(hash: string): boolean {
    const regex = /^[a-f0-9]{64}$/;
    return regex.test(hash);
  }

  public static assertValidSha256(hash: string, context: string): void {
    if (!this.isValidSha256(hash)) {
      throw new Error(`STOP_THE_LINE: PLACEHOLDER_HASH in ${context}. Hash must be exactly 64 lowercase hex characters. Found: ${hash}`);
    }
  }

  public static verifyHashMatch(actualHash: string, expectedHash: string, context: string): void {
    this.assertValidSha256(actualHash, `${context} actual hash`);
    this.assertValidSha256(expectedHash, `${context} expected hash`);
    
    if (actualHash !== expectedHash) {
      throw new Error(`STOP_THE_LINE: HASH_MISMATCH in ${context}. Expected ${expectedHash}, got ${actualHash}`);
    }
  }
}
