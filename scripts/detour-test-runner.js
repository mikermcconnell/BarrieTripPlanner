#!/usr/bin/env node

/*
 * Development-only helper for BTTP simulated detour validation.
 *
 * It publishes only dev simulation records and clears only simulated records.
 * Do not use this as a production operations tool.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { haversineDistance } = require('../api-proxy/geometry');

const REGULAR_PRESETS = [
  {
    preset: 'dunlop-ferndale-anne',
    routes: ['2A', '2B'],
    closure: 'Dunlop Street West between Ferndale Drive and Anne Street',
    bypass: 'Ferndale Drive / Tiffin Street / Anne Street',
  },
  {
    preset: 'wellington-owen-grove',
    routes: ['7A', '7B'],
    closure: 'Grove Street East between Bayfield Street and Owen Street',
    bypass: 'Bayfield Street / Wellington Street East / Owen Street / Grove Street East',
  },
  {
    preset: 'yonge-bigbay-little',
    routes: ['8A'],
    closure: 'Yonge Street between Little Avenue and Big Bay Point Road',
    bypass: 'Little Avenue / Huronia Road / Big Bay Point Road',
  },
  {
    preset: 'farmers-market',
    routes: ['11'],
    closure: 'Mulcaster Street between Collier Street and Worsley Street',
    bypass: 'Owen Street / McDonald Street / Mulcaster Street',
  },
  {
    preset: 'saunders-welham',
    routes: ['12A', '12B'],
    closure: 'Saunders Road and Welham Road area',
    bypass: 'Welham Road / Mapleview Drive East / Bayview Drive',
  },
];

const EDGE_FIXTURES = [
  {
    id: 'closed-overlap-hidden',
    routeId: '8A',
    title: 'Edge: closed-route overlap hidden',
    description: 'Likely path is intentionally suppressed because it overlaps the closed Yonge Street segment.',
    suppressedReason: 'road-match-closed-overlap',
    riderVisible: true,
    riderVisibilityReason: 'path-suppressed-for-edge-test',
    entryPoint: { latitude: 44.36632, longitude: -79.66255 },
    exitPoint: { latitude: 44.35652, longitude: -79.64698 },
    skippedSegmentPolyline: [
      { latitude: 44.36632, longitude: -79.66255 },
      { latitude: 44.36248, longitude: -79.65774 },
      { latitude: 44.35951, longitude: -79.65348 },
      { latitude: 44.35652, longitude: -79.64698 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.36632, longitude: -79.66255 },
      { latitude: 44.36248, longitude: -79.65774 },
      { latitude: 44.35951, longitude: -79.65348 },
      { latitude: 44.35652, longitude: -79.64698 },
    ],
  },
  {
    id: 'tiny-span-long-path-hidden',
    routeId: '2A',
    title: 'Edge: tiny span long path hidden',
    description: 'Likely path is intentionally suppressed because a tiny closed span produced an unrealistic long path.',
    suppressedReason: 'tiny-span-long-path',
    riderVisible: true,
    riderVisibilityReason: 'path-suppressed-for-edge-test',
    entryPoint: { latitude: 44.37657, longitude: -79.71875 },
    exitPoint: { latitude: 44.37672, longitude: -79.71839 },
    skippedSegmentPolyline: [
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.37672, longitude: -79.71839 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.37657, longitude: -79.71875 },
      { latitude: 44.36922, longitude: -79.71495 },
      { latitude: 44.37307, longitude: -79.69797 },
      { latitude: 44.38237, longitude: -79.70522 },
      { latitude: 44.37672, longitude: -79.71839 },
    ],
  },
  {
    id: 'many-affected-stops-visible',
    routeId: '12B',
    title: 'Edge: many affected stops remain readable',
    description: 'Stress test with many affected and skipped stops so banner, card, and details layout stay readable.',
    riderVisible: true,
    riderVisibilityReason: 'many-stops-layout-edge-test',
    canShowDetourPath: true,
    roadMatchConfidence: 'high',
    roadMatchSource: 'edge-fixture-many-stops',
    detourPathLabel: 'Many affected stops edge test',
    likelyDetourRoadNames: ['Hooper Road'],
    affectedStopIds: ['s2', 's485', 's49', 's121', 's122', 's123', 's124', 's125', 's126', 's127', 's128', 's129'],
    affectedStopCodes: ['2', '485', '49', '121', '122', '123', '124', '125', '126', '127', '128', '129'],
    skippedStopIds: ['s2', 's485', 's49', 's121', 's122', 's123', 's124', 's125'],
    skippedStopCodes: ['2', '485', '49', '121', '122', '123', '124', '125'],
    affectedStops: [
      { id: 's2', code: '2', name: 'Stop #2 - Long affected stop name for layout testing', latitude: 44.33325, longitude: -79.67405 },
      { id: 's485', code: '485', name: 'Stop #485 - Hooper Road temporary service area', latitude: 44.33371, longitude: -79.67411 },
      { id: 's49', code: '49', name: 'Stop #49 - Saunders Road near Welham Road', latitude: 44.33408, longitude: -79.6742 },
      { id: 's121', code: '121', name: 'Stop #121 - Mapleview detour test stop', latitude: 44.33478, longitude: -79.67438 },
      { id: 's122', code: '122', name: 'Stop #122 - Bayview connector test stop', latitude: 44.33505, longitude: -79.67438 },
      { id: 's123', code: '123', name: 'Stop #123 - Hooper Road northbound test stop', latitude: 44.33551, longitude: -79.67401 },
      { id: 's124', code: '124', name: 'Stop #124 - Detour notice wrapping test stop', latitude: 44.33569, longitude: -79.67347 },
      { id: 's125', code: '125', name: 'Stop #125 - Long stop label should not clip', latitude: 44.33586, longitude: -79.67274 },
      { id: 's126', code: '126', name: 'Stop #126 - Details list overflow test', latitude: 44.33613, longitude: -79.67159 },
      { id: 's127', code: '127', name: 'Stop #127 - Temporary boarding nearby', latitude: 44.33639, longitude: -79.67049 },
      { id: 's128', code: '128', name: 'Stop #128 - Extra affected stop chip', latitude: 44.33654, longitude: -79.66986 },
      { id: 's129', code: '129', name: 'Stop #129 - Final affected stop entry', latitude: 44.33659, longitude: -79.66956 },
    ],
    skippedStops: [
      { id: 's2', code: '2', name: 'Stop #2 - Long affected stop name for layout testing', latitude: 44.33325, longitude: -79.67405 },
      { id: 's485', code: '485', name: 'Stop #485 - Hooper Road temporary service area', latitude: 44.33371, longitude: -79.67411 },
      { id: 's49', code: '49', name: 'Stop #49 - Saunders Road near Welham Road', latitude: 44.33408, longitude: -79.6742 },
      { id: 's121', code: '121', name: 'Stop #121 - Mapleview detour test stop', latitude: 44.33478, longitude: -79.67438 },
      { id: 's122', code: '122', name: 'Stop #122 - Bayview connector test stop', latitude: 44.33505, longitude: -79.67438 },
      { id: 's123', code: '123', name: 'Stop #123 - Hooper Road northbound test stop', latitude: 44.33551, longitude: -79.67401 },
      { id: 's124', code: '124', name: 'Stop #124 - Detour notice wrapping test stop', latitude: 44.33569, longitude: -79.67347 },
      { id: 's125', code: '125', name: 'Stop #125 - Long stop label should not clip', latitude: 44.33586, longitude: -79.67274 },
    ],
    entryPoint: { latitude: 44.33325, longitude: -79.67405555555555 },
    exitPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    skippedSegmentPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
    likelyDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
  },  {
    id: 'long-label-text-visible',
    routeId: '12B',
    title: 'Edge: very long detour label and location text should wrap cleanly without clipping',
    description: 'Very long rider-facing test detour label for Hooper Road, Saunders Road, Welham Road, Mapleview Drive East, temporary stop changes, and extended service-impact text.',
    riderVisible: true,
    riderVisibilityReason: 'long-label-layout-edge-test',
    canShowDetourPath: true,
    roadMatchConfidence: 'high',
    roadMatchSource: 'edge-fixture-long-label',
    detourPathLabel: 'Route 12B long label stress test — Hooper Road / Saunders Road / Welham Road / Mapleview Drive East detour path',
    likelyDetourRoadNames: ['Hooper Road', 'Saunders Road', 'Welham Road', 'Mapleview Drive East'],
    entryPoint: { latitude: 44.33325, longitude: -79.67405555555555 },
    exitPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    skippedSegmentPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
    likelyDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
  },  {
    id: 'osrm-failed-unsafe-inferred-hidden',
    routeId: '12B',
    title: 'Edge: OSRM failed and unsafe inferred path hidden',
    description: 'OSRM failed and the inferred fallback overlaps the closed segment, so the likely path is suppressed.',
    suppressedReason: 'osrm-failed-unsafe-inferred-overlap',
    riderVisible: true,
    riderVisibilityReason: 'path-suppressed-for-edge-test',
    entryPoint: { latitude: 44.33325, longitude: -79.67405555555555 },
    exitPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    skippedSegmentPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
  },  {
    id: 'osrm-failed-inferred-visible',
    routeId: '12B',
    title: 'Edge: OSRM failed but inferred path visible',
    description: 'OSRM is treated as failed, but the trusted inferred Hooper Road path is still safe to render.',
    riderVisible: true,
    riderVisibilityReason: 'trusted-inferred-path-after-osrm-failure',
    canShowDetourPath: true,
    roadMatchConfidence: 'medium',
    roadMatchSource: 'osrm-failed-trusted-inferred-edge-fixture',
    detourPathLabel: 'Trusted inferred path after OSRM failure',
    likelyDetourRoadNames: ['Hooper Road'],
    entryPoint: { latitude: 44.33325, longitude: -79.67405555555555 },
    exitPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    skippedSegmentPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
    likelyDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
  },  {
    id: 'circuitous-osrm-route-hidden',
    routeId: '8A',
    title: 'Edge: circuitous OSRM route hidden',
    description: 'Likely path is intentionally suppressed because OSRM produced an overly circuitous route for a short downtown closure.',
    suppressedReason: 'circuitous-osrm-route',
    riderVisible: true,
    riderVisibilityReason: 'path-suppressed-for-edge-test',
    entryPoint: { latitude: 44.387994310143405, longitude: -79.69046590890242 },
    exitPoint: { latitude: 44.38902439743899, longitude: -79.69142296830226 },
    skippedSegmentPolyline: [
      { latitude: 44.387994310143405, longitude: -79.69046590890242 },
      { latitude: 44.388429, longitude: -79.69088 },
      { latitude: 44.38902439743899, longitude: -79.69142296830226 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.387994310143405, longitude: -79.69046590890242 },
      { latitude: 44.386841, longitude: -79.691031 },
      { latitude: 44.38938, longitude: -79.691867 },
      { latitude: 44.38902439743899, longitude: -79.69142296830226 },
    ],
  },  {
    id: 'same-stop-out-and-back-hidden',
    routeId: '11',
    title: 'Edge: same-stop out-and-back hidden',
    description: 'Whole event is intentionally rider-hidden because entry and exit are effectively the same area.',
    suppressedReason: 'same-stop-out-and-back',
    riderVisible: false,
    riderVisibilityReason: 'suppressed-invalid-geometry',
    entryPoint: { latitude: 44.39043, longitude: -79.69007 },
    exitPoint: { latitude: 44.39047, longitude: -79.68999 },
    skippedSegmentPolyline: [
      { latitude: 44.39043, longitude: -79.69007 },
      { latitude: 44.39047, longitude: -79.68999 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.39043, longitude: -79.69007 },
      { latitude: 44.39262, longitude: -79.68792 },
      { latitude: 44.39047, longitude: -79.68999 },
    ],
  },
  {
    id: 'clear-pending-visible-valid-path',
    routeId: '12B',
    title: 'Edge: clear-pending valid detour remains visible',
    description: 'Event is stale/clear-pending with no current detour vehicle, but remains rider-visible because valid geometry is still active.',
    riderVisible: true,
    riderVisibilityReason: 'gps-clear-required',
    state: 'clear-pending',
    staleForReview: true,
    currentVehicleCount: 0,
    canShowDetourPath: true,
    roadMatchConfidence: 'high',
    roadMatchSource: 'edge-fixture-valid-clear-pending',
    detourPathLabel: 'Clear-pending Hooper Road edge test',
    likelyDetourRoadNames: ['Hooper Road'],
    entryPoint: { latitude: 44.33325, longitude: -79.67405555555555 },
    exitPoint: { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    skippedSegmentPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.3329970653987, longitude: -79.6738000844693 },
      { latitude: 44.3335580946778, longitude: -79.671411407984 },
      { latitude: 44.3341021179439, longitude: -79.6689847028184 },
      { latitude: 44.3342517234574, longitude: -79.6687018645081 },
      { latitude: 44.3344319295919, longitude: -79.6686353143175 },
      { latitude: 44.3362645605257, longitude: -79.6690892816893 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
    likelyDetourPolyline: [
      { latitude: 44.333258, longitude: -79.673995 },
      { latitude: 44.33371, longitude: -79.67411 },
      { latitude: 44.334087, longitude: -79.674205 },
      { latitude: 44.334279, longitude: -79.674254 },
      { latitude: 44.334333, longitude: -79.674268 },
      { latitude: 44.334783, longitude: -79.674383 },
      { latitude: 44.334988, longitude: -79.674388 },
      { latitude: 44.335053, longitude: -79.674389 },
      { latitude: 44.335278, longitude: -79.674266 },
      { latitude: 44.335389, longitude: -79.674167 },
      { latitude: 44.335517, longitude: -79.674015 },
      { latitude: 44.335618, longitude: -79.673761 },
      { latitude: 44.335648, longitude: -79.673686 },
      { latitude: 44.335697, longitude: -79.673475 },
      { latitude: 44.335763, longitude: -79.673196 },
      { latitude: 44.335867, longitude: -79.672749 },
      { latitude: 44.335871, longitude: -79.672732 },
      { latitude: 44.336136, longitude: -79.671596 },
      { latitude: 44.336394, longitude: -79.670493 },
      { latitude: 44.33654, longitude: -79.669865 },
      { latitude: 44.336598, longitude: -79.669562 },
    ],
    inferredDetourPolyline: [
      { latitude: 44.33325, longitude: -79.67405555555555 },
      { latitude: 44.333717346191406, longitude: -79.67405700683594 },
      { latitude: 44.33415985107422, longitude: -79.6742172241211 },
      { latitude: 44.33498764038086, longitude: -79.67436218261719 },
      { latitude: 44.33560562133789, longitude: -79.67375183105469 },
      { latitude: 44.33570098876953, longitude: -79.67347717285156 },
      { latitude: 44.33586502075195, longitude: -79.6727294921875 },
      { latitude: 44.33607864379883, longitude: -79.67156982421875 },
      { latitude: 44.33634567260742, longitude: -79.67047119140625 },
      { latitude: 44.33658333333333, longitude: -79.66955555555555 },
    ],
  },
];

const ALL_SIMULATION_COLLECTIONS = ['activeDetourEventsV2', 'activeDetours'];
const OBSERVED_HANDOFF_STITCH_THRESHOLD_METERS = 45;
const OBSERVED_HANDOFF_MAX_STITCH_METERS = 350;
const OBSERVED_HANDOFF_MAX_CIRCUITY_RATIO = 2.5;

const OBSERVED_REPLAY_CASES = [
  {
    id: 'route-12b-hooper-jun3',
    collection: 'activeDetoursV2',
    docId: '12B',
    routeIds: ['12B'],
    title: 'Observed replay — Route 12B — Hooper Road',
    description: 'Observed detector replay from June 3, 2026. Review the Hooper Road bypass, closed segment, and stop impacts.',
    calibrationFocus: 'Good baseline for a normal, rider-visible observed detour with skipped and likely path geometry.',
    sharedDetourEventId: 'observed:hooper-road-jun3',
    sharedRouteIds: ['12A', '12B'],
  },
  {
    id: 'route-12a-hooper-jun4',
    collection: 'detourHistoryV2',
    docId: '1780586988921-12A-DETOUR_DETECTED-roaezu',
    routeIds: ['12A'],
    title: 'Observed replay — Route 12A — Hooper Road',
    description: 'Observed detector replay from June 4, 2026. Review the 12A side of the Hooper Road detour and grouping with 12B.',
    calibrationFocus: 'Checks paired-route grouping and whether 12A/12B paths look like the same physical event without blindly mirroring.',
    sharedDetourEventId: 'observed:hooper-road-jun3',
    sharedRouteIds: ['12A', '12B'],
  },
  {
    id: 'route-8a-downtown-jun4',
    collection: 'detourHistoryV2',
    docId: '1780586988921-8A-DETOUR_DETECTED-3posch',
    routeIds: ['8A'],
    title: 'Observed replay — Route 8A — Downtown',
    description: 'Observed detector replay from June 4, 2026 using the Mary/Dunlop/Maple/Simcoe downtown path.',
    calibrationFocus: 'Checks downtown path rendering, short skipped segment handling, route masking, and label placement.',
    refreshRoadSnap: true,
  },
  {
    id: 'route-10-mulcaster-simcoe-jun3',
    collection: 'detourHistoryV2',
    docId: '1780493941487-10-DETOUR_CLEARED-5888kh',
    routeIds: ['10'],
    title: 'Observed replay — Route 10 — Mulcaster/Simcoe',
    description: 'Observed detector replay from June 3, 2026 for the downtown Mulcaster/Simcoe-style loop detour.',
    calibrationFocus: 'Checks loop-route masking, long likely path quality, duplicate line suppression, and downtown event labeling.',
    sharedDetourEventId: 'observed:downtown-mulcaster-simcoe-jun3',
    sharedRouteIds: ['10', '11', '100', '101'],
  },
  {
    id: 'route-11-mulcaster-simcoe-jun3',
    collection: 'detourHistoryV2',
    docId: '1780493075594-11-DETOUR_CLEARED-lophi5',
    routeIds: ['11'],
    title: 'Observed replay — Route 11 — Mulcaster/Simcoe',
    description: 'Observed detector replay from June 3, 2026 for the downtown Mulcaster/Simcoe shared detour.',
    calibrationFocus: 'Checks multi-route downtown grouping and whether Route 11 keeps clean route-specific geometry.',
    refreshRoadSnap: true,
    sharedDetourEventId: 'observed:downtown-mulcaster-simcoe-jun3',
    sharedRouteIds: ['10', '11', '100', '101'],
  },
  {
    id: 'route-100-mulcaster-simcoe-jun3',
    collection: 'detourHistoryV2',
    docId: '1780493075594-100-DETOUR_CLEARED-353c33',
    routeIds: ['100'],
    title: 'Observed replay — Route 100 — Mulcaster/Simcoe',
    description: 'Observed detector replay from June 3, 2026 for the downtown Mulcaster/Simcoe shared detour.',
    calibrationFocus: 'Checks multi-route downtown grouping and loop-route geometry for Route 100.',
    refreshRoadSnap: true,
    sharedDetourEventId: 'observed:downtown-mulcaster-simcoe-jun3',
    sharedRouteIds: ['10', '11', '100', '101'],
  },
  {
    id: 'route-101-mulcaster-simcoe-jun3',
    collection: 'detourHistoryV2',
    docId: '1780492801890-101-DETOUR_CLEARED-fsu8ec',
    routeIds: ['101'],
    title: 'Observed replay — Route 101 — Mulcaster/Simcoe',
    description: 'Observed detector replay from June 3, 2026 for the downtown Mulcaster/Simcoe shared detour.',
    calibrationFocus: 'Checks multi-route downtown grouping and whether Route 101 avoids old out-and-back path artifacts.',
    refreshRoadSnap: true,
    sharedDetourEventId: 'observed:downtown-mulcaster-simcoe-jun3',
    sharedRouteIds: ['10', '11', '100', '101'],
  },
];

function parseArgs(argv) {
  const args = [];
  const options = {};

  for (const item of argv) {
    if (!item.startsWith('--')) {
      args.push(item);
      continue;
    }

    const [rawKey, ...rawValueParts] = item.slice(2).split('=');
    const key = rawKey.trim();
    const value = rawValueParts.length > 0 ? rawValueParts.join('=').trim() : true;
    options[key] = value;
  }

  return { args, options };
}

function printHelp() {
  console.log(`BTTP Detour Test Runner

Usage:
  node scripts/detour-test-runner.js list
  node scripts/detour-test-runner.js edge-list
  node scripts/detour-test-runner.js observed-list
  node scripts/detour-test-runner.js publish <preset> [--duration=30] [--road-match]
  node scripts/detour-test-runner.js publish-edge <fixture> [--duration=30]
  node scripts/detour-test-runner.js publish-observed <case|all> [--duration=30]
  node scripts/detour-test-runner.js verify
  node scripts/detour-test-runner.js clear [all|routeId|preset|edgeFixture|observedCase]

Defaults for mutating commands:
  NODE_ENV=development
  DETOUR_SIMULATION_ENABLED=true
  DETOUR_DETECTOR_VERSION=v2

Use --credentials=PATH if GOOGLE_APPLICATION_CREDENTIALS is not already set.`);
}

function printRegularPresets() {
  console.log('Regular detour presets:');
  REGULAR_PRESETS.forEach((preset) => {
    console.log(`- ${preset.preset}`);
    console.log(`  routes: ${preset.routes.join(', ')}`);
    console.log(`  closure: ${preset.closure}`);
    console.log(`  bypass: ${preset.bypass}`);
  });
}

function printEdgeFixtures() {
  console.log('Edge fixtures:');
  EDGE_FIXTURES.forEach((fixture) => {
    console.log(`- ${fixture.id}`);
    console.log(`  route: ${fixture.routeId}`);
    console.log(`  expected: ${getEdgeExpectedText(fixture)}`);
    console.log(`  reason: ${fixture.suppressedReason || fixture.riderVisibilityReason || 'valid edge geometry'}`);
  });
}

function getEdgeExpectedText(fixture) {
  if (fixture.riderVisible === false) return 'hidden event';
  if (fixture.canShowDetourPath === true) return 'visible event with renderable likely path';
  return 'visible event with likely path suppressed';
}

function printObservedReplayCases() {
  console.log('Observed replay cases:');
  OBSERVED_REPLAY_CASES.forEach((observedCase) => {
    console.log(`- ${observedCase.id}`);
    console.log(`  source: ${observedCase.collection}/${observedCase.docId}`);
    console.log(`  routes: ${observedCase.routeIds.join(', ')}`);
    console.log(`  focus: ${observedCase.calibrationFocus}`);
  });
}

function configureEnvironment(options = {}) {
  if (options.credentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = String(options.credentials);
  }

  const defaultCredentialPath = path.join(os.homedir(), 'Documents', 'secrets', 'bttp-firebase-admin.json');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(defaultCredentialPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultCredentialPath;
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  process.env.DETOUR_SIMULATION_ENABLED = process.env.DETOUR_SIMULATION_ENABLED || 'true';
  process.env.DETOUR_DETECTOR_VERSION = process.env.DETOUR_DETECTOR_VERSION || 'v2';

  if (options['road-match']) {
    process.env.DETOUR_ROAD_MATCHING_ENABLED = 'true';
    process.env.DETOUR_ROAD_MATCHING_BASE_URL = String(
      options['road-match-url'] || process.env.DETOUR_ROAD_MATCHING_BASE_URL || 'https://router.project-osrm.org'
    );
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run detour test mutations with NODE_ENV=production.');
  }
}

function getRegularPreset(name) {
  const normalized = String(name || '').trim().toLowerCase();
  return REGULAR_PRESETS.find((preset) => preset.preset === normalized);
}

function getEdgeFixture(id) {
  const normalized = String(id || '').trim().toLowerCase();
  return EDGE_FIXTURES.find((fixture) => fixture.id === normalized);
}

function getObservedReplayCase(id) {
  const normalized = String(id || '').trim().toLowerCase();
  return OBSERVED_REPLAY_CASES.find((observedCase) => observedCase.id === normalized);
}

function getDurationMinutes(options = {}) {
  const parsed = Number(options.duration || options.durationMinutes || 30);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

function getStorageConfig() {
  const { buildDetourStorageConfig } = require('../api-proxy/detour/storageConfig');
  return buildDetourStorageConfig(process.env);
}

function getFirestore() {
  const { getDb } = require('../api-proxy/firebaseAdmin');
  const db = getDb();
  if (!db) {
    throw new Error('Firebase Admin is not configured. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.');
  }
  return db;
}

function getSimulationOps() {
  const { createDetourSimulationOps } = require('../api-proxy/services/detourSimulation');
  return createDetourSimulationOps({ env: process.env });
}

function routeIdsForTarget(target) {
  if (!target || target === 'all') return null;

  const preset = getRegularPreset(target);
  if (preset) return preset.routes;

  const edgeFixture = getEdgeFixture(target);
  if (edgeFixture) return [edgeFixture.routeId];

  const observedCase = getObservedReplayCase(target);
  if (observedCase) return observedCase.routeIds;

  return [String(target).trim()];
}

function getEdgeDocId(fixture, storageConfig) {
  return storageConfig.detourVersion === 'v2'
    ? `simulated:edge:${fixture.id}`
    : `edge:${fixture.id}`;
}

function getRouteSimulationDocIds(routeId) {
  return new Set([String(routeId), `simulated:${routeId}`]);
}

function pruneUndefined(value) {
  if (Array.isArray(value)) return value.map(pruneUndefined);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, pruneUndefined(entryValue)])
  );
}

function asDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function asIsoDate(value) {
  const date = asDate(value);
  return date ? date.toISOString() : null;
}

function getPath(value) {
  return Array.isArray(value) ? value : [];
}

function isCoordinate(point) {
  return (
    Number.isFinite(Number(point?.latitude)) &&
    Number.isFinite(Number(point?.longitude))
  );
}

function normalizeCoordinate(point) {
  return isCoordinate(point)
    ? { latitude: Number(point.latitude), longitude: Number(point.longitude) }
    : null;
}

function normalizePolyline(polyline) {
  return Array.isArray(polyline)
    ? polyline.map(normalizeCoordinate).filter(Boolean)
    : [];
}

function distanceMeters(a, b) {
  if (!isCoordinate(a) || !isCoordinate(b)) return Infinity;
  return haversineDistance(Number(a.latitude), Number(a.longitude), Number(b.latitude), Number(b.longitude));
}

function dedupeConsecutivePoints(points) {
  return normalizePolyline(points).reduce((deduped, point) => {
    const previous = deduped[deduped.length - 1];
    if (
      previous &&
      Math.abs(previous.latitude - point.latitude) < 0.000001 &&
      Math.abs(previous.longitude - point.longitude) < 0.000001
    ) {
      return deduped;
    }
    deduped.push(point);
    return deduped;
  }, []);
}

function getPathLengthMeters(points) {
  const pathPoints = normalizePolyline(points);
  if (pathPoints.length < 2) return 0;

  return pathPoints.slice(1).reduce((sum, point, index) => (
    sum + distanceMeters(pathPoints[index], point)
  ), 0);
}

function getRoundedCoordinateKey(point) {
  const coordinate = normalizeCoordinate(point);
  return coordinate ? `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}` : '';
}

function eraseRepeatedPathLoops(points) {
  const output = [];
  const indexByKey = new Map();

  for (const point of normalizePolyline(points)) {
    const key = getRoundedCoordinateKey(point);
    if (!key) continue;

    if (indexByKey.has(key)) {
      const keepIndex = indexByKey.get(key);
      for (let index = output.length - 1; index > keepIndex; index -= 1) {
        indexByKey.delete(getRoundedCoordinateKey(output[index]));
      }
      output.length = keepIndex + 1;
      output[keepIndex] = point;
      continue;
    }

    indexByKey.set(key, output.length);
    output.push(point);
  }

  return output;
}

function getFirstSegment(data) {
  return Array.isArray(data?.segments) ? data.segments[0] : null;
}

function hasUsableDetourGeometry(data) {
  const segment = getFirstSegment(data);
  const skippedPoints = getPath(data?.skippedSegmentPolyline).length || getPath(segment?.skippedSegmentPolyline).length;
  const likelyPoints = getPath(data?.likelyDetourPolyline).length || getPath(segment?.likelyDetourPolyline).length;
  const inferredPoints = getPath(data?.inferredDetourPolyline).length || getPath(segment?.inferredDetourPolyline).length;
  return skippedPoints >= 2 && (likelyPoints >= 2 || inferredPoints >= 2);
}

function getRoadMatchingBaseUrl() {
  return String(
    process.env.DETOUR_ROAD_MATCHING_BASE_URL ||
    process.env.OSRM_BASE_URL ||
    'https://router.project-osrm.org'
  ).replace(/\/+$/, '');
}

async function fetchOsrmRouteThrough(points) {
  const waypoints = normalizePolyline(points);
  if (waypoints.length < 2 || typeof fetch !== 'function') return null;

  const url =
    `${getRoadMatchingBaseUrl()}/route/v1/driving/` +
    waypoints.map((point) => `${Number(point.longitude)},${Number(point.latitude)}`).join(';') +
    '?overview=full&geometries=geojson&steps=false';

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const body = await response.json();
    const coordinates = body?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

    return coordinates
      .map(([longitude, latitude]) => normalizeCoordinate({ latitude, longitude }))
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function fetchOsrmRoute(from, to) {
  return fetchOsrmRouteThrough([from, to]);
}

function samplePathForRouteSnap(path, maxPoints = 4) {
  const points = normalizePolyline(path);
  if (points.length <= maxPoints) return points;

  return Array.from({ length: maxPoints }, (_, index) => {
    const ratio = maxPoints === 1 ? 0 : index / (maxPoints - 1);
    return points[Math.round((points.length - 1) * ratio)];
  });
}

async function refreshObservedLikelyPathWithOsrm(path, entryPoint, exitPoint, observedCase) {
  const basePath = normalizePolyline(path);
  const entry = normalizeCoordinate(entryPoint);
  const exit = normalizeCoordinate(exitPoint);
  if (!observedCase.refreshRoadSnap || basePath.length < 2 || !entry || !exit) {
    return {
      path: basePath,
      refreshed: false,
      method: null,
    };
  }

  const routeWaypoints = samplePathForRouteSnap([entry, ...basePath, exit], 4);
  const osrmRoute = await fetchOsrmRouteThrough(routeWaypoints);
  if (!osrmRoute || osrmRoute.length < 2) {
    return {
      path: basePath,
      refreshed: false,
      method: 'osrm-route-refresh-failed',
    };
  }

  return {
    path: eraseRepeatedPathLoops(osrmRoute),
    refreshed: true,
    method: 'osrm-route-refresh',
  };
}

async function buildObservedHandoffConnector(from, to, label) {
  const gapMeters = distanceMeters(from, to);
  if (!Number.isFinite(gapMeters) || gapMeters <= OBSERVED_HANDOFF_STITCH_THRESHOLD_METERS) {
    return { connector: [], gapMeters, method: 'none' };
  }

  if (gapMeters > OBSERVED_HANDOFF_MAX_STITCH_METERS) {
    return { connector: [], gapMeters, method: 'too-far' };
  }

  const osrmRoute = await fetchOsrmRoute(from, to);
  if (osrmRoute?.length >= 2) {
    const routeMeters = getPathLengthMeters(osrmRoute);
    if (
      routeMeters > OBSERVED_HANDOFF_STITCH_THRESHOLD_METERS &&
      routeMeters <= gapMeters * OBSERVED_HANDOFF_MAX_CIRCUITY_RATIO
    ) {
      return {
        connector: osrmRoute,
        gapMeters,
        method: `osrm-route-${label}`,
      };
    }

    return {
      connector: [from, to],
      gapMeters,
      method: `straight-line-fallback-${label}-circuitous-osrm`,
    };
  }

  return {
    connector: [from, to],
    gapMeters,
    method: `straight-line-fallback-${label}`,
  };
}

async function stitchObservedLikelyPathToClosureGates(path, entryPoint, exitPoint) {
  const basePath = normalizePolyline(path);
  const entry = normalizeCoordinate(entryPoint);
  const exit = normalizeCoordinate(exitPoint);
  if (basePath.length < 2 || !entry || !exit) {
    return {
      path: basePath,
      entryGapMeters: null,
      exitGapMeters: null,
      stitchMethods: [],
    };
  }

  const entryHandoff = await buildObservedHandoffConnector(entry, basePath[0], 'entry');
  const exitHandoff = await buildObservedHandoffConnector(basePath[basePath.length - 1], exit, 'exit');
  const stitched = eraseRepeatedPathLoops(dedupeConsecutivePoints([
    ...entryHandoff.connector,
    ...basePath,
    ...exitHandoff.connector,
  ]));
  const stitchMethods = [entryHandoff.method, exitHandoff.method].filter((method) => method !== 'none');

  return {
    path: stitched.length >= 2 ? stitched : basePath,
    entryGapMeters: Math.round(entryHandoff.gapMeters),
    exitGapMeters: Math.round(exitHandoff.gapMeters),
    stitchMethods,
    originalPointCount: basePath.length,
    stitchedPointCount: stitched.length,
  };
}

async function buildObservedSegment(sourceData, docId, observedCase) {
  const existingSegment = getFirstSegment(sourceData) || {};
  const skippedSegmentPolyline =
    getPath(existingSegment.skippedSegmentPolyline).length >= 2
      ? existingSegment.skippedSegmentPolyline
      : sourceData.skippedSegmentPolyline;
  const inferredDetourPolyline =
    getPath(existingSegment.inferredDetourPolyline).length >= 2
      ? existingSegment.inferredDetourPolyline
      : sourceData.inferredDetourPolyline;
  const likelyDetourPolyline =
    getPath(existingSegment.likelyDetourPolyline).length >= 2
      ? existingSegment.likelyDetourPolyline
      : sourceData.likelyDetourPolyline;
  const entryPoint = existingSegment.entryPoint || sourceData.entryPoint;
  const exitPoint = existingSegment.exitPoint || sourceData.exitPoint;
  const refreshedLikelyPath = await refreshObservedLikelyPathWithOsrm(
    likelyDetourPolyline,
    entryPoint,
    exitPoint,
    observedCase
  );
  const stitchedLikelyPath = await stitchObservedLikelyPathToClosureGates(
    refreshedLikelyPath.path,
    entryPoint,
    exitPoint
  );
  const canShowDetourPath =
    existingSegment.canShowDetourPath ??
    sourceData.canShowDetourPath ??
    (getPath(likelyDetourPolyline).length >= 2 || getPath(inferredDetourPolyline).length >= 2);

  return pruneUndefined({
    ...existingSegment,
    segmentId: existingSegment.segmentId || docId,
    detourEventId: docId,
    sharedDetourEventId: observedCase.sharedDetourEventId || docId,
    sharedRouteIds: observedCase.sharedRouteIds || observedCase.routeIds,
    entryPoint,
    exitPoint,
    skippedSegmentPolyline,
    inferredDetourPolyline,
    likelyDetourPolyline: stitchedLikelyPath.path.length >= 2 ? stitchedLikelyPath.path : likelyDetourPolyline,
    entryConnectorPolyline: null,
    exitConnectorPolyline: null,
    likelyDetourRoadNames: existingSegment.likelyDetourRoadNames || sourceData.likelyDetourRoadNames || [],
    canShowDetourPath,
    roadMatchConfidence: existingSegment.roadMatchConfidence || sourceData.roadMatchConfidence || 'medium',
    roadMatchRawConfidence: existingSegment.roadMatchRawConfidence || sourceData.roadMatchRawConfidence || null,
    roadMatchSource: refreshedLikelyPath.refreshed
      ? 'osrm-route-observed-replay-refresh'
      : (existingSegment.roadMatchSource || sourceData.roadMatchSource || 'observed-replay-source'),
    detourPathLabel: existingSegment.detourPathLabel || sourceData.detourPathLabel || observedCase.title,
    confidence: existingSegment.confidence || sourceData.confidence || 'high',
    observedReplayHandoffStitched: stitchedLikelyPath.stitchMethods.length > 0,
    observedReplayEntryGapMeters: stitchedLikelyPath.entryGapMeters,
    observedReplayExitGapMeters: stitchedLikelyPath.exitGapMeters,
    observedReplayHandoffMethods: [refreshedLikelyPath.method, ...stitchedLikelyPath.stitchMethods].filter(Boolean),
    observedReplayRoadSnapRefreshed: refreshedLikelyPath.refreshed,
    observedReplayOriginalLikelyPointCount: stitchedLikelyPath.originalPointCount,
    observedReplayStitchedLikelyPointCount: stitchedLikelyPath.stitchedPointCount,
  });
}

async function buildObservedReplayDocument(sourceData, observedCase, storageConfig, durationMinutes) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
  const docId = getObservedReplayDocId(observedCase, storageConfig);
  const originalDetectedAt = asIsoDate(sourceData.detectedAt);
  const segment = await buildObservedSegment(sourceData, docId, observedCase);
  const canShowDetourPath =
    sourceData.canShowDetourPath ??
    segment.canShowDetourPath ??
    (getPath(segment.likelyDetourPolyline).length >= 2 || getPath(segment.inferredDetourPolyline).length >= 2);

  return pruneUndefined({
    ...sourceData,
    eventId: docId,
    detourEventId: docId,
    sharedDetourEventId: observedCase.sharedDetourEventId || docId,
    sharedRouteIds: observedCase.sharedRouteIds || observedCase.routeIds,
    eventPrimaryRouteId: observedCase.sharedRouteIds?.[0] || observedCase.routeIds[0],
    eventRouteCount: observedCase.sharedRouteIds?.length || observedCase.routeIds.length,
    eventLocationLabel: sourceData.eventLocationLabel || observedCase.title.replace(/^Observed replay —\s*/i, ''),
    routeId: sourceData.routeId || observedCase.routeIds[0],
    routeIds: observedCase.routeIds,
    title: observedCase.title,
    description: `${observedCase.description}${originalDetectedAt ? ` Original detected time: ${originalDetectedAt}.` : ''}`,
    locationText: observedCase.description,
    source: 'dev-detour-observed-replay',
    simulated: true,
    testPreset: `observed:${observedCase.id}`,
    originalSourceCollection: observedCase.collection,
    originalSourceDocId: observedCase.docId,
    originalDetectedAt,
    calibrationFocus: observedCase.calibrationFocus,
    detourVersion: storageConfig.detourVersion,
    detectedAt: now,
    lastSeenAt: now,
    updatedAt: now.getTime(),
    expiresAt,
    state: 'active',
    clearReason: null,
    staleForReview: false,
    isPersistent: false,
    confidence: sourceData.confidence || segment.confidence || 'high',
    vehicleCount: Math.max(Number(sourceData.vehicleCount) || 0, 2),
    uniqueVehicleCount: Math.max(Number(sourceData.uniqueVehicleCount) || Number(sourceData.vehicleCount) || 0, 2),
    currentVehicleCount: Math.max(Number(sourceData.currentVehicleCount) || 0, 1),
    riderVisible: true,
    riderVisibilityReason: 'observed-replay-for-calibration',
    canShowDetourPath,
    entryPoint: segment.entryPoint,
    exitPoint: segment.exitPoint,
    skippedSegmentPolyline: segment.skippedSegmentPolyline,
    inferredDetourPolyline: segment.inferredDetourPolyline,
    likelyDetourPolyline: segment.likelyDetourPolyline,
    entryConnectorPolyline: null,
    exitConnectorPolyline: null,
    likelyDetourRoadNames: segment.likelyDetourRoadNames,
    roadMatchConfidence: segment.roadMatchConfidence,
    roadMatchRawConfidence: segment.roadMatchRawConfidence,
    roadMatchSource: segment.roadMatchSource,
    detourPathLabel: segment.detourPathLabel,
    observedReplayHandoffStitched: segment.observedReplayHandoffStitched,
    observedReplayEntryGapMeters: segment.observedReplayEntryGapMeters,
    observedReplayExitGapMeters: segment.observedReplayExitGapMeters,
    observedReplayHandoffMethods: segment.observedReplayHandoffMethods,
    observedReplayOriginalLikelyPointCount: segment.observedReplayOriginalLikelyPointCount,
    observedReplayStitchedLikelyPointCount: segment.observedReplayStitchedLikelyPointCount,
    segments: [segment],
  });
}

