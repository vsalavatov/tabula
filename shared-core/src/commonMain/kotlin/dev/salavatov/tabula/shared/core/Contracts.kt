package dev.salavatov.tabula.shared.core

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow

interface TransactionRepository {
  fun getTransactions(viewport: Flow<TransactionViewport>): Flow<TransactionWindow>
  suspend fun getTransactionOffset(transactionId: Long): Int
  suspend fun getLatestTimestampOnDate(
    date: kotlinx.datetime.LocalDate,
    excludeTransactionId: Long = -1L,
  ): kotlinx.datetime.Instant?
  suspend fun createTransaction(description: String, timestamp: kotlinx.datetime.Instant, transfers: List<TransferInput>): Long
  suspend fun updateTransaction(id: Long, description: String, timestamp: kotlinx.datetime.Instant, transfers: List<TransferInput>)
  suspend fun deleteTransaction(id: Long)
}

interface UnitRepository {
  fun getUnits(): StateFlow<List<MeasureUnit>>
  suspend fun createUnit(name: String, symbol: String, mantissaLength: Int): Long
}

interface AccountRepository {
  fun getActiveAccounts(): Flow<List<Account>>
  fun getAccountDetails(showArchived: Boolean): Flow<List<EditableAccount>>
  suspend fun createAccount(name: String, inPossession: Boolean): Long
  suspend fun updateAccount(id: Long, name: String, inPossession: Boolean, archived: Boolean)
  suspend fun checkConsistency(): ConsistencyCheckResult
  suspend fun isArchivingAllowed(accountId: Long): Boolean
}

interface AnalyticsRepository {
  fun observeAccounts(): Flow<List<Account>>
  fun observeUnits(): Flow<List<MeasureUnit>>
  suspend fun loadBalanceData(accountId: Long, unitId: Long, timeRange: AnalyticsTimeRange): List<BalancePoint>
}

interface BackupManager {
  val isSignedIn: StateFlow<Boolean>
  val accountLabel: StateFlow<String?>
  suspend fun signIn()
  suspend fun listBackups(): List<BackupFileInfo>
  suspend fun uploadBackup(): BackupFileInfo
  suspend fun restoreBackup(fileId: String)
  suspend fun downloadBackup(fileId: String)
  suspend fun deleteBackup(fileId: String)
}

interface SettingsManager {
  val themeMode: StateFlow<ThemeMode>
  suspend fun setThemeMode(mode: ThemeMode)
}
