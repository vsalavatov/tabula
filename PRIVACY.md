# Privacy Notice

Last updated: June 27, 2026

Tabula is a browser-based personal finance and inventory app. This notice explains what data the app uses and where it is stored.

## Summary

Tabula is designed so your app data stays under your control. The app does not run a Tabula application server, and the project maintainer does not receive your accounts, transactions, units, analytics, database, or backup files through normal app use.

## Data Stored Locally

Tabula stores your app database in your browser using browser storage APIs. This database can include data you enter into the app, such as accounts, units, transactions, quantities, descriptions, and derived analytics.

Tabula may also store local settings, such as the selected theme mode, in browser storage.

If Google Drive sync is enabled, Tabula may cache a short-lived Google Drive access token in browser storage so the app can reconnect during the token lifetime. Anyone with access to your browser profile or a compromised browser session may be able to access locally stored app data or tokens.

You can delete locally stored Tabula data by clearing the browser site data for the Tabula site.

## Google Drive Sync

When you sign in with Google Drive, Tabula requests access to the Google Drive app data folder scope. The app uses this access to list, upload, download, restore, and delete Tabula backup files in your Google Drive `appDataFolder`.

The `appDataFolder` is controlled by your Google account. Tabula does not intentionally read your normal Google Drive files. Google may process account, authentication, and service usage data according to Google's own terms and privacy policies.

You can remove Tabula's Google access from your Google Account permissions. You can also delete Tabula backups from inside the app.

## Data Sharing

Tabula does not sell your data and does not intentionally share your app database with the project maintainer.

If you choose to use Google Drive sync, backup data is sent directly from your browser to Google Drive. If you publish screenshots, bug reports, exported databases, or logs yourself, those may contain personal data you entered into the app.

## Cookies, Analytics, And Tracking

Tabula does not intentionally use advertising cookies, analytics trackers, or third-party behavioral tracking. The app loads Google Identity Services when Google sign-in is available, and that service is provided by Google.

## Your Choices

You can use Tabula without Google Drive sync.

You can clear browser site data to remove local Tabula data from a device.

You can delete backup files from the app and revoke Google account access through your Google Account settings.

You can inspect the source code in this repository to understand how data is handled.

## Contact

For privacy or security questions, contact the project maintainer through the repository's public issue tracker or the contact address listed on the repository owner profile.

This notice may change as the app changes. If Tabula adds a server, analytics, crash reporting, or additional third-party services, this notice should be updated before those features are released.