function getObservedReplayDocId(observedCase, storageConfig) {
  return storageConfig.detourVersion === 'v2'
    ? `simulated:observed:${observedCase.id}`
    : `observed:${observedCase.id}`;
}

function buildSuppressedEdgeDocument(fixture, storageConfig, durationMinutes) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60_000);
  const docId = getEdgeDocId(fixture, storageConfig);
  const canShowDetourPath = fixture.canShowDetourPath === true;
  const likelyDetourPolyline = canShowDetourPath ? fixture.likelyDetourPolyline : null;
  const roadMatchConfidence = fixture.roadMatchConfidence || (canShowDetourPath ? 'high' : 'low');
  const roadMatchSource = fixture.roadMatchSource || (canShowDetourPath ? 'edge-fixture-valid' : 'edge-fixture-suppressed');
  const detourPathLabel = fixture.detourPathLabel || (canShowDetourPath ? 'Renderable edge-case path' : 'Suppressed edge-case path');
  const segment = {
    segmentId: docId,
    shapeId: 'edge-fixture',
    entryPoint: fixture.entryPoint,
    exitPoint: fixture.exitPoint,
    skippedSegmentPolyline: fixture.skippedSegmentPolyline,
    inferredDetourPolyline: fixture.inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames: fixture.likelyDetourRoadNames || [],
    canShowDetourPath,
    detourPathSuppressedReason: fixture.suppressedReason,
    roadMatchConfidence,
    roadMatchSource,
    detourPathLabel,
    confidence: 'high',
    evidencePointCount: fixture.inferredDetourPolyline.length,
    lastEvidenceAt: now,
  };

  return pruneUndefined({
    eventId: docId,
    detourEventId: docId,
    sharedDetourEventId: docId,
    routeId: fixture.routeId,
    routeIds: [fixture.routeId],
    shapeId: 'edge-fixture',
    title: fixture.title,
    description: fixture.description,
    locationText: fixture.description,
    source: 'dev-detour-simulation',
    simulated: true,
    testPreset: `edge:${fixture.id}`,
    detectedAt: now,
    lastSeenAt: now,
    updatedAt: now.getTime(),
    expiresAt,
    state: fixture.state || 'active',
    confidence: 'high',
    isPersistent: true,
    vehicleCount: 2,
    uniqueVehicleCount: 2,
    currentVehicleCount: fixture.currentVehicleCount ?? 0,
    riderVisible: fixture.riderVisible,
    riderVisibilityReason: fixture.riderVisibilityReason,
    staleForReview: Boolean(fixture.staleForReview),
    entryPoint: fixture.entryPoint,
    exitPoint: fixture.exitPoint,
    skippedSegmentPolyline: fixture.skippedSegmentPolyline,
    inferredDetourPolyline: fixture.inferredDetourPolyline,
    likelyDetourPolyline,
    likelyDetourRoadNames: fixture.likelyDetourRoadNames || [],
    canShowDetourPath,
    detourPathSuppressedReason: fixture.suppressedReason,
    roadMatchConfidence,
    roadMatchSource,
    detourPathLabel,
    segments: [segment],
  });
}

