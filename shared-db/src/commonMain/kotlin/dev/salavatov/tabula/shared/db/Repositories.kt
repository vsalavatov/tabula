package dev.salavatov.tabula.shared.db

import app.cash.sqldelight.coroutines.asFlow
import app.cash.sqldelight.coroutines.mapToList
import app.cash.sqldelight.coroutines.mapToOne
import app.cash.sqldelight.coroutines.mapToOneOrNull
import dev.salavatov.tabula.shared.core.*
import dev.salavatov.tabula.shared.db.generated.TabulaSharedDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.withContext
import kotlinx.datetime.*
import kotlin.math.absoluteValue
import kotlin.time.Duration.Companion.days

@OptIn(ExperimentalCoroutinesApi::class)
class UnitRepositoryImpl(
  private val databaseFlow: StateFlow<TabulaSharedDatabase?>,
  private val scope: CoroutineScope,
) : UnitRepository {
  private val unitsFlow = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      db.resourcesQueries.getUnits(UnitRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
        .map { records -> records.map { it.toDomainModel() } }
        .catch { emit(emptyList()) }
    }
    .flowOn(Dispatchers.Default)
    .stateIn(scope, SharingStarted.Eagerly, emptyList())

  override fun getUnits(): StateFlow<List<MeasureUnit>> = unitsFlow

  override suspend fun createUnit(name: String, symbol: String, mantissaLength: Int): Long = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.resourcesQueries.createUnit(name, symbol, mantissaLength.toLong())
    db.resourcesQueries.getUnits(UnitRecord::deserialize).executeAsList().lastOrNull { it.name == name && it.symbol == symbol }?.id
      ?: -1L
  }
}

