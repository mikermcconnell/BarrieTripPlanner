/**
 * Fetch Barrie Address Points from City of Barrie Open Data
 *
 * Downloads all address points from the City of Barrie's ArcGIS MapServer,
 * deduplicates by coordinate (collapses strata units), and outputs a compact
 * JSON file for the local geocoding service.
 *
 * Data source: https://public-barrie.opendata.arcgis.com/datasets/address-points/about
 * Service: https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/AddressVW/MapServer/0
 *
 * Output format: Array of [lat, lon, houseNumber, street, fullAddress]
 *
 * Usage: node scripts/fetchBarrieAddresses.js
 */

const fs = require('fs');
const path = require('path');

const API_URL =
  'https://gispublic.barrie.ca/arcgis/rest/services/Open_Data/AddressVW/MapServer/0/query';

const PAGE_SIZE = 1000; // This server's max is 1000 per request
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'data', 'barrie-addresses.json');

async function fetchPage(offset) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'FULLADDR,ADDRNUMBER,SSTRNAME,SSTRSUFF,SSTRDIR,Latitude,Longitude,UNITNUMBER',
    returnGeometry: 'false', // Lat/Lon are in attributes, skip geometry
    f: 'json',
    resultOffset: offset.toString(),
    resultRecordCount: PAGE_SIZE.toString(),
  });

  const url = `${API_URL}?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

function roundCoord(val) {
  // Round to 5 decimal places (~1m precision) for dedup grouping
  return Math.round(val * 100000) / 100000;
}

function buildStreetName(attrs) {
  // Combine SSTRNAME + SSTRSUFF + SSTRDIR into full street name
  // e.g., "BAYFIELD" + "ST" + "" = "BAYFIELD ST"
  // e.g., "DUNLOP" + "ST" + "E" = "DUNLOP ST E"
  const parts = [];
  if (attrs.SSTRNAME) parts.push(attrs.SSTRNAME.trim().toUpperCase());
  if (attrs.SSTRSUFF) parts.push(attrs.SSTRSUFF.trim().toUpperCase());
  if (attrs.SSTRDIR) parts.push(attrs.SSTRDIR.trim().toUpperCase());
  return parts.join(' ');
}

async function main() {
  console.log('Fetching Barrie address points...\n');

  const allRecords = [];
  let offset = 0;
  let page = 1;

  // Paginate through all records
  while (true) {
    process.stdout.write(`  Page ${page}: fetching records ${offset}-${offset + PAGE_SIZE - 1}...`);
    const data = await fetchPage(offset);
    const features = data.features || [];
    console.log(` got ${features.length} records`);

    allRecords.push(...features);

    // Check if there are more records
    if (!data.exceededTransferLimit && features.length < PAGE_SIZE) {
      break;
    }

    offset += PAGE_SIZE;
    page++;
  }

  console.log(`\nTotal raw records: ${allRecords.length}`);

  // Deduplicate by coordinate — group addresses at the same lat/lon
  // (strata units share coordinates). Keep the entry without a unit number,
  // or the first one if all have units.
  const coordMap = new Map();
  let skippedNoCoords = 0;

  for (const feature of allRecords) {
    const attrs = feature.attributes || {};

    const lat = parseFloat(attrs.Latitude);
    const lon = parseFloat(attrs.Longitude);
    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) {
      skippedNoCoords++;
      continue;
    }

    const rLat = roundCoord(lat);
    const rLon = roundCoord(lon);
    const key = `${rLat},${rLon}`;

    const street = buildStreetName(attrs);
    const fullAddress = (attrs.FULLADDR || '').trim().toUpperCase();
    const unit = (attrs.UNITNUMBER || '').trim();

    const entry = {
      lat: rLat,
      lon: rLon,
      house: (attrs.ADDRNUMBER || '').trim(),
      street,
      fullAddress,
      unit,
    };

    if (!coordMap.has(key)) {
      coordMap.set(key, entry);
    } else {
      // Prefer the entry without a unit number (it's the "building" address)
      const existing = coordMap.get(key);
      if (existing.unit && !entry.unit) {
        coordMap.set(key, entry);
      }
    }
  }

  if (skippedNoCoords > 0) {
    console.log(`Skipped ${skippedNoCoords} records with missing coordinates`);
  }
  console.log(`Unique locations after dedup: ${coordMap.size}`);

  // Convert to compact array format: [lat, lon, houseNumber, street, fullAddress]
  const output = [];
  for (const entry of coordMap.values()) {
    // Skip entries with no street or no coordinates
    if (!entry.street || !entry.lat || !entry.lon) continue;

    // Parse house number — keep as string prefix for alphanumeric (e.g., "236A")
    const houseNum = parseInt(entry.house, 10) || 0;
    output.push([entry.lat, entry.lon, houseNum, entry.street, entry.fullAddress]);
  }

  // Sort by street name then house number for consistent output
  output.sort((a, b) => {
    const streetCmp = a[3].localeCompare(b[3]);
    if (streetCmp !== 0) return streetCmp;
    return a[2] - b[2];
  });

  console.log(`Output addresses: ${output.length}`);

  // Validate a sample
  const sample = output[Math.floor(output.length / 2)];
  if (sample) {
    console.log(`\nSample entry: ${JSON.stringify(sample)}`);
    const [sLat, sLon] = sample;
    if (sLat > 44.2 && sLat < 44.6 && sLon > -79.9 && sLon < -79.5) {
      console.log('  Coordinates verified: within Barrie area');
    } else {
      console.warn('  WARNING: Sample coordinates NOT in Barrie area!');
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const stats = fs.statSync(OUTPUT_PATH);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`\nWritten to: ${OUTPUT_PATH}`);
  console.log(`File size: ${sizeMB} MB`);
  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
