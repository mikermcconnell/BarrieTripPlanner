const { ensureViewQuery } = require('../../plugins/withExternalLinkQueries');

describe('external link Android queries plugin', () => {
  test('adds a mailto VIEW query once', () => {
    const manifest = { manifest: {} };

    ensureViewQuery(manifest, 'mailto');
    ensureViewQuery(manifest, 'mailto');

    expect(manifest.manifest.queries[0].intent).toHaveLength(1);
    expect(manifest.manifest.queries[0].intent[0]).toEqual(expect.objectContaining({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': 'mailto' } }],
    }));
    expect(manifest.manifest.queries[0].intent[0].category).toBeUndefined();
  });

  test('preserves existing queries', () => {
    const httpsIntent = {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': 'https' } }],
    };
    const manifest = { manifest: { queries: [{ intent: [httpsIntent] }] } };

    ensureViewQuery(manifest, 'mailto');

    expect(manifest.manifest.queries[0].intent).toHaveLength(2);
    expect(manifest.manifest.queries[0].intent[0]).toBe(httpsIntent);
  });

  test('adds a compatible query without altering an over-restrictive existing query', () => {
    const mailIntent = {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'mailto' } }],
    };
    const manifest = { manifest: { queries: [{ intent: [mailIntent] }] } };

    ensureViewQuery(manifest, 'mailto');

    expect(manifest.manifest.queries[0].intent).toHaveLength(2);
    expect(manifest.manifest.queries[0].intent[0]).toBe(mailIntent);
    expect(manifest.manifest.queries[0].intent[1].category).toBeUndefined();
  });
});
