const fs = require('fs');
const path = require('path');

describe('DetourReviewScreen source contract', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../screens/DetourReviewScreen.js'), 'utf8');
  const profile = fs.readFileSync(path.join(__dirname, '../screens/ProfileScreen.js'), 'utf8');
  const nativeMap = fs.readFileSync(path.join(__dirname, '../components/DetourReviewMap.js'), 'utf8');

  test('keeps the operator entry access-controlled and supports required review evidence', () => {
    expect(profile).toContain('detourReviewService.getAccess()');
    expect(profile).toContain('canReviewDetours ?');
    expect(screen).toContain("detectionLabel: ''");
    expect(screen).toContain('Evidence source');
    expect(screen).toContain('Operator note');
    expect(screen).toContain('useSafeBottomInset');
  });

  test('native review maps keep one initial camera setting per explicitly selected case', () => {
    expect(screen).toContain('<DetourReviewMap key={detail.caseId} reviewCase={detail} />');
    expect(nativeMap).toContain('const initialCameraSettingsRef = useRef(null)');
    expect(nativeMap).toContain('defaultSettings={initialCameraSettingsRef.current}');
  });
});
