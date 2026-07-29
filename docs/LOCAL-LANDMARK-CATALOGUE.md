# Local Landmark Catalogue

## Purpose

BTTP keeps a local catalogue of common Barrie destinations so riders can search by official name, nickname, abbreviation, former name, or common misspelling without depending on a remote geocoder.

The catalogue is defined in [`src/config/localLandmarks.js`](../src/config/localLandmarks.js). Matching and ranking are handled by [`src/utils/localLandmarkSearch.js`](../src/utils/localLandmarkSearch.js).

## Current scope

The initial catalogue was researched and cross-checked on July 18, 2026. It contains more than 50 destinations covering:

- Barrie Transit hubs and GO stations
- hospitals and public-health destinations
- recreation and community centres
- libraries
- secondary and post-secondary schools
- malls and major shopping districts
- civic, court, cultural, and community destinations
- major waterfront destinations, beaches, and city-wide parks

It is intentionally a landmark catalogue, not a directory of every business, elementary school, or neighbourhood park. LocationIQ remains the fallback for uncatalogued places and the bundled City address data remains the source for street addresses.

## Search behaviour

Suggestions are ranked in this order:

1. exact official name or alias
2. phrase prefix
3. phrase substring
4. matching word prefixes
5. landmark priority and alphabetical order as tie-breakers

Local landmarks are returned before local street-address and LocationIQ results. A recognized landmark avoids a remote API request. Two-character searches are allowed locally so searches such as `GO` work without increasing remote geocoding traffic.

Examples:

| Search | Result |
| --- | --- |
| `RVH`, `Royal Victoria Hospital` | RVH |
| `Sadlon Centre`, `Sadland Centre`, `BMC` | Sadlon Arena |
| `downtown Barrie` | Downtown Hub |
| `PHTCC`, `Holly rec centre` | Peggy Hill Team Community Centre |
| `BNCI` | Barrie North Collegiate Institute |
| `Mady Centre` | Five Points Theatre |

## Research sources

Primary sources were preferred for names and addresses. Coordinates were taken from the existing BTTP hub configuration, the bundled City of Barrie address-point dataset, or cross-checked OpenStreetMap features.

- [City of Barrie facilities and venues](https://www.barrie.ca/community-recreation-environment/facilities-venues)
- [City of Barrie address points](https://public-barrie.opendata.arcgis.com/datasets/address-points/about)
- [Barrie Public Library branches](https://www.barrielibrary.ca/about-bpl/branches)
- [Simcoe County District School Board school search](https://www.scdsb.on.ca/school_search)
- [Simcoe Muskoka Catholic District School Board directory](https://www.smcdsb.on.ca/our_schools/school_directory)
- [Royal Victoria Regional Health Centre](https://www.rvh.on.ca/)
- [GO Transit](https://www.gotransit.com/en/find-a-station-or-stop)
- [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Individual official facility and organization pages recorded in each catalogue entry's `sourceUrl`

OpenStreetMap-derived information is available under the Open Database License. Keep the attribution above when retaining those entries.

## Maintenance rules

When adding or changing an entry:

1. Confirm the current official name and address from the organization or City website.
2. Prefer an accessible public entrance or transit boarding point over a parcel centroid.
3. Cross-check that the coordinate is within Barrie's configured bounds.
4. Add former names, abbreviations, and common rider wording as aliases.
5. Avoid a broad alias that could silently send riders to the wrong place.
6. Add or update a focused search test.
7. Run:

   ```bash
   npx jest src/__tests__/localLandmarkSearch.test.js src/__tests__/locationIQLandmarks.test.js --runInBand
   ```

Review the catalogue at least annually and whenever a major facility, school, terminal, or sponsored venue is renamed.

