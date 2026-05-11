package dev.salavatov.tabula.shared.db

import app.cash.sqldelight.db.SqlDriver
import dev.salavatov.tabula.shared.db.generated.TabulaSharedDatabase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class BrowserDatabaseSession {
  private var driver: SqlJsDriver? = null
  private val _database = MutableStateFlow<TabulaSharedDatabase?>(null)
  val database: StateFlow<TabulaSharedDatabase?> = _database.asStateFlow()

  suspend fun open(bytes: ByteArray? = null) {
    close()
    driver = SqlJsDriver.open(bytes)
    _database.value = createDatabase(driver as SqlDriver)
  }

  suspend fun reconnect(bytes: ByteArray? = null) {
    val snapshot = bytes ?: exportBytes()
    open(snapshot)
  }

  fun exportBytes(): ByteArray = driver?.exportBytes() ?: ByteArray(0)

  fun close() {
    _database.value = null
    driver?.close()
    driver = null
  }
}
