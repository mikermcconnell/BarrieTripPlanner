/**
 * Barrie Transit fare data
 * Source: barrie.ca/TransitFares
 */

export const FARES = {
  singleRide: {
    adult: 3.50,
    senior: 3.00,
    student: 3.50,
    child: 0, // 12 and under ride free
  },
  tenRide: {
    adult: 30.00,
    senior: 21.00,
    student: 26.00,
  },
  monthlyPass: {
    adult: 93.00,
    senior: 54.00,
    student: 71.25,
  },
  dayPass: {
    individual: 8.50,
    family: 10.00,
  },
  transferPolicy: {
    durationMinutes: 90,
    description: 'Valid for 90 minutes — transfers included',
  },
  freePrograms: [
    'Children 12 and under',
    'Seniors on Tuesdays & Thursdays',
    'CNIB card holders',
    'GO Transit connections (with valid GO fare)',
    'Licence 2 Ride (Grade 9 students)',
  ],
  paymentMethods: ['HotSpot App', 'Cash (exact change)', 'Monthly/Day passes'],
  lastUpdated: '2025-02',
};

export const HOTSPOT_LINKS = {
  playStore: 'https://play.google.com/store/apps/details?id=com.passportparking.mobile.parkbarrie',
  appStore: 'https://apps.apple.com/ca/app/hotspot-barrie/id1234724557',
  web: 'https://www.hotspotparking.com/',
};

/**
 * Get the single-ride fare for a rider type
 */
export function getSingleFare(riderType = 'adult') {
  return FARES.singleRide[riderType] ?? FARES.singleRide.adult;
}

/**
 * Format a fare amount as currency
 */
export function formatFare(amount) {
  if (amount === 0) return 'FREE';
  return `$${amount.toFixed(2)}`;
}
