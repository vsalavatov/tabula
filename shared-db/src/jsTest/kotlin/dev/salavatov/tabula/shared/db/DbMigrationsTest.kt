package dev.salavatov.tabula.shared.db

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlCursor
import app.cash.sqldelight.db.SqlDriver
import kotlinx.coroutines.DelicateCoroutinesApi
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.promise
import kotlin.js.Promise
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

@OptIn(DelicateCoroutinesApi::class)
class DbMigrationsTest {
  @Test
  fun migratesVersion2DatabaseToAccountsUnitsAndQuantitySchema(): Promise<Unit> = GlobalScope.promise {
    assertMigrationPreservesData(version = 2, schemaStatements = version2DatabaseSchemaStatements())
  }

  @Test
  fun migratesVersion3DatabaseToAccountsUnitsAndQuantitySchema(): Promise<Unit> = GlobalScope.promise {
    assertMigrationPreservesData(version = 3, schemaStatements = version3DatabaseSchemaStatements())
  }

  @Test
  fun migratesVersion4DatabaseToAccountsUnitsAndQuantitySchema(): Promise<Unit> = GlobalScope.promise {
    assertMigrationPreservesData(version = 4, schemaStatements = version4DatabaseSchemaStatements())
  }

  @Test
  fun migratesVersion5DatabaseToAccountsUnitsAndQuantitySchema(): Promise<Unit> = GlobalScope.promise {
    assertMigrationPreservesData(version = 5, schemaStatements = version5DatabaseSchemaStatements())
  }