async function publishPreset(presetName, options) {
  const preset = getRegularPreset(presetName);
  if (!preset) {
    throw new Error(`Unknown regular preset "${presetName}". Run "list" to see options.`);
  }

  const ops = getSimulationOps();
  const result = await ops.create({
    preset: preset.preset,
    durationMinutes: getDurationMinutes(options),
  });

  if (result.status >= 400) {
    throw new Error(result.body?.error || `Publish failed with status ${result.status}`);
  }

  console.log(`Published ${preset.preset} for ${result.body.routeIds.join(', ')}.`);
  console.log(`Expires: ${result.body.expiresAt}`);
}

async function publishEdgeFixture(fixtureId, options) {
  const fixture = getEdgeFixture(fixtureId);
  if (!fixture) {
    throw new Error(`Unknown edge fixture "${fixtureId}". Run "edge-list" to see options.`);
  }

  const storageConfig = getStorageConfig();
  const db = getFirestore();
  const docId = getEdgeDocId(fixture, storageConfig);
  const doc = buildSuppressedEdgeDocument(fixture, storageConfig, getDurationMinutes(options));

  await db.collection(storageConfig.activeCollection).doc(docId).set(doc, { merge: true });
  console.log(`Published edge fixture ${fixture.id} to ${storageConfig.activeCollection}/${docId}.`);
  console.log(`Expected: ${getEdgeExpectedText(fixture)}.`);
}

