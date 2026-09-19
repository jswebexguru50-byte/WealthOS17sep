import crypto from 'node:crypto';

export function calculateDependencyHash(
  dependencyGraph: unknown,
): string {
  const canonical = JSON.stringify(
    dependencyGraph,
    Object.keys(dependencyGraph as object).sort(),
  );

  return crypto
    .createHash('sha256')
    .update(canonical, 'utf8')
    .digest('hex');
}
