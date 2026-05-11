package dev.salavatov.tabula.shared.core

import kotlinx.datetime.*
import kotlinx.serialization.Serializable
import kotlin.math.abs
import kotlin.math.pow
import kotlin.math.round

@Serializable
data class Transaction(
  val id: Long,
  val description: String,
  val timestamp: Instant,
  val transfers: List<Transfer>,
)

data class TransactionWindow(
  val transactions: List<Transaction> = emptyList(),
  val offset: Int = 0,
  val limit: Int = 0,
  val totalCount: Int = 0,
  val hasOlder: Boolean = false,
  val hasNewer: Boolean = false,
  val previousDateIso: String? = null,
)

@Serializable
data class TransactionViewport(
  val offset: Int = 0,
  val limit: Int = 0,
)

@Serializable
data class Transfer(
  val id: Long,
  val accountFrom: Account,
  val accountTo: Account,
  val unit: MeasureUnit,
  val quantity: Double,
)

@Serializable
data class Account(
  val id: Long,
  val name: String,
  val owning: Boolean,
  val isArchived: Boolean = false,
)

@Serializable
data class MeasureUnit(
  val id: Long,
  val name: String,
  val symbol: String,
  val mantissaLength: Int,
)

fun MeasureUnit.represent(quantity: Double): String = "${formatQuantity(quantity, mantissaLength)} $symbol"

@Serializable
data class BackupFileInfo(
  val id: String,
  val name: String,
)

@Serializable
enum class ThemeMode {
  LIGHT,
  DARK,
  SYSTEM,
}

@Serializable
data class TransferInput(
  val fromAccountId: Long,
  val toAccountId: Long,
  val unitId: Long,
  val quantity: Double,
)

@Serializable
enum class TransactionDraftMode {
  NEW,
  EDIT_EXISTING,
}

@Serializable
enum class TransactionField {
  DATE,
  DESCRIPTION,
  FROM_ACCOUNT,
  QUANTITY,
  UNIT,
  TO_ACCOUNT,
}

@Serializable
data class RegisterFocusTarget(
  val field: TransactionField = TransactionField.DATE,
  val transferRowIndex: Int = 0,
  val sequence: Long = 0,
)

@Serializable
data class TransferDraftState(
  val fromAccountId: Long? = null,
  val fromAccountError: Boolean = false,
  val quantity: Double? = null,
  val quantityInput: String = "",
  val quantityError: Boolean = false,
  val unitId: Long? = null,
  val unitError: Boolean = false,
  val toAccountId: Long? = null,
  val toAccountError: Boolean = false,
)

@Serializable
data class TransactionDraftState(
  val mode: TransactionDraftMode = TransactionDraftMode.NEW,
  val transactionId: Long? = null,
  val dateInput: String = currentDraftDateInput(),
  val selectedDateIso: String = currentDraftDateIso(),
  val dateError: Boolean = false,
  val description: String = "",
  val descriptionError: Boolean = false,
  val transfers: List<TransferDraftState> = listOf(TransferDraftState()),
  val focusTarget: RegisterFocusTarget? = RegisterFocusTarget(),
)

@Serializable
sealed interface TransactionListItem {
  @Serializable
  data class DateHeader(
    val dateIso: String,
    val label: String,
  ) : TransactionListItem

  @Serializable
  data class TransactionItem(
    val transaction: Transaction,
    val isEditing: Boolean = false,
  ) : TransactionListItem
}

@Serializable
data class TransactionUiState(
  val visibleTransactions: List<Transaction> = emptyList(),
  val groupedTransactions: List<TransactionListItem> = emptyList(),
  val viewportOffset: Int = 0,
  val viewportLimit: Int = 0,
  val totalTransactionCount: Int = 0,
  val hasOlderTransactions: Boolean = false,
  val hasNewerTransactions: Boolean = false,
  val previousDateIso: String? = null,
  val canLoadMore: Boolean = false,
  val accounts: List<Account> = emptyList(),
  val units: List<MeasureUnit> = emptyList(),
  val draft: TransactionDraftState = TransactionDraftState(),
  val activeEditingTransactionId: Long? = null,
  val revealTransaction: TransactionRevealState? = null,
  val isLoading: Boolean = false,
  val error: String? = null,
)

@Serializable
data class TransactionRevealState(
  val transactionId: Long,
  val sequence: Long,
)