async function publishObservedReplay(target, options) {
  const storageConfig = getStorageConfig();
  const db = getFirestore();
  const durationMinutes = getDurationMinutes(options);
  const selectedCases =
    !target || target === 'all'
      ? OBSERVED_REPLAY_CASES
      : [getObservedReplayCase(target)].filter(Boolean);

  if (selectedCases.length === 0) {
    throw new Error(`Unknown observed replay case "${target}". Run "observed-list" to see options.`);
  }

  const published = [];
  for (const observedCase of selectedCases) {
    const sourceSnap = await db.collection(observedCase.collection).doc(observedCase.docId).get();
    if (!sourceSnap.exists) {
      throw new Error(`Observed replay source not found: ${observedCase.collection}/${observedCase.docId}`);
    }

    const sourceData = sourceSnap.data() || {};
    if (!hasUsableDetourGeometry(sourceData)) {
      throw new Error(`Observed replay source has no usable skipped + likely/inferred geometry: ${observedCase.id}`);
    }

    const docId = getObservedReplayDocId(observedCase, storageConfig);
    const replayDoc = await buildObservedReplayDocument(sourceData, observedCase, storageConfig, durationMinutes);
    await db.collection(storageConfig.activeCollection).doc(docId).set(replayDoc, { merge: false });
    published.push({ observedCase, docId, replayDoc });
  }

  console.log(`Published ${published.length} observed replay detour(s) to ${storageConfig.activeCollection}:`);
  published.forEach(({ observedCase, docId, replayDoc }) => {
    console.log(`- ${docId}`);
    console.log(`  routes: ${observedCase.routeIds.join(', ')}`);
    console.log(`  skipped points: ${getSkippedPointCount(replayDoc)}, likely points: ${getLikelyPointCount(replayDoc)}`);
    if (replayDoc.observedReplayHandoffStitched) {
      console.log(`  handoff stitched: entry gap ${replayDoc.observedReplayEntryGapMeters}m, exit gap ${replayDoc.observedReplayExitGapMeters}m`);
    }
    console.log(`  focus: ${observedCase.calibrationFocus}`);
  });
}

function isSimulatedDoc(docId, data) {
  return (
    data?.simulated === true ||
    data?.source === 'dev-detour-simulation' ||
    data?.source === 'dev-detour-observed-replay' ||
    String(docId).startsWith('simulated:') ||
    String(data?.testPreset || '').startsWith('edge:') ||
    String(data?.testPreset || '').startsWith('observed:')
  );
}

async function getSimulatedDocs(collectionName) {
  const db = getFirestore();
  const snap = await db.collection(collectionName).get();
  const docs = [];
  snap.forEach((doc) => {
    const data = doc.data() || {};
    if (isSimulatedDoc(doc.id, data)) {
      docs.push({ collectionName, id: doc.id, ref: doc.ref, data });
    }
  });
  return docs;
}

async function clearSimulated(target = 'all') {
  const targetName = target || 'all';
  const targetAll = targetName === 'all';
  const edgeFixture = getEdgeFixture(targetName);
  const observedCase = getObservedReplayCase(targetName);
  const routeIds = !targetAll && !edgeFixture && !observedCase ? routeIdsForTarget(targetName) : null;
  const routeIdSet = routeIds ? new Set(routeIds.map((routeId) => String(routeId))) : null;
  const regularDocIds = routeIds
    ? new Set(routeIds.flatMap((routeId) => Array.from(getRouteSimulationDocIds(routeId))))
    : null;

  const deleted = [];
  for (const collectionName of ALL_SIMULATION_COLLECTIONS) {
    const docs = await getSimulatedDocs(collectionName);
    for (const doc of docs) {
      const matchesAll = targetAll;
      const matchesRoute =
        routeIdSet?.has(String(doc.data?.routeId)) ||
        regularDocIds?.has(String(doc.id));
      const matchesEdge =
        edgeFixture &&
        (doc.id === getEdgeDocId(edgeFixture, { detourVersion: 'v2' }) ||
          doc.id === getEdgeDocId(edgeFixture, { detourVersion: 'v1' }) ||
          doc.data?.testPreset === `edge:${edgeFixture.id}`);
      const matchesObserved =
        observedCase &&
        (doc.id === getObservedReplayDocId(observedCase, { detourVersion: 'v2' }) ||
          doc.id === getObservedReplayDocId(observedCase, { detourVersion: 'v1' }) ||
          doc.data?.testPreset === `observed:${observedCase.id}`);

      if (!matchesAll && !matchesRoute && !matchesEdge && !matchesObserved) continue;

      await doc.ref.delete();
      deleted.push(`${collectionName}/${doc.id}`);
    }
  }

  if (deleted.length === 0) {
    console.log(`No simulated detours matched "${target}".`);
    return;
  }

  console.log(`Deleted ${deleted.length} simulated detour document(s):`);
  deleted.forEach((id) => console.log(`- ${id}`));
}

function getSegmentCount(data) {
  return Array.isArray(data?.segments) ? data.segments.length : 0;
}

function getLikelyPointCount(data) {
  const segment = Array.isArray(data?.segments) ? data.segments[0] : null;
  return (
    (Array.isArray(segment?.likelyDetourPolyline) && segment.likelyDetourPolyline.length) ||
    (Array.isArray(data?.likelyDetourPolyline) && data.likelyDetourPolyline.length) ||
    0
  );
}

function getSkippedPointCount(data) {
  const segment = Array.isArray(data?.segments) ? data.segments[0] : null;
  return (
    (Array.isArray(segment?.skippedSegmentPolyline) && segment.skippedSegmentPolyline.length) ||
    (Array.isArray(data?.skippedSegmentPolyline) && data.skippedSegmentPolyline.length) ||
    0
  );
}

function getCanShowDetourPath(data) {
  const segment = Array.isArray(data?.segments) ? data.segments[0] : null;
  if (segment && Object.prototype.hasOwnProperty.call(segment, 'canShowDetourPath')) {
    return segment.canShowDetourPath;
  }
  return data?.canShowDetourPath;
}

async function verifySimulatedDocs() {
  const docs = [];
  for (const collectionName of ALL_SIMULATION_COLLECTIONS) {
    docs.push(...await getSimulatedDocs(collectionName));
  }

  if (docs.length === 0) {
    console.log('No simulated detours are currently published.');
    return;
  }

  let failureCount = 0;
  console.log(`Found ${docs.length} simulated detour document(s):`);
  docs.forEach((doc) => {
    const data = doc.data;
    const likelyPoints = getLikelyPointCount(data);
    const skippedPoints = getSkippedPointCount(data);
    const canShowPath = getCanShowDetourPath(data);
    const isEdge = String(data?.testPreset || '').startsWith('edge:');
    const isSuppressedEdge = isEdge && canShowPath === false && likelyPoints === 0;
    const isRenderable = likelyPoints >= 2 && skippedPoints >= 2;
    const isRenderableRegular = !isEdge && isRenderable;
    const isRenderableEdge = isEdge && canShowPath === true && isRenderable;
    const isHidden = data?.riderVisible === false;
    const ok = isSuppressedEdge || isRenderableRegular || isRenderableEdge || isHidden;

    if (!ok) failureCount += 1;

    console.log(`- ${doc.collectionName}/${doc.id}`);
    console.log(`  route: ${data.routeId || 'unknown'}`);
    console.log(`  preset: ${data.testPreset || 'generic'}`);
    console.log(`  riderVisible: ${data.riderVisible !== false}`);
    console.log(`  segments: ${getSegmentCount(data)}, skipped points: ${skippedPoints}, likely points: ${likelyPoints}`);
    console.log(`  path gate: ${canShowPath === false ? `suppressed (${data.detourPathSuppressedReason || 'no reason'})` : 'renderable/implicit'}`);
    console.log(`  status: ${ok ? 'OK' : 'CHECK'}`);
  });

  if (failureCount > 0) {
    process.exitCode = 1;
    console.error(`${failureCount} simulated detour document(s) need review.`);
  }
}

async function main() {
  const { args, options } = parseArgs(process.argv.slice(2));
  const command = args[0] || 'help';
  const target = args[1];

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'list') {
    printRegularPresets();
    return;
  }

  if (command === 'edge-list') {
    printEdgeFixtures();
    return;
  }

  if (command === 'observed-list') {
    printObservedReplayCases();
    return;
  }

  configureEnvironment(options);

  if (command === 'publish') {
    await publishPreset(target, options);
    return;
  }

  if (command === 'publish-edge') {
    await publishEdgeFixture(target, options);
    return;
  }

  if (command === 'publish-observed') {
    await publishObservedReplay(target, options);
    return;
  }

  if (command === 'verify') {
    await verifySimulatedDocs();
    return;
  }

  if (command === 'clear') {
    await clearSimulated(target || 'all');
    return;
  }

  throw new Error(`Unknown command "${command}". Run "help" to see usage.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});





