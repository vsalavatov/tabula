package dev.salavatov.tabula.shared.db

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import dev.salavatov.tabula.shared.core.Account
import dev.salavatov.tabula.shared.core.AccountAssetInfo
import dev.salavatov.tabula.shared.core.EditableAccount
import dev.salavatov.tabula.shared.core.MeasureUnit
import dev.salavatov.tabula.shared.db.generated.TabulaSharedDatabase
import kotlinx.datetime.Instant
import kotlin.math.absoluteValue
import kotlin.math.pow

data class TransactionRecord(val id: Long, val timestamp: Instant, val description: String) {
  companion object {
    fun deserialize(id: Long, timestamp: Long, description: String): TransactionRecord =
      TransactionRecord(id, Instant.fromEpochMilliseconds(timestamp), description)
  }
}

data class TransferRecord(
  val id: Long,
  val transaction: Long,
  val accountFrom: Long,
  val accountTo: Long,
  val unit: Long,
  val delta: Double,
) {
  companion object {
    fun deserialize(id: Long, transaction: Long, accountFrom: Long, accountTo: Long, unit: Long, delta: Double): TransferRecord =
      TransferRecord(id, transaction, accountFrom, accountTo, unit, delta)
  }
}

data class AccountRecord(val id: Long, val name: String, val owning: Boolean, val archived: Boolean) {
  companion object {
    fun deserialize(id: Long, name: String, owning: Long, archived: Long): AccountRecord =
      AccountRecord(id, name, owning != 0L, archived != 0L)
  }
}

data class UnitRecord(val id: Long, val name: String, val symbol: String, val mantissaLength: Int) {
  companion object {
    fun deserialize(id: Long, name: String, symbol: String, mantissaLength: Long): UnitRecord =
      UnitRecord(id, name, symbol, mantissaLength.toInt())
  }
}

data class AssetRecord(val id: Long, val account: Long, val unit: Long, val quantity: Double) {
  companion object {
    fun deserialize(id: Long, account: Long, unit: Long, quantity: Double): AssetRecord =
      AssetRecord(id, account, unit, quantity)
  }
}

fun AccountRecord.toDomainModel() = Account(id = id, name = name, owning = owning, isArchived = archived)

fun UnitRecord.toDomainModel() = MeasureUnit(id = id, name = name, symbol = symbol, mantissaLength = mantissaLength)

fun createDatabase(driver: SqlDriver): TabulaSharedDatabase = DbMigrations(driver).prepareDatabase()

class DbMigrations(private val driver: SqlDriver) {
  fun prepareDatabase(): TabulaSharedDatabase {
    val currentVersion = version
    val schemaVersion = TabulaSharedDatabase.Schema.version
    if (currentVersion == 0L) {
      TabulaSharedDatabase.Schema.create(driver)
      version = schemaVersion
    } else {
      if (schemaVersion > currentVersion) {
        TabulaSharedDatabase.Schema.migrate(driver, currentVersion, schemaVersion)
        version = schemaVersion
      }
    }
    return TabulaSharedDatabase(driver)
  }

  private var version: Long
    get() = runCatching {
      driver.executeQuery(
        null,
        "PRAGMA user_version;",
        {
          if (it.next().value) {
            QueryResult.Value(it.getLong(0) ?: 0L)
          } else {
            QueryResult.Value(0L)
          }
        },
        0,
        null,
      ).value
    }.getOrDefault(0L)
    set(value) {
      driver.execute(null, "PRAGMA user_version = $value;", 0, null)
    }
}

internal fun formatAmount(value: Double, decimals: Int): String {
  val scale = 10.0.pow(decimals)
  val rounded = kotlin.math.round(value * scale) / scale
  val text = rounded.toString()
  if (!text.contains('.')) return if (decimals == 0) text else "$text." + "0".repeat(decimals)
  val actualDecimals = text.substringAfter('.').length
  return if (actualDecimals >= decimals) text else text + "0".repeat(decimals - actualDecimals)
}

internal fun Double.isNegligible(): Boolean = absoluteValue < 1e-7

internal fun List<AccountRecord>.toEditableAccounts(db: TabulaSharedDatabase): List<EditableAccount> {
  return map { account ->
    val assets = db.assetsQueries.forStore(account.id, AssetRecord::deserialize).executeAsList()
      .filter { !it.quantity.isNegligible() }
      .map { asset ->
        val unit = db.resourcesQueries.getUnit(asset.unit, UnitRecord::deserialize).executeAsOne().toDomainModel()
        AccountAssetInfo(
          unitId = unit.id,
          unitName = unit.name,
          repr = "${formatAmount(asset.quantity, unit.mantissaLength)} ${unit.symbol}",
        )
      }
    EditableAccount(
      account = account.toDomainModel(),
      assets = assets,
      nameInput = account.name,
      owningInput = account.owning,
      archivedInput = account.archived,
    )
  }
}

internal fun List<AccountRecord>.toEditableAccounts(
  assets: List<AssetRecord>,
  units: List<UnitRecord>,
): List<EditableAccount> {
  val unitsById = units.associateBy { it.id }
  val assetsByAccountId = assets.groupBy { it.account }
  return map { account ->
    val visibleAssets = assetsByAccountId[account.id].orEmpty()
      .filter { !it.quantity.isNegligible() }
      .mapNotNull { asset ->
        val unit = unitsById[asset.unit] ?: return@mapNotNull null
        AccountAssetInfo(
          unitId = unit.id,
          unitName = unit.name,
          repr = "${formatAmount(asset.quantity, unit.mantissaLength)} ${unit.symbol}",
        )
      }
    EditableAccount(
      account = account.toDomainModel(),
      assets = visibleAssets,
      nameInput = account.name,
      owningInput = account.owning,
      archivedInput = account.archived,
    )
  }
}
