# Confirmed detour management brief

The current sender is the Firebase scheduled function `detourManagementBrief`. See [API proxy operations](API-PROXY-OPERATIONS.md#detour-management-brief) for secrets, activation, and the Outlook gate.

The email follows the manual Detour Notice layout: a navy heading, colored route badges, a street map on the left, and current status and impact details on the right. The map legend travels inside the attached image. Active diversion lines use each route's `route_color` from the live GTFS feed; a dashed line marks the skipped regular section when the published shape follows streets. Multi-route shared paths use parallel colored bands. Only confirmed skipped stops receive out-of-service markers. Automatic events show their confirmation time. Planned dates, time windows, causes, and temporary stop designations require an authoritative notice before they can be added.

The earlier GitHub Actions monitor and its plain technical email were retired. Legacy `detourEmailNotifications` records remain to suppress duplicate first alerts during migration. The old monitor service remains in the codebase only for its shared formatting, Resend transport, and legacy dedupe helpers.
