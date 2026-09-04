const { withAndroidManifest } = require('@expo/config-plugins');

function ensureViewQuery(androidManifest, scheme) {
  const manifest = androidManifest?.manifest;
  if (!manifest) return androidManifest;

  manifest.queries = manifest.queries || [{}];
  const queries = manifest.queries[0];
  queries.intent = queries.intent || [];

  const hasCompatibleIntent = queries.intent.some((intent) => (
    intent?.action?.some((action) => action?.$?.['android:name'] === 'android.intent.action.VIEW')
    && intent?.data?.some((data) => data?.$?.['android:scheme'] === scheme)
    && !intent?.category?.some(
      (category) => category?.$?.['android:name'] === 'android.intent.category.BROWSABLE'
    )
  ));

  if (!hasCompatibleIntent) {
    queries.intent.push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      data: [{ $: { 'android:scheme': scheme } }],
    });
  }

  return androidManifest;
}

const withExternalLinkQueries = (config) => withAndroidManifest(config, (config) => {
  config.modResults = ensureViewQuery(config.modResults, 'mailto');
  return config;
});

module.exports = withExternalLinkQueries;
module.exports.ensureViewQuery = ensureViewQuery;
