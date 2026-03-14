const makeTrip = (tripId, routeId, shapeId) => ({ tripId, routeId, shapeId });

const makeStopTimes = (tripId, stopIds) =>
  stopIds.map((stopId, index) => ({
    tripId,
    stopId,
    stopSequence: index + 1,
  }));

export const BARRIE_12A_FULL_SHAPE_ID = '47c58a29-9a71-4021-a319-c82abca6f233';
export const BARRIE_12A_SHORT_SHAPE_ID = 'f5b923ae-e135-4e70-b60f-edc86a495006';
export const BARRIE_8A_BRANCH_SHAPE_ID = '03113888-0669-4b4a-b0d8-8d87fa8db294';
export const BARRIE_8A_MAIN_SHAPE_ID = 'f4356c7f-0d5b-4427-adc3-e75cbb2eafce';

export const BARRIE_12A_FULL_STOP_IDS = [
  '725', '510', '515', '596', '602', '595', '600', '121', '117', '802', '972', '774', '878', '879', '751',
  '124', '678', '675', '672', '681', '932', '933', '756', '757', '97', '777', '736', '90', '968', '87',
  '100', '83', '95', '102', '54', '56', '55', '386', '817', '9013', '147', '149', '152', '150', '2', '485',
  '73', '67', '57', '59', '65', '61', '70', '71', '76',
];

export const BARRIE_12A_SHORT_STOP_IDS = [
  '2', '485', '73', '67', '57', '59', '65', '61', '70', '71', '76',
];

export const BARRIE_8A_BRANCH_STOP_IDS = [
  '9005', '154', '156', '158', '2', '485', '188', '192', '189', '194', '186', '128', '141', '139', '136',
  '143', '129', '182', '184', '183', '414', '409', '410', '401', '406', '325', '332', '612', '569', '330',
];

export const BARRIE_8A_MAIN_STOP_IDS = [
  '725', '953', '955', '956', '957', '516', '511', '512', '741', '678', '675', '987', '777', '506', '524',
  '526', '536', '538', '533', '530', '308', '299', '46', '49', '47', '473', '548', '552', '545', '542', '543',
  '547', '488', '493', '495', '291', '305', '313', '295', '983', '296', '301', '873', '817', '9005', '154',
  '156', '158', '2', '485', '188', '192', '189', '194', '186', '128', '141', '139', '136', '143', '129',
  '182', '184', '183', '414', '409', '410', '401', '406', '325', '332', '612', '569', '330',
];

export const barrieTrips = [
  makeTrip('12A-full-1', '12A', BARRIE_12A_FULL_SHAPE_ID),
  makeTrip('12A-full-2', '12A', BARRIE_12A_FULL_SHAPE_ID),
  makeTrip('12A-short-1', '12A', BARRIE_12A_SHORT_SHAPE_ID),
  makeTrip('8A-branch-1', '8A', BARRIE_8A_BRANCH_SHAPE_ID),
  makeTrip('8A-main-1', '8A', BARRIE_8A_MAIN_SHAPE_ID),
];

export const barrieStopTimes = [
  ...makeStopTimes('12A-full-1', BARRIE_12A_FULL_STOP_IDS),
  ...makeStopTimes('12A-full-2', BARRIE_12A_FULL_STOP_IDS),
  ...makeStopTimes('12A-short-1', BARRIE_12A_SHORT_STOP_IDS),
  ...makeStopTimes('8A-branch-1', BARRIE_8A_BRANCH_STOP_IDS),
  ...makeStopTimes('8A-main-1', BARRIE_8A_MAIN_STOP_IDS),
];

export const barrieBranchStops = [
  { id: '9005', name: 'Barrie Allandale Transit Terminal Platform 5', code: '9005', latitude: 44.3739253232581, longitude: -79.6897531198448 },
  { id: '154', name: 'Lakeshore at Centennial', code: '154', latitude: 44.3784826069464, longitude: -79.690070599895 },
  { id: '156', name: 'Lakeshore at Victoria', code: '156', latitude: 44.381907242682, longitude: -79.6906172621754 },
  { id: '158', name: 'Lakeshore at Simcoe', code: '158', latitude: 44.3857946524221, longitude: -79.6914871682386 },
  { id: '2', name: 'Downtown Hub', code: '2', latitude: 44.387753, longitude: -79.690237 },
  { id: '485', name: 'Maple at Ross', code: '485', latitude: 44.39039984, longitude: -79.69250726 },
  { id: '188', name: 'Collier at Clapperton', code: '188', latitude: 44.39030032, longitude: -79.69020332 },
  { id: '192', name: 'Owen Street', code: '192', latitude: 44.3903620177723, longitude: -79.6875199489307 },
  { id: '189', name: 'Collier at Mulcaster', code: '189', latitude: 44.39037224, longitude: -79.68509193 },
  { id: '194', name: 'Poyntz Street', code: '194', latitude: 44.39042963, longitude: -79.68326777 },
];