@OptIn(ExperimentalCoroutinesApi::class)
class TransactionRepositoryImpl(
  private val databaseFlow: StateFlow<TabulaSharedDatabase?>,
) : TransactionRepository {
  override fun getTransactions(viewport: Flow<TransactionViewport>): Flow<TransactionWindow> = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      viewport
        .distinctUntilChanged()
        .flatMapLatest { currentViewport ->
          val countFlow = db.transactionsQueries.countTransactions()
            .asFlow()
            .mapToOne(Dispatchers.Default)
          val rowsFlow = db.transactionsQueries.getTransactionsWithDetailsWindow(
            currentViewport.limit.toLong(),
            currentViewport.offset.toLong(),
          )
            .asFlow()
            .mapToList(Dispatchers.Default)
          val previousDateFlow = if (currentViewport.offset > 0) {
            db.transactionsQueries.getTransactionTimestampAtOffset((currentViewport.offset - 1).toLong())
              .asFlow()
              .mapToOneOrNull(Dispatchers.Default)
              .map { timestamp ->
                timestamp
                  ?.let { Instant.fromEpochMilliseconds(it) }
                  ?.toLocalDateTime(TimeZone.currentSystemDefault())
                  ?.date
                  ?.toString()
              }
          } else {
            flowOf(null)
          }
          combine(countFlow, rowsFlow, previousDateFlow) { totalCount, rows, previousDateIso ->
            mapTransactionWindow(rows, currentViewport, totalCount.toInt(), previousDateIso)
          }
        }
        .catch { emit(TransactionWindow()) }
    }
    .flowOn(Dispatchers.Default)

  override suspend fun getTransactionOffset(transactionId: Long): Int = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.transactionsQueries.countTransactionsNewerThan(transactionId).executeAsOne().toInt()
  }

  override suspend fun getLatestTimestampOnDate(date: LocalDate, excludeTransactionId: Long): Instant? = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    val start = date.atTime(LocalTime(0, 0)).toInstant(TimeZone.currentSystemDefault()).toEpochMilliseconds()
    val end = start + 86_400_000L
    db.transactionsQueries.getLatestTimestampOnDate(
      start,
      end,
      excludeTransactionId,
    ).executeAsOne().latest_timestamp?.let(Instant::fromEpochMilliseconds)
  }

  override suspend fun createTransaction(description: String, timestamp: Instant, transfers: List<TransferInput>): Long = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.transactionWithResult {
      db.transactionsQueries.createTransaction(timestamp.toEpochMilliseconds(), description)
      val transaction = db.transactionsQueries.getCreatedTransaction(TransactionRecord::deserialize).executeAsOne()
      transfers.forEach { transfer ->
        db.transfersQueries.createTransfer(transaction.id, transfer.fromAccountId, transfer.toAccountId, transfer.unitId, transfer.quantity)
        db.assetsQueries.applyDelta(transfer.fromAccountId, transfer.unitId, -transfer.quantity)
        db.assetsQueries.applyDelta(transfer.toAccountId, transfer.unitId, transfer.quantity)
      }
      transaction.id
    }
  }

  override suspend fun updateTransaction(id: Long, description: String, timestamp: Instant, transfers: List<TransferInput>) = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.transaction {
      val existingTransfers = db.transfersQueries.forTransaction(id, TransferRecord::deserialize).executeAsList()
      existingTransfers.forEach { transfer ->
        db.assetsQueries.applyDelta(transfer.accountFrom, transfer.unit, transfer.delta)
        db.assetsQueries.applyDelta(transfer.accountTo, transfer.unit, -transfer.delta)
      }
      db.transactionsQueries.deleteTransfersByTransactionId(id)
      db.transactionsQueries.updateTransaction(timestamp.toEpochMilliseconds(), description, id)
      transfers.forEach { transfer ->
        db.transfersQueries.createTransfer(id, transfer.fromAccountId, transfer.toAccountId, transfer.unitId, transfer.quantity)
        db.assetsQueries.applyDelta(transfer.fromAccountId, transfer.unitId, -transfer.quantity)
        db.assetsQueries.applyDelta(transfer.toAccountId, transfer.unitId, transfer.quantity)
      }
    }
  }

  override suspend fun deleteTransaction(id: Long) = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.transaction {
      val existingTransfers = db.transfersQueries.forTransaction(id, TransferRecord::deserialize).executeAsList()
      existingTransfers.forEach { transfer ->
        db.assetsQueries.applyDelta(transfer.accountFrom, transfer.unit, transfer.delta)
        db.assetsQueries.applyDelta(transfer.accountTo, transfer.unit, -transfer.delta)
      }
      db.transactionsQueries.deleteTransfersByTransactionId(id)
      db.transactionsQueries.deleteTransaction(id)
    }
  }

  private fun mapTransactionWindow(
    rows: List<dev.salavatov.tabula.shared.db.generated.GetTransactionsWithDetailsWindow>,
    viewport: TransactionViewport,
    totalCount: Int,
    previousDateIso: String?,
  ): TransactionWindow {
    if (rows.isEmpty()) {
      val normalizedOffset = viewport.offset.coerceAtMost((totalCount - 1).coerceAtLeast(0))
      return TransactionWindow(
        transactions = emptyList(),
        offset = normalizedOffset,
        limit = viewport.limit,
        totalCount = totalCount,
        hasOlder = false,
        hasNewer = normalizedOffset > 0,
        previousDateIso = previousDateIso,
      )
    }
    val transactionMap = linkedMapOf<Long, MutableList<Transfer>>()
    val transactionMeta = linkedMapOf<Long, Pair<String, Long>>()
    for (row in rows) {
      if (!transactionMeta.containsKey(row.transaction_id)) {
        transactionMeta[row.transaction_id] = row.transaction_description to row.transaction_timestamp
      }
      val transfer = Transfer(
        id = row.transfer_id,
        accountFrom = Account(row.account_from_id, row.account_from_name, row.account_from_owning != 0L, row.account_from_archived != 0L),
        accountTo = Account(row.account_to_id, row.account_to_name, row.account_to_owning != 0L, row.account_to_archived != 0L),
        unit = MeasureUnit(row.unit_id, row.unit_name, row.unit_symbol, row.unit_mantissa_length.toInt()),
        quantity = row.transfer_delta,
      )
      transactionMap.getOrPut(row.transaction_id) { mutableListOf() }.add(transfer)
    }
    val transactions = transactionMeta.mapNotNull { (transactionId, meta) ->
      val transfers = transactionMap[transactionId] ?: return@mapNotNull null
      Transaction(transactionId, meta.first, Instant.fromEpochMilliseconds(meta.second), transfers)
    }
    val normalizedOffset = viewport.offset.coerceAtMost((totalCount - 1).coerceAtLeast(0))
    return TransactionWindow(
      transactions = transactions,
      offset = normalizedOffset,
      limit = viewport.limit,
      totalCount = totalCount,
      hasOlder = normalizedOffset + transactions.size < totalCount,
      hasNewer = normalizedOffset > 0,
      previousDateIso = previousDateIso,
    )
  }
}

