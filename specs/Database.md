# Database

Tabula stores everything in a locally available sqlite database (maybe apart from session-bound data like cloud auth tokens, theme, app language).

The application works with the database through `SQLDelight` library.

## Schema change

Any change of schema is to be described as a separate migration file as SQLDelight recommends.

When the application loads, it checks for the database version and applies any pending migrations.

Important: it is to be expected that users of the application may use older versions of the database and compatibility preservation is **crucial**.
User's data must not be lost (unless it's really an intentional change), and should be properly migrated when the schema changes.

Schema changes must be covered with migration unit-tests.