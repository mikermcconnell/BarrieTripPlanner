# Trip Planner: Time Picker + Marker Info Labels

## Feature 1: Native Time Picker Integration

### Current State
- `TimePicker.js` (406 lines) exists with wheel picker, quick offsets, Today/Tomorrow toggle
- NOT wired into `TripSearchHeader.js`
- `useTripPlanner.js` already sends `date`, `time`, `arriveBy` to OTP API
- Web already works with `<input type="datetime-local">`

### Changes
1. **`TripSearchHeader.js`** — Import and render `TimePicker.js` when user taps time display in non-'now' mode
2. **Key mapping** — TimePicker uses `'depart'`/`'arrive'`, hook uses `'departAt'`/`'arriveBy'`. Add adapter in TripSearchHeader.
3. **No web changes** — already functional

## Feature 2: Origin/Destination Marker Info Labels

### Current State
- Green/red markers are passive dots (id, type, title, coordinate only)
- OTP leg data has `name`, `stopCode`, `lat`/`lon` on `from`/`to` — not passed through
- `boardingAlightingMarkers` pattern already shows labels — reuse that pattern

### Changes
1. **`useTripVisualization.js`** — Extend tripMarkers with `stopName`, `stopCode`, walking distance from user origin/destination
2. **`HomeScreen.js`** — Add info labels below origin/destination markers (same pattern as boarding/alighting labels)
3. **`HomeScreen.web.js`** — Same labels using Leaflet divIcon HTML

### Label Format
`Stop Name (#StopCode) · 312m walk`

Walking distance calculated via haversineDistance from user's entered address to the transit stop.
