# Privacy Policy

**MyBarrie Transit**

**Last updated: July 20, 2026**

This policy explains how MyBarrie Transit, independently operated by Mike McMike, handles information. The app is not affiliated with, endorsed by, or operated by the City of Barrie or Barrie Transit.

## Information the App Handles

- **Account information:** If you create an account, Firebase Authentication processes your email address, display name, profile photo, sign-in provider, and account identifier.
- **Saved rider data:** Favorites, saved places and trips, recent trips, route subscriptions, notification preferences, and app settings may be stored in Firebase and on your device.
- **Location and searches:** With permission, the app uses your location for nearby stops and walking connections. Address searches and walking-route requests may send an address, coordinates, or both through the app's API proxy to LocationIQ. The app does not build a location-history profile.
- **Notifications:** If enabled, the app and Firebase store notification preferences, a device identifier, and an Expo push token.
- **App feedback:** Submitted feedback includes the category, message, app version, platform, source screen, timestamps, and a pseudonymous identifier for rate limiting and retry protection. It does not attach your email address. Do not include sensitive personal information.
- **Performance data:** If crash reporting is enabled, Sentry may receive crash details, diagnostics, device type, operating-system version, and technical context. The app does not intentionally add account or precise-location data to crash reports.
- **Web analytics:** The web version may use Firebase Analytics for app interactions and general technical information. Native Android and iOS analytics calls are disabled in the current implementation.
- **Transit and map requests:** Transit and map providers may receive standard network information such as an IP address.

## Why Information Is Used

- Provide trip planning, nearby stops, arrivals, maps, favorites, and account sync.
- Deliver notifications that you choose to enable.
- Respond to feedback, secure the service, prevent abuse, and improve reliability.
- Meet legal, security, audit, and operational requirements.

## Service Providers

| Provider | Purpose |
|---|---|
| Google Firebase / Google Cloud | Authentication, account and app data, API hosting, web analytics, and service operations |
| Expo | Push notification delivery, app updates, and build services |
| LocationIQ | Address search and walking directions |
| Sentry | Crash reporting and diagnostics when enabled |
| Resend | Optional private email alerts containing submitted feedback and technical context for authorized staff |
| OpenStreetMap and CARTO | Map data and map tiles |

## Retention

- Account data is kept while the account is active and deleted through the account-deletion process.
- App feedback is scheduled for deletion after no more than 365 days and may be deleted earlier after resolution.
- Pseudonymous feedback rate-limit records are scheduled for deletion after no more than 30 days.
- Local caches remain until cleared, deleted, or the app is uninstalled.
- Provider logs and backups may be retained for limited security, continuity, and legal periods under applicable provider and app-operator schedules.

## Your Choices

- Use core transit features without an account.
- Change location and notification permissions in device settings.
- Delete a signed-in account in the app or follow [the account deletion instructions](account-deletion.md).
- Use the private in-app feedback form for app issues. Account deletion requests can also follow the account-deletion process.

## Security and Legal Framework

Information is transmitted over encrypted connections and access is restricted according to operational need. No system can guarantee absolute security. The app operator handles information in accordance with applicable Canadian and Ontario privacy law.

## Contact

For app support, privacy requests, access, correction, or deletion, contact Mike McMike at [mybarrietransit@outlook.com](mailto:mybarrietransit@outlook.com). For fares, schedules, transit service, or other Barrie Transit questions, email [ServiceBarrie@barrie.ca](mailto:ServiceBarrie@barrie.ca). Service Barrie is not the app operator.
