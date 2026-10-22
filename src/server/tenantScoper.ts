export interface TenantContext {
  memberId: number | 'all';
  role?: string;
  panNumber?: string;
  taxResidency?: string;
}

/**
 * Extracts and validates tenant member context from request headers or query params
 */
export function extractTenantContext(req: any): TenantContext {
  const headerVal = req.headers['x-member-id'];
  const queryVal = req.query.member_id;
  const raw = queryVal || headerVal;

  if (!raw || raw === 'all' || raw === 'consolidated') {
    return { memberId: 'all' };
  }

  const num = parseInt(raw, 10);
  if (!isNaN(num) && num > 0) {
    return { memberId: num };
  }

  return { memberId: 'all' };
}

/**
 * Appends tenant scoping to a SQL query if memberId is specific
 */
export function applyTenantScope(
  baseSql: string,
  memberId: number | 'all',
  tableAlias: string = '',
  columnName: string = 'member_id'
): { sql: string; params: any[] } {
  if (memberId === 'all') {
    return { sql: baseSql, params: [] };
  }

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const connector = baseSql.toUpperCase().includes('WHERE') ? 'AND' : 'WHERE';

  return {
    sql: `${baseSql} ${connector} ${prefix}${columnName} = ?`,
    params: [memberId]
  };
}
