'use strict';

// Routes each question to the right agency. Riders rarely name the agency, so
// when it's missing we infer it from the stop (via the cross-agency stop index)
// or the route, and ask only when several agencies genuinely match.

const { normalizeText } = require('./feedStore');
const { createTransitData, metersBetween, SAME_PLACE_METERS } = require('./transitData');

const CANDIDATES_PER_AGENCY = 5;
const SHARED_STOP_ARRIVAL_LIMIT = 8;

function createTransitNetwork({
  agencies,
  feedManager,
  createAgencyData = (agency) => createTransitData({ agency, getStore: () => feedManager.getStore(agency.id) }),
}) {
  const dataById = new Map();
  const dataFor = (agency) => {
    if (!dataById.has(agency.id)) dataById.set(agency.id, createAgencyData(agency));
    return dataById.get(agency.id);
  };
  const summary = (a) => ({ id: a.id, name: a.name, region: a.region });
  const coverage = () => agencies.map((a) => `${a.name} (${a.region})`).join('; ');

  function resolveAgency(text) {
    const wanted = normalizeText(text);
    if (!wanted) return null;
    const names = (a) => [a.id, a.name, ...(a.aliases || [])].map(normalizeText);
    // Whole-word containment, so "yrt viva" finds YRT but "kingston" doesn't match "king".
    const words = (s) => ` ${s} `;
    return agencies.find((a) => names(a).includes(wanted)) ||
      agencies.find((a) => names(a).some((n) => words(wanted).includes(words(n)) || words(n).includes(words(wanted)))) ||
      null;
  }

  // -> { agencies: [...] } narrowed as far as the question allows, or { unknown: text }.
  async function pickAgencies({ agency, stop, route }) {
    if (agency) {
      const found = resolveAgency(agency);
      return found ? { agencies: [found] } : { unknown: agency };
    }
    if (agencies.length === 1) return { agencies };
    let candidates = agencies;
    if (stop) {
      const ids = new Set(await feedManager.agenciesForStop(stop));
      candidates = candidates.filter((a) => ids.has(a.id));
    }
    if (route && candidates.length > 1) {
      const checks = await Promise.all(candidates.map((a) => dataFor(a).hasRoute(route)));
      candidates = candidates.filter((_, i) => checks[i]);
    }
    return { agencies: candidates };
  }

  function unknownAgencyResult(text) {
    return {
      agency: null, routes: [], stop: null, arrivals: [], vehicles: [],
      coveredAgencies: agencies.map(summary),
      notes: [`"${text}" isn't a covered transit agency. Covered: ${coverage()}.`],
    };
  }

  // A stop several agencies serve under the same name (e.g. Mississauga's City Centre terminal,
  // used by MiWay and Brampton Transit) is one place: show every agency's arrivals together.
  async function sharedStopStatus(candidates, query) {
    let parts = (await Promise.all(candidates.map((a) => dataFor(a).getStatus(query)))).filter((s) => s.stop);
    // Prefer agencies whose stop is named like the question ("Union Station" over "Unionville GO Station").
    const wanted = normalizeText(query.stop);
    const closeName = parts.filter((s) => {
      const name = normalizeText(s.stop.name);
      return name === wanted || name.startsWith(`${wanted} `) || wanted.startsWith(`${name} `);
    });
    const nearest = (a, b) => Math.min(...a.stop.locations.flatMap((x) => b.stop.locations.map((y) => metersBetween(x, y))));
    // ...but keep other agencies' stops beside them, whatever they're called
    // (Brampton's "Mississauga CC Terminal" is MiWay's City Centre Transit Terminal).
    if (closeName.length > 0) {
      parts = parts.filter((s) => closeName.includes(s) || closeName.some((c) => nearest(c, s) <= SAME_PLACE_METERS));
    }
    // If only one agency resolves the name to a single place, that's the answer.
    if (parts.length === 1) return parts[0];
    // Agencies name shared stops differently ("City Centre Transit Terminal" vs "Mississauga CC Terminal"),
    // so "same place" means within walking distance of each other.
    const [first, ...rest] = parts;
    if (parts.length < 2 || !rest.every((s) => nearest(first, s) <= SAME_PLACE_METERS)) return null;
    const withAgency = (s, item) => ({ ...item, agencyId: s.agency.id, agencyName: s.agency.name });
    return {
      agency: null,
      agencies: parts.map((s) => s.agency),
      feed: parts[0].feed,
      routes: [],
      stop: {
        ...parts[0].stop,
        stopCodes: parts.flatMap((s) => s.stop.stopCodes),
        locations: parts.flatMap((s) => s.stop.locations),
      },
      arrivals: parts.flatMap((s) => s.arrivals.map((a) => withAgency(s, a)))
        .sort((a, b) => a.arrivalEpoch - b.arrivalEpoch)
        .slice(0, SHARED_STOP_ARRIVAL_LIMIT),
      vehicles: parts.flatMap((s) => s.vehicles.map((v) => withAgency(s, v))),
      notes: [`${parts[0].stop.name} is served by ${parts.map((s) => s.agency.name).join(' and ')}; arrivals from each are shown.`,
        ...new Set(parts.flatMap((s) => s.notes))],
      map: { shapes: parts.flatMap((s) => s.map?.shapes || []) },
    };
  }

  async function getStatus({ agency, route, stop, direction } = {}) {
    const picked = await pickAgencies({ agency, stop, route });
    if (picked.unknown) return unknownAgencyResult(picked.unknown);
    if (picked.agencies.length === 1) return dataFor(picked.agencies[0]).getStatus({ route, stop, direction });

    const result = {
      agency: null, routes: [], stop: null, arrivals: [], vehicles: [], notes: [],
      coveredAgencies: agencies.map(summary),
    };
    const asked = [stop && `stop "${stop}"`, route && `route "${route}"`].filter(Boolean).join(' and ');
    if (picked.agencies.length === 0) {
      result.notes.push(`No covered agency has ${asked}. Covered: ${coverage()}. ` +
        "Check the spelling, or ask the rider which city they're in.");
      return result;
    }
    if (stop) {
      const shared = await sharedStopStatus(picked.agencies, { route, stop, direction });
      if (shared) return shared;
    }
    result.agencyCandidates = picked.agencies.map(summary);
    result.notes.push(`${asked[0].toUpperCase()}${asked.slice(1)} exists in more than one area: ` +
      `${picked.agencies.map((a) => a.name).join(', ')}. Ask the rider which city they mean, then pass agency.`);
    if (stop) {
      const lists = await Promise.all(picked.agencies.map((a) => dataFor(a)
        .findStops({ query: stop, route, limit: CANDIDATES_PER_AGENCY })
        .then((stops) => stops.map((s) => ({ ...s, agencyName: a.name })))));
      result.stopCandidates = lists.flat();
    }
    return result;
  }

  async function findStops({ agency, query, route } = {}) {
    const picked = await pickAgencies({ agency, stop: query, route });
    if (picked.unknown) return { stops: [], notes: unknownAgencyResult(picked.unknown).notes };
    const lists = await Promise.all(picked.agencies.map((a) => dataFor(a)
      .findStops({ query, route, limit: CANDIDATES_PER_AGENCY })
      .then((stops) => stops.map((s) => ({ ...s, agencyName: a.name })))));
    return { stops: lists.flat(), notes: [] };
  }

  async function listRoutes({ agency } = {}) {
    if (!agency && agencies.length > 1) {
      return {
        routes: [],
        coveredAgencies: agencies.map(summary),
        notes: [`Several agencies are covered: ${coverage()}. Pass agency to list its routes.`],
      };
    }
    const found = agency ? resolveAgency(agency) : agencies[0];
    if (!found) return { routes: [], notes: unknownAgencyResult(agency).notes };
    return { agency: summary(found), routes: await dataFor(found).listRoutes(), notes: [] };
  }

  return { agencies, resolveAgency, getStatus, findStops, listRoutes };
}

module.exports = { createTransitNetwork };
