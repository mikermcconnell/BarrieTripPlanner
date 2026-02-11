# Bug Fix Skill

Systematic bug fixing for the Barrie Transit Trip Planner that enforces platform parity, build verification, and prevents regressions.

## Triggers

Use this skill when the user mentions:
- "fix bug", "bugfix", "fix this", "something broke"
- "not working", "broken", "error", "crash"
- "regression", "it used to work"

## Steps

### Step 1: Understand the Bug
- Read the bug report or user description
- Identify which platform is affected (web, native, or both)
- Ask which platform the user is actively testing on if not clear

### Step 2: Locate Affected Files
- Find ALL files related to the bug
- For EACH file, check if a `.web.js` counterpart exists using Glob
- Create a checklist of every file that needs changes on BOTH platforms

### Step 3: Reproduce & Diagnose
- Read the relevant source code
- Trace the bug to its root cause
- Check for common patterns:
  - `background` vs `backgroundColor` (RN requires `backgroundColor`)
  - DOM `<svg>` in native files (must use `react-native-svg`)
  - Wrong navigation route names (check `src/navigation/TabNavigator.js`)
  - Missing `.web.js` updates
  - Stale closures from `useState` used for cleanup refs (use `useRef`)

### Step 4: Implement the Fix
- Fix the bug in the primary file
- Mirror the fix to ALL platform variants (`.web.js`, `.native.js`)
- Do NOT refactor surrounding code or add unrequested improvements
- Keep the diff minimal — fix ONLY what's broken

### Step 5: Verify
- If `package.json` was modified, run `npm install`
- Run `npm test` if tests exist for the modified area
- Confirm no import errors or obvious runtime issues
- List all files changed with a summary of what was fixed on each platform

## Rules

- NEVER edit only native files without checking for web counterparts
- NEVER use `background` in React Native styles — always `backgroundColor`
- NEVER guess navigation route names — verify against `TabNavigator.js`
- NEVER add features, refactor, or "improve" code beyond the bug fix
- ALWAYS verify the fix addresses the root cause, not just symptoms
- ALWAYS run `npm install` if dependencies changed

## Output Format

After fixing, provide:

```
## Bug Fix Summary
**Bug:** [one-line description]
**Root Cause:** [what was actually wrong]
**Platform:** [web / native / both]

### Files Changed
| File | Change |
|------|--------|
| `src/...` | [what was fixed] |
| `src/....web.js` | [mirrored fix] |

### Verification
- [ ] npm install (if needed)
- [ ] npm test (if applicable)
- [ ] Web counterparts updated
- [ ] No unrequested changes
```
