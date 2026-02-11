# Design QA - Marketing & Web Design Expert

Expert design quality assurance for the Barrie Transit Trip Planner app. Reviews code against PROJECT_PLAN.md specifications and enforces enterprise-level design standards.

## Triggers

Use this skill when the user mentions:
- "design review", "design QA", "QA the UI", "check design"
- "review against design specs", "design audit", "UI audit"
- "check styling", "verify design system", "design consistency"
- "does this match the design", "compare to specs"
- "enterprise quality check", "production ready review"
- "BudgetMe style check", "brand consistency"

## Design System Reference (from PROJECT_PLAN.md)

### Color Palette
| Token | Value | Usage |
|-------|-------|-------|
| `--color-primary` | `#4CAF50` | Primary actions, buttons, active states |
| `--color-background` | `#FFFFFF` | Page/screen backgrounds |
| `--color-text` | `#333333` | Body text, headings |
| `--color-text-secondary` | `#666666` | Secondary/muted text |
| `--color-shadow` | `rgba(0,0,0,0.1)` | Card shadows |

### Typography
- **Hierarchy:** Clear size differentiation (headings > subheadings > body)
- **Body text:** Dark gray (#333333)
- **Numbers (times):** Large, highly readable
- **Font weights:** Bold for emphasis, regular for body

### Spacing & Layout
- **Card border-radius:** 12-16px (rounded, friendly)
- **Card shadows:** Subtle (2-4px blur, low opacity)
- **Padding:** Consistent internal card padding (16px recommended)
- **Margins:** Consistent spacing between elements

### UI Components

#### Buttons
- **Primary:** Pill-shaped, green (#4CAF50), white text
- **Touch targets:** Minimum 44x44px for accessibility
- **States:** Clear hover/pressed/disabled states

#### Cards
- **Style:** Rounded corners (12-16px), subtle shadow
- **Background:** White on light gray or white background
- **Content:** Clear hierarchy within cards

#### Route Badges
- **Shape:** Pill-shaped
- **Color:** Route-specific colors
- **Text:** High contrast for readability

#### Icons
- **Style:** Simple, friendly, colorful
- **Size:** Consistent sizing throughout app
- **Meaning:** Clear, intuitive iconography

### Screen Patterns
1. **Home (Map-first):** Full-screen map + floating search bar
2. **Stop Detail:** Bottom sheet sliding up
3. **Trip Planner:** Search bar + route cards below map
4. **Favorites:** Card grid layout

## Review Checklist

When activated, perform a comprehensive review:

### 1. Visual Design Audit
- [ ] Primary color matches `#4CAF50` (or documented variant)
- [ ] Background colors are clean white (`#FFFFFF`)
- [ ] Text colors use `#333333` for primary, proper hierarchy
- [ ] Card border-radius is 12-16px consistently
- [ ] Shadows are subtle and consistent
- [ ] Spacing follows 4px/8px grid system
- [ ] Typography hierarchy is clear and readable

### 2. Component Quality Audit
- [ ] Buttons are pill-shaped with proper padding
- [ ] Touch targets are minimum 44x44px (AODA/WCAG)
- [ ] Cards have consistent styling throughout
- [ ] Route badges are pill-shaped with route colors
- [ ] Icons are simple, friendly, and sized consistently
- [ ] Bottom sheets implement proper slide-up pattern
- [ ] Loading states are implemented

### 3. Accessibility Audit (AODA Compliance)
- [ ] Color contrast meets WCAG 2.1 AA (4.5:1 for text)
- [ ] Touch targets are 44x44px minimum
- [ ] Text is scalable/readable at larger sizes
- [ ] VoiceOver/TalkBack labels are present
- [ ] Focus indicators are visible
- [ ] No color-only indicators (use icons/text too)

### 4. Brand Consistency Audit
- [ ] Green accent used consistently for primary actions
- [ ] "Friendly, approachable" tone in UI copy
- [ ] BudgetMe-inspired clean aesthetic maintained
- [ ] No conflicting color schemes
- [ ] Icons match friendly/simple style guide

### 5. Responsiveness Audit
- [ ] Layouts adapt to different screen sizes
- [ ] Cards/grids reflow appropriately
- [ ] Text remains readable at all sizes
- [ ] Touch targets don't become too small
- [ ] Map remains usable on small screens

## Review Process

### Step 1: Identify Files to Review
```
Prompt: "What files or components should I review?"
Options:
- Specific file (user provides path)
- All screens (src/screens/*.js)
- All components (src/components/*.js)
- Specific feature area
- Full codebase scan
```

### Step 2: Perform Audit
For each file/component:
1. Read the source code
2. Extract styling (StyleSheet, inline styles, Tailwind classes)
3. Compare against design system specifications
4. Check accessibility requirements
5. Verify component patterns

### Step 3: Generate Report

#### Report Format
```markdown
# Design QA Report
**File:** [filename]
**Date:** [date]
**Overall Score:** [X/100]

## Critical Issues (Must Fix)
| Issue | Location | Spec | Actual | Fix |
|-------|----------|------|--------|-----|
| Wrong primary color | Line 45 | #4CAF50 | #2196F3 | Change to #4CAF50 |

## Warnings (Should Fix)
| Issue | Location | Recommendation |
|-------|----------|----------------|
| Card radius inconsistent | Line 23 | Use 12px consistently |

## Suggestions (Nice to Have)
- Consider adding loading skeleton for cards
- Shadow could be slightly more subtle

## Passed Checks
- ✅ Typography hierarchy
- ✅ Touch target sizes
- ✅ Color contrast
```

### Step 4: Offer Fixes
After presenting the report, offer to automatically fix issues:

```
I found [X] issues. Would you like me to:
1. Fix all issues automatically
2. Fix critical issues only
3. Show me the fixes first for approval
4. Skip fixes, just keep the report
```

## Code Quality Standards (Enterprise-Level)

### Style Definitions
```javascript
// CORRECT - Design system compliant
const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    padding: 16,
  },
  primaryButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 24, // Pill-shaped
    paddingVertical: 12,
    paddingHorizontal: 24,
    minHeight: 44, // AODA touch target
    minWidth: 44,
  },
  bodyText: {
    color: '#333333',
    fontSize: 16,
    lineHeight: 24,
  },
});
```

### Common Anti-Patterns to Flag
```javascript
// WRONG - Flag these issues
backgroundColor: 'blue'        // Not in design system
borderRadius: 4               // Too sharp, should be 12-16
color: 'black'                // Should be #333333
padding: 5                    // Not on 4/8px grid
minHeight: 30                 // Below 44px touch target
```

## Integration with Codebase

### Files to Reference
- `PROJECT_PLAN.md` - Master design specifications
- `src/config/constants.js` - Should contain design tokens
- `src/components/` - UI components to audit
- `src/screens/` - Screen layouts to audit

### Design Token Expectations
The codebase should have centralized design tokens:
```javascript
// src/config/theme.js (recommended structure)
export const colors = {
  primary: '#4CAF50',
  background: '#FFFFFF',
  text: '#333333',
  textSecondary: '#666666',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  card: 12,
  button: 24,
  badge: 16,
};
```

## Output Modes

### Audit Mode (Default)
Generates comprehensive report without making changes.

### Fix Mode
After audit, applies approved fixes automatically.

### Watch Mode (Continuous)
Reviews files as they're created/modified during development.

## Example Usage

**User:** "Review the HomeScreen against our design specs"

**Response:**
1. Read `src/screens/HomeScreen.js`
2. Extract all style definitions
3. Compare each style property against design system
4. Check accessibility requirements
5. Generate report with issues and fixes
6. Offer to apply corrections

---

*This skill ensures the Barrie Transit Trip Planner maintains consistent, enterprise-quality design aligned with the BudgetMe-inspired aesthetic defined in PROJECT_PLAN.md.*
