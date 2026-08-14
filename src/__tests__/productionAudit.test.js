const { evaluateAuditReport } = require('../../scripts/audit-production');

describe('production audit policy', () => {
  test('allows only dependency chains backed entirely by approved advisories', () => {
    const report = {
      vulnerabilities: {
        metro: { severity: 'high', via: ['image-size'] },
        'image-size': {
          severity: 'high',
          via: [
            { source: 1138808, severity: 'high' },
            { source: 1138809, severity: 'high' },
          ],
        },
      },
    };

    const result = evaluateAuditReport(report, new Map([[1138808, 'approved'], [1138809, 'approved']]));

    expect(result.failures).toEqual([]);
    expect(result.allowed.map(({ name }) => name).sort()).toEqual(['image-size', 'metro']);
  });

  test('fails new high-severity advisories even when another advisory is approved', () => {
    const report = {
      vulnerabilities: {
        packageA: {
          severity: 'high',
          via: [
            { source: 1138808, severity: 'high' },
            { source: 9999999, severity: 'high' },
          ],
        },
      },
    };

    const result = evaluateAuditReport(report, new Map([[1138808, 'approved']]));

    expect(result.allowed).toEqual([]);
    expect(result.failures).toEqual([
      { name: 'packageA', severity: 'high', advisoryIds: [1138808, 9999999] },
    ]);
  });

  test('does not fail moderate findings', () => {
    const report = {
      vulnerabilities: {
        packageA: { severity: 'moderate', via: [{ source: 123, severity: 'moderate' }] },
      },
    };

    expect(evaluateAuditReport(report)).toEqual({ failures: [], allowed: [] });
  });
});