@Serializable
data class UnitFormState(
  val name: String = "",
  val symbol: String = "",
  val mantissaLength: Int? = null,
  val mantissaLengthInput: String = "",
  val nameError: Boolean = false,
  val symbolError: Boolean = false,
  val mantissaError: Boolean = false,
)

@Serializable
data class UnitUiState(
  val units: List<MeasureUnit> = emptyList(),
  val form: UnitFormState = UnitFormState(),
  val isLoading: Boolean = false,
  val error: String? = null,
)

@Serializable
data class AccountAssetInfo(
  val unitId: Long,
  val unitName: String,
  val repr: String,
)

@Serializable
data class EditableAccount(
  val account: Account,
  val assets: List<AccountAssetInfo> = emptyList(),
  val editMode: Boolean = false,
  val nameInput: String = account.name,
  val owningInput: Boolean = account.owning,
  val archivedInput: Boolean = account.isArchived,
  val showArchivedError: Boolean = false,
)

@Serializable
data class Inconsistency(
  val assetDesc: String,
  val diff: Double,
)

@Serializable
data class ConsistencyCheckResult(
  val inconsistencies: List<Inconsistency> = emptyList(),
)

@Serializable
data class AccountFormState(
  val name: String = "",
  val owning: Boolean = true,
)

@Serializable
data class AccountUiState(
  val accounts: List<EditableAccount> = emptyList(),
  val form: AccountFormState = AccountFormState(),
  val showArchived: Boolean = false,
  val isLoading: Boolean = false,
  val consistencyResult: ConsistencyCheckResult? = null,
  val error: String? = null,
)

@Serializable
enum class AnalyticsTimeRange(val days: Int?) {
  LAST_WEEK(7),
  LAST_MONTH(30),
  LAST_THREE_MONTHS(90),
  LAST_SIX_MONTHS(180),
  LAST_YEAR(365),
  ALL_TIME(null),
}

@Serializable
data class BalancePoint(
  val date: Instant,
  val balance: Double,
)

@Serializable
data class AnalyticsUiState(
  val accounts: List<Account> = emptyList(),
  val units: List<MeasureUnit> = emptyList(),
  val selectedAccountId: Long? = null,
  val selectedUnitId: Long? = null,
  val timeRange: AnalyticsTimeRange = AnalyticsTimeRange.LAST_MONTH,
  val balanceData: List<BalancePoint> = emptyList(),
  val isLoading: Boolean = false,
  val error: String? = null,
)

@Serializable
data class SyncUiState(
  val isSignedIn: Boolean = false,
  val accountLabel: String? = null,
  val backupFiles: List<BackupFileInfo> = emptyList(),
  val isLoading: Boolean = false,
  val error: String? = null,
  val restoreStatus: Map<String, String> = emptyMap(),
)

@Serializable
data class SettingsUiState(
  val themeMode: ThemeMode = ThemeMode.SYSTEM,
)

@Serializable
data class AppSnapshot(
  val transactions: TransactionUiState = TransactionUiState(),
  val units: UnitUiState = UnitUiState(),
  val accounts: AccountUiState = AccountUiState(),
  val analytics: AnalyticsUiState = AnalyticsUiState(),
  val sync: SyncUiState = SyncUiState(),
  val settings: SettingsUiState = SettingsUiState(),
)

private fun currentDraftDateIso(): String = Clock.System.now()
  .toLocalDateTime(TimeZone.currentSystemDefault())
  .date
  .toString()

private fun currentDraftDateInput(): String = formatDraftDateInput(
  Clock.System.now()
    .toLocalDateTime(TimeZone.currentSystemDefault())
    .date,
)

fun formatDraftDateInput(date: LocalDate): String = buildString {
  append(date.dayOfMonth.toString().padStart(2, '0'))
  append('-')
  append(date.monthNumber.toString().padStart(2, '0'))
  append('-')
  append(date.year.toString().padStart(4, '0'))
}

private fun formatQuantity(value: Double, decimals: Int): String {
  val scale = 10.0.pow(decimals)
  val rounded = round(value * scale) / scale
  var text = if (abs(rounded) < 1e-9) "0" else rounded.toString()
  if (decimals == 0) {
    return text.substringBefore('.')
  }
  if (!text.contains('.')) {
    text += "."
  }
  val actualDecimals = text.substringAfter('.').length
  return if (actualDecimals >= decimals) text else text + "0".repeat(decimals - actualDecimals)
}