  private suspend fun assertMigrationPreservesData(version: Long, schemaStatements: List<String>) {
    val driver = SqlJsDriver.open()
    try {
      schemaStatements.forEach { statement -> execute(driver, statement) }
      execute(driver, "PRAGMA user_version = $version")

      val database = DbMigrations(driver).prepareDatabase()
      assertNotNull(database)

      assertEquals(6L, queryLong(driver, "PRAGMA user_version"))
      assertEquals(1L, queryLong(driver, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Units'"))
      assertEquals(0L, queryLong(driver, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Resources'"))
      assertEquals(1L, queryLong(driver, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Accounts'"))
      assertEquals(0L, queryLong(driver, "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'Stores'"))

      assertEquals("Euro", queryString(driver, "SELECT name FROM Units WHERE id = 1"))
      assertEquals(42.5, queryDouble(driver, "SELECT quantity FROM Assets WHERE id = 1"))
      assertEquals(1L, queryLong(driver, "SELECT unit FROM Assets WHERE id = 1"))
      assertEquals(1L, queryLong(driver, "SELECT account FROM Assets WHERE id = 1"))
      assertEquals(12.5, queryDouble(driver, "SELECT delta FROM Transfers WHERE id = 1"))
      assertEquals(1L, queryLong(driver, "SELECT unit FROM Transfers WHERE id = 1"))
      assertEquals(1L, queryLong(driver, "SELECT accountFrom FROM Transfers WHERE id = 1"))
      assertEquals(2L, queryLong(driver, "SELECT accountTo FROM Transfers WHERE id = 1"))
      assertEquals("Wallet", queryString(driver, "SELECT name FROM Accounts WHERE id = 1"))
      assertNull(queryString(driver, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'TransactionDeltas'"))
    } finally {
      driver.close()
    }
  }

  private fun version2DatabaseSchemaStatements(): List<String> = listOf(
    """
      CREATE TABLE Resources (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          mantissaLength INTEGER NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE Stores (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          owning INTEGER NOT NULL CHECK (owning == 0 OR owning == 1)
      )
    """.trimIndent(),
    """
      CREATE TABLE Assets (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          store INTEGER NOT NULL REFERENCES Stores(id),
          resource INTEGER NOT NULL REFERENCES Resources(id),
          amount REAL NOT NULL,
          UNIQUE (store, resource)
      )
    """.trimIndent(),
    """
      CREATE TABLE Transactions (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          description TEXT NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE TransactionDeltas (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          transaction_ INTEGER NOT NULL REFERENCES Transactions(id),
          store INTEGER NOT NULL REFERENCES Stores(id),
          resource INTEGER NOT NULL REFERENCES Resources(id),
          delta REAL NOT NULL
      )
    """.trimIndent(),
    "INSERT INTO Resources(id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2)",
    "INSERT INTO Stores(id, name, owning) VALUES (1, 'Wallet', 1)",
    "INSERT INTO Stores(id, name, owning) VALUES (2, 'External', 0)",
    "INSERT INTO Assets(id, store, resource, amount) VALUES (1, 1, 1, 42.5)",
    "INSERT INTO Transactions(id, timestamp, description) VALUES (1, 1712366400000, 'Lunch')",
    "INSERT INTO TransactionDeltas(id, transaction_, store, resource, delta) VALUES (1, 1, 1, 1, -12.5)",
    "INSERT INTO TransactionDeltas(id, transaction_, store, resource, delta) VALUES (2, 1, 2, 1, 12.5)",
  )

  private fun version3DatabaseSchemaStatements(): List<String> = listOf(
    """
      CREATE TABLE Resources (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          mantissaLength INTEGER NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE Stores (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          owning INTEGER NOT NULL CHECK (owning == 0 OR owning == 1)
      )
    """.trimIndent(),
    """
      CREATE TABLE Assets (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          store INTEGER NOT NULL REFERENCES Stores(id),
          resource INTEGER NOT NULL REFERENCES Resources(id),
          amount REAL NOT NULL,
          UNIQUE (store, resource)
      )
    """.trimIndent(),
    """
      CREATE TABLE Transactions (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          description TEXT NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE Transfers (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          transaction_ INTEGER NOT NULL REFERENCES Transactions(id),
          storeFrom INTEGER NOT NULL REFERENCES Stores(id),
          storeTo INTEGER NOT NULL REFERENCES Stores(id),
          resource INTEGER NOT NULL REFERENCES Resources(id),
          delta REAL NOT NULL
      )
    """.trimIndent(),
    "INSERT INTO Resources(id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2)",
    "INSERT INTO Stores(id, name, owning) VALUES (1, 'Wallet', 1)",
    "INSERT INTO Stores(id, name, owning) VALUES (2, 'External', 0)",
    "INSERT INTO Assets(id, store, resource, amount) VALUES (1, 1, 1, 42.5)",
    "INSERT INTO Transactions(id, timestamp, description) VALUES (1, 1712366400000, 'Lunch')",
    "INSERT INTO Transfers(id, transaction_, storeFrom, storeTo, resource, delta) VALUES (1, 1, 1, 2, 1, 12.5)",
  )

  private fun version4DatabaseSchemaStatements(): List<String> = version3DatabaseSchemaStatements() + listOf(
    "ALTER TABLE Stores ADD COLUMN archived INTEGER NOT NULL CHECK (owning == 0 OR owning == 1) DEFAULT 0",
  )

  private fun version5DatabaseSchemaStatements(): List<String> = listOf(
    """
      CREATE TABLE Units (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          symbol TEXT NOT NULL,
          mantissaLength INTEGER NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE Stores (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          owning INTEGER NOT NULL CHECK (owning == 0 OR owning == 1),
          archived INTEGER NOT NULL CHECK (archived == 0 OR archived == 1) DEFAULT 0
      )
    """.trimIndent(),
    """
      CREATE TABLE Assets (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          store INTEGER NOT NULL REFERENCES Stores(id),
          unit INTEGER NOT NULL REFERENCES Units(id),
          quantity REAL NOT NULL,
          UNIQUE (store, unit)
      )
    """.trimIndent(),
    """
      CREATE TABLE Transactions (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          description TEXT NOT NULL
      )
    """.trimIndent(),
    """
      CREATE TABLE Transfers (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          transaction_ INTEGER NOT NULL REFERENCES Transactions(id),
          storeFrom INTEGER NOT NULL REFERENCES Stores(id),
          storeTo INTEGER NOT NULL REFERENCES Stores(id),
          unit INTEGER NOT NULL REFERENCES Units(id),
          delta REAL NOT NULL
      )
    """.trimIndent(),
    "INSERT INTO Units(id, name, symbol, mantissaLength) VALUES (1, 'Euro', 'EUR', 2)",
    "INSERT INTO Stores(id, name, owning, archived) VALUES (1, 'Wallet', 1, 0)",
    "INSERT INTO Stores(id, name, owning, archived) VALUES (2, 'External', 0, 0)",
    "INSERT INTO Assets(id, store, unit, quantity) VALUES (1, 1, 1, 42.5)",
    "INSERT INTO Transactions(id, timestamp, description) VALUES (1, 1712366400000, 'Lunch')",
    "INSERT INTO Transfers(id, transaction_, storeFrom, storeTo, unit, delta) VALUES (1, 1, 1, 2, 1, 12.5)",
  )

  private fun execute(driver: SqlDriver, sql: String) {
    driver.execute(null, sql, 0, null)
  }

  private fun queryLong(driver: SqlDriver, sql: String): Long =
    queryValue(driver, sql) { cursor -> cursor.getLong(0) }

  private fun queryDouble(driver: SqlDriver, sql: String): Double =
    queryValue(driver, sql) { cursor -> cursor.getDouble(0) }

  private fun queryString(driver: SqlDriver, sql: String): String? =
    queryOptionalValue(driver, sql) { cursor -> cursor.getString(0) }

  private fun <T> queryValue(driver: SqlDriver, sql: String, read: (SqlCursor) -> T?): T {
    return driver.executeQuery(
      identifier = null,
      sql = sql,
      mapper = { cursor ->
        if (cursor.next().value) {
          QueryResult.Value(read(cursor))
        } else {
          QueryResult.Value(null)
        }
      },
      parameters = 0,
      binders = null,
    ).value ?: error("Query returned no rows: $sql")
  }

  private fun <T> queryOptionalValue(driver: SqlDriver, sql: String, read: (SqlCursor) -> T?): T? {
    return driver.executeQuery(
      identifier = null,
      sql = sql,
      mapper = { cursor ->
        if (cursor.next().value) {
          QueryResult.Value(read(cursor))
        } else {
          QueryResult.Value(null)
        }
      },
      parameters = 0,
      binders = null,
    ).value
  }
}
