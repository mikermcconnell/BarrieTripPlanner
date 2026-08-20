const { buildStepProgressPresentation } = require('../hooks/useStepProgress');

const busLeg = {
  mode: 'BUS',
  route: { shortName: '8A' },
  from: { name: 'Downtown Terminal' },
  to: { name: 'Georgian College' },
};

describe('buildStepProgressPresentation', () => {
  test('turns a live bus arrival into the primary boarding instruction', () => {
    const presentation = buildStepProgressPresentation({
      currentLeg: busLeg,
      legStatus: 'in_progress',
      transitStatus: 'waiting',
      busProximity: { hasArrived: true },
    });

    expect(presentation.navigationState.type).toBe('boarding');
    expect(presentation.instructionText).toBe('Board your bus now');
  });

  test('shows live stops remaining while riding', () => {
    const presentation = buildStepProgressPresentation({
      currentLeg: busLeg,
      legStatus: 'in_progress',
      transitStatus: 'on_board',
      busProximity: { stopsUntilAlighting: 3 },
    });

    expect(presentation.navigationState.stopsRemaining).toBe(3);
    expect(presentation.instructionText).toBe('3 stops until Georgian College');
  });

  test('promotes the live alighting signal into the primary instruction', () => {
    const presentation = buildStepProgressPresentation({
      currentLeg: busLeg,
      legStatus: 'in_progress',
      transitStatus: 'on_board',
      busProximity: { shouldGetOff: true },
    });

    expect(presentation.navigationState.type).toBe('alighting');
    expect(presentation.instructionText).toBe('Get off at Georgian College!');
  });
});