@OptIn(ExperimentalCoroutinesApi::class)
class AccountRepositoryImpl(
  private val databaseFlow: StateFlow<TabulaSharedDatabase?>,
) : AccountRepository {
  override fun getActiveAccounts(): Flow<List<Account>> = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      db.storesQueries.getActualStores(AccountRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
        .map { records -> records.map { it.toDomainModel() } }
        .catch { emit(emptyList()) }
    }
    .flowOn(Dispatchers.Default)

  override fun getAccountDetails(showArchived: Boolean): Flow<List<dev.salavatov.tabula.shared.core.EditableAccount>> = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      val accountsFlow = if (showArchived) {
        db.storesQueries.getAllStores(AccountRecord::deserialize)
      } else {
        db.storesQueries.getActualStores(AccountRecord::deserialize)
      }
        .asFlow()
        .mapToList(Dispatchers.Default)
      val assetsFlow = db.assetsQueries.getAllAssets(AssetRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
      val unitsFlow = db.resourcesQueries.getUnits(UnitRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
      combine(accountsFlow, assetsFlow, unitsFlow) { accounts, assets, units ->
        accounts.toEditableAccounts(assets, units)
      }
        .catch { emit(emptyList()) }
    }
    .flowOn(Dispatchers.Default)

  override suspend fun createAccount(name: String, owning: Boolean): Long = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.storesQueries.createStore(name, if (owning) 1L else 0L)
    db.storesQueries.getAllStores(AccountRecord::deserialize).executeAsList().lastOrNull()?.id ?: -1L
  }

  override suspend fun updateAccount(id: Long, name: String, owning: Boolean, archived: Boolean) = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.storesQueries.updateStore(name, if (owning) 1L else 0L, if (archived) 1L else 0L, id)
  }

  override suspend fun checkConsistency(): ConsistencyCheckResult = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    val accounts = db.storesQueries.getAllStores(AccountRecord::deserialize).executeAsList()
    val inconsistencies = accounts.flatMap { account ->
      db.assetsQueries.forStore(account.id, AssetRecord::deserialize).executeAsList().mapNotNull { asset ->
        val total = db.assetsQueries.calculateQuantityFromTransactionLog(asset.account, asset.unit).executeAsOne().total ?: return@mapNotNull null
        val diff = total - asset.quantity
        if (diff.absoluteValue > 1e-8) {
          val unit = db.resourcesQueries.getUnit(asset.unit, UnitRecord::deserialize).executeAsOne()
          Inconsistency("${account.name}/${unit.name}", diff)
        } else {
          null
        }
      }
    }
    ConsistencyCheckResult(inconsistencies)
  }

  override suspend fun isArchivingAllowed(accountId: Long): Boolean = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    db.assetsQueries.forStore(accountId, AssetRecord::deserialize).executeAsList().all { it.quantity.isNegligible() }
  }
}

@OptIn(ExperimentalCoroutinesApi::class)
class AnalyticsRepositoryImpl(
  private val databaseFlow: StateFlow<TabulaSharedDatabase?>,
) : AnalyticsRepository {
  override fun observeAccounts(): Flow<List<Account>> = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      db.storesQueries.getActualStores(AccountRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
        .map { records -> records.map { it.toDomainModel() } }
    }
    .flowOn(Dispatchers.Default)

  override fun observeUnits(): Flow<List<MeasureUnit>> = databaseFlow
    .filterNotNull()
    .flatMapLatest { db ->
      db.resourcesQueries.getUnits(UnitRecord::deserialize)
        .asFlow()
        .mapToList(Dispatchers.Default)
        .map { records -> records.map { it.toDomainModel() } }
    }
    .flowOn(Dispatchers.Default)

  override suspend fun loadBalanceData(accountId: Long, unitId: Long, timeRange: AnalyticsTimeRange): List<BalancePoint> = withContext(Dispatchers.Default) {
    val db = databaseFlow.value ?: error("Database is not available")
    val currentTime = Clock.System.now()
    val transactions = db.transactionsQueries.getTransactions(TransactionRecord::deserialize).executeAsList().sortedBy { it.timestamp }
      .filter { transaction ->
        val days = timeRange.days ?: return@filter true
        transaction.timestamp >= currentTime - days.days
      }
    if (transactions.isEmpty()) return@withContext emptyList()
    val startTime = if (timeRange.days != null) {
      currentTime - timeRange.days!!.days
    } else {
      transactions.first().timestamp
    }
    val currentAsset = db.assetsQueries.forStore(accountId, AssetRecord::deserialize).executeAsList().find { it.unit == unitId }
    var runningBalance = currentAsset?.quantity ?: 0.0
    val balanceMap = linkedMapOf<Instant, Double>()
    balanceMap[currentTime] = runningBalance
    val relevantTransfers = transactions.flatMap { transaction ->
      db.transfersQueries.forTransaction(transaction.id, TransferRecord::deserialize).executeAsList()
        .filter { transfer -> (transfer.accountFrom == accountId || transfer.accountTo == accountId) && transfer.unit == unitId }
        .map { transaction.timestamp to it }
    }.sortedByDescending { it.first }
    relevantTransfers.forEach { (timestamp, transfer) ->
      when {
        transfer.accountFrom == accountId -> runningBalance += transfer.delta
        transfer.accountTo == accountId -> runningBalance -= transfer.delta
      }
      balanceMap[timestamp] = runningBalance
    }
    fillDataPoints(balanceMap.entries.sortedBy { it.key }.map { BalancePoint(it.key, it.value) }, startTime, currentTime)
  }

  private fun fillDataPoints(balancePoints: List<BalancePoint>, startTime: Instant, endTime: Instant): List<BalancePoint> {
    if (balancePoints.isEmpty()) return emptyList()
    val pointsByDay = linkedMapOf<String, BalancePoint>()
    balancePoints.forEach { point ->
      val dayKey = point.date.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
      pointsByDay[dayKey] = point
    }
    val startDay = startTime.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
    val endDay = endTime.toLocalDateTime(TimeZone.currentSystemDefault()).date.toString()
    val result = mutableListOf<BalancePoint>()
    if (!pointsByDay.containsKey(startDay)) {
      result.add(BalancePoint(startTime, balancePoints.first().balance))
    }
    result.addAll(pointsByDay.values)
    if (!pointsByDay.containsKey(endDay)) {
      result.add(BalancePoint(endTime, balancePoints.last().balance))
    }
    return result
  }
}
