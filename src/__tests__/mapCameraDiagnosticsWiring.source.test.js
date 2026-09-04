import fs from 'fs';
import path from 'path';

const read = (relativePath) => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');

describe('map camera diagnostic build wiring', () => {
  test('records native home camera commands and completed map regions', () => {
    const source = read('screens/HomeScreen.js');

    expect(source).toContain("recordMapCameraDiagnostic('camera.command'");
    expect(source).toContain("recordMapCameraDiagnostic('map.region.will-change'");
    expect(source).toContain("recordMapCameraDiagnostic('map.region.did-change'");
    expect(source).not.toContain("source: 'home.detour-event-selection'");
    expect(source).toContain("'selection.stop-marker'");
  });

  test('records stop and detour bottom-sheet lifecycle events', () => {
    expect(read('components/StopBottomSheet.js')).toContain("'sheet.stop.animating'");
    expect(read('components/StopBottomSheet.js')).toContain("'sheet.stop.changed'");
    expect(read('components/DetourDetailsSheet.js')).toContain("'sheet.detour.animating'");
    expect(read('components/DetourDetailsSheet.js')).toContain("'sheet.detour.changed'");
  });

  test('exposes diagnostics only in the dedicated build profile', () => {
    const settings = read('screens/SettingsScreen.js');
    const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '../../eas.json'), 'utf8'));

    expect(settings).toContain('MAP_CAMERA_DIAGNOSTICS_ENABLED && renderSection');
    expect(settings).toContain("'Share Map Diagnostics'");
    expect(eas.build['camera-diagnostics-apk'].env.EXPO_PUBLIC_ENABLE_MAP_CAMERA_DIAGNOSTICS).toBe('true');
    expect(eas.build.production.env.EXPO_PUBLIC_ENABLE_MAP_CAMERA_DIAGNOSTICS).toBeUndefined();
  });
});
