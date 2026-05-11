package dev.salavatov.tabula.shared.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.datetime.*

class TransactionPresenter(
  private val transactionRepository: TransactionRepository,
  private val accountRepository: AccountRepository,
  private val unitRepository: UnitRepository,
  private val scope: CoroutineScope,
) {
  private val transactionsCache = MutableStateFlow<List<Transaction>>(emptyList())
  private val transactionViewport = MutableStateFlow(
    TransactionViewport(
      offset = 0,
      limit = INITIAL_VISIBLE_TRANSACTION_LIMIT,
    ),
  )
  private val _state = MutableStateFlow(TransactionUiState(isLoading = true))
  val state: StateFlow<TransactionUiState> = _state.asStateFlow()
  private var focusSequence = 0L
  private var revealSequence = 0L
  private var sessionDefaults: SessionDefaults? = null
  private var pendingRevealTransactionId: Long? = null

  init {
    scope.launch {
      combine(
        transactionRepository.getTransactions(transactionViewport).distinctUntilChanged(),
        accountRepository.getActiveAccounts(),
        unitRepository.getUnits(),
      ) { transactionWindow, accounts, units ->
        Triple(transactionWindow, accounts, units)
      }.collectLatest { (transactionWindow, accounts, units) ->
        val transactions = transactionWindow.transactions
        if (transactions.isEmpty() && transactionWindow.totalCount > 0 && transactionWindow.offset > 0) {
          transactionViewport.update { viewport ->
            viewport.copy(offset = (transactionWindow.totalCount - viewport.limit).coerceAtLeast(0))
          }
          return@collectLatest
        }
        transactionsCache.value = transactions
        val pendingRevealId = pendingRevealTransactionId
        val shouldRevealTransaction = pendingRevealId != null && transactions.any { it.id == pendingRevealId }
        _state.update { current ->
          val editingId = current.activeEditingTransactionId
          val nextDraft = when {
            editingId != null && transactions.none { it.id == editingId } -> buildNewDraft()
            editingId == null && current.groupedTransactions.isEmpty() && current.draft.mode == TransactionDraftMode.NEW ->
              buildNewDraft(focusTarget = current.draft.focusTarget ?: nextFocus(TransactionField.DATE))
            else -> current.draft
          }
          current.copy(
            visibleTransactions = transactions,
            groupedTransactions = groupTransactionsByDate(transactions, editingId, transactionWindow.previousDateIso),
            viewportOffset = transactionWindow.offset,
            viewportLimit = transactionWindow.limit,
            totalTransactionCount = transactionWindow.totalCount,
            hasOlderTransactions = transactionWindow.hasOlder,
            hasNewerTransactions = transactionWindow.hasNewer,
            previousDateIso = transactionWindow.previousDateIso,
            canLoadMore = transactionWindow.hasOlder,
            accounts = accounts,
            units = units,
            draft = nextDraft,
            activeEditingTransactionId = editingId.takeIf { id -> transactions.any { it.id == id } },
            revealTransaction = if (shouldRevealTransaction && pendingRevealId != null) {
              TransactionRevealState(
                transactionId = pendingRevealId,
                sequence = nextRevealSequence(),
              )
            } else {
              current.revealTransaction
            },
            isLoading = false,
          )
        }
        if (shouldRevealTransaction) {
          pendingRevealTransactionId = null
        }
      }
    }
  }

  fun loadOlderTransactions() {
    shiftViewport(VISIBLE_TRANSACTION_PAGE_SIZE)
  }

  fun loadNewerTransactions() {
    shiftViewport(-VISIBLE_TRANSACTION_PAGE_SIZE)
  }

  fun beginNewEntry() {
    _state.update {
      it.copy(
        draft = buildNewDraft(),
        groupedTransactions = groupTransactionsByDate(transactionsCache.value, null, _state.value.previousDateIso),
        activeEditingTransactionId = null,
        error = null,
      )
    }
  }

  fun cancelEditing() {
    beginNewEntry()
  }

  fun beginEditingTransaction(transactionId: Long) {
    val transaction = transactionsCache.value.firstOrNull { it.id == transactionId } ?: return
    _state.update {
      it.copy(
        draft = buildEditingDraft(transaction),
        groupedTransactions = groupTransactionsByDate(transactionsCache.value, transaction.id, _state.value.previousDateIso),
        activeEditingTransactionId = transaction.id,
        error = null,
      )
    }
  }

  fun updateDescription(description: String) {
    updateDraft { draft ->
      draft.copy(description = description, descriptionError = false)
    }
  }

  fun updateDateInput(dateInput: String) {
    updateDraft { draft ->
      val parsed = parseDateInput(dateInput)
      draft.copy(
        dateInput = dateInput,
        selectedDateIso = parsed?.toString() ?: draft.selectedDateIso,
        dateError = dateInput.isNotBlank() && parsed == null,
      )
    }
  }

  fun stepDate(days: Int) {
    updateDraft { draft ->
      val baseDate = parseDateInput(draft.dateInput)
        ?: runCatching { LocalDate.parse(draft.selectedDateIso) }.getOrNull()
        ?: currentDate()
      val nextDate = baseDate.plus(DatePeriod(days = days))
      draft.copy(
        dateInput = formatDraftDateInput(nextDate),
        selectedDateIso = nextDate.toString(),
        dateError = false,
        focusTarget = nextFocus(TransactionField.DATE),
      )
    }
  }

  fun updateTransferFromAccount(index: Int, accountId: Long?) {
    updateTransfer(index) {
      it.copy(fromAccountId = accountId, fromAccountError = false)
    }
  }

  fun updateTransferQuantity(index: Int, quantityStr: String) {
    val parsed = quantityStr.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()
    updateTransfer(index) {
      it.copy(
        quantity = parsed,
        quantityInput = quantityStr,
        quantityError = quantityStr.isNotBlank() && parsed == null,
      )
    }
  }

  fun updateTransferUnit(index: Int, unitId: Long?) {
    updateTransfer(index) {
      it.copy(unitId = unitId, unitError = false)
    }
  }

  fun updateTransferToAccount(index: Int, accountId: Long?) {
    updateTransfer(index) {
      it.copy(toAccountId = accountId, toAccountError = false)
    }
  }

  fun addTransferRow() {
    _state.update { state ->
      val nextIndex = state.draft.transfers.size
      state.copy(
        draft = state.draft.copy(
          transfers = state.draft.transfers + TransferDraftState(),
          focusTarget = nextFocus(TransactionField.FROM_ACCOUNT, nextIndex),
        ),
        error = null,
      )
    }
  }

  fun removeTransferRow(index: Int) {
    _state.update { state ->
      val updatedTransfers = state.draft.transfers.filterIndexed { i, _ -> i != index }.ifEmpty { listOf(TransferDraftState()) }
      state.copy(
        draft = state.draft.copy(transfers = updatedTransfers),
        error = null,
      )
    }
  }

  fun deleteTransaction(transactionId: Long) {
    scope.launch {
      runCatching {
        transactionRepository.deleteTransaction(transactionId)
        _state.update { state ->
          state.copy(
            activeEditingTransactionId = state.activeEditingTransactionId.takeUnless { it == transactionId },
            error = null,
          )
        }
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to delete transaction: ${error.message}") }
      }
    }
  }

  fun commitDraft(onSuccess: suspend () -> Unit = {}) {
    val snapshot = _state.value
    val validation = validateDraft(snapshot.draft)
    if (!validation.isValid) {
      _state.update { state ->
        state.copy(
          draft = validation.draft.copy(focusTarget = validation.focusTarget),
          error = validation.error,
        )
      }
      return
    }
    scope.launch {
      runCatching {
        val draft = validation.draft
        val parsedDate = LocalDate.parse(draft.selectedDateIso)
        val existingTransaction = draft.transactionId?.let { id -> transactionsCache.value.firstOrNull { it.id == id } }
        val transfers = draft.transfers.mapNotNull {
          val fromAccountId = it.fromAccountId ?: return@mapNotNull null
          val toAccountId = it.toAccountId ?: return@mapNotNull null
          val unitId = it.unitId ?: return@mapNotNull null
          val quantity = it.quantity ?: return@mapNotNull null
          TransferInput(fromAccountId, toAccountId, unitId, quantity)
        }
        val timestamp = resolveTimestamp(parsedDate, existingTransaction)
        if (draft.transactionId == null) {
          val createdId = transactionRepository.createTransaction(draft.description, timestamp, transfers)
          updateSessionDefaults(parsedDate, draft.transfers.lastOrNull() ?: TransferDraftState())
          transactionViewport.value = transactionViewport.value.centerAround(
            offset = transactionRepository.getTransactionOffset(createdId),
            totalCount = (_state.value.totalTransactionCount + 1).coerceAtLeast(1),
          )
          pendingRevealTransactionId = createdId
        } else {
          transactionRepository.updateTransaction(draft.transactionId, draft.description, timestamp, transfers)
        }
        _state.update {
          it.copy(
            draft = buildNewDraft(),
            activeEditingTransactionId = null,
            error = null,
          )
        }
        onSuccess()
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to save transaction: ${error.message}") }
      }
    }
  }

  private fun updateDraft(transform: (TransactionDraftState) -> TransactionDraftState) {
    _state.update { state ->
      state.copy(draft = transform(state.draft), error = null)
    }
  }

  private fun updateTransfer(index: Int, transform: (TransferDraftState) -> TransferDraftState) {
    _state.update { state ->
      val transfers = state.draft.transfers.toMutableList()
      if (index !in transfers.indices) {
        return@update state
      }
      transfers[index] = transform(transfers[index])
      state.copy(
        draft = state.draft.copy(transfers = transfers),
        error = null,
      )
    }
  }

  private fun buildNewDraft(
    selectedDate: LocalDate = nextNewEntryDate(),
    seedTransfer: TransferDraftState = nextNewEntryTransferDefaults(),
    focusTarget: RegisterFocusTarget = nextFocus(TransactionField.DATE),
  ): TransactionDraftState {
    return TransactionDraftState(
      mode = TransactionDraftMode.NEW,
      transactionId = null,
      dateInput = formatDraftDateInput(selectedDate),
      selectedDateIso = selectedDate.toString(),
      description = "",
      descriptionError = false,
      transfers = listOf(
        normalizeTransferSeed(seedTransfer),
      ),
      focusTarget = focusTarget,
    )
  }

  private fun buildEditingDraft(transaction: Transaction): TransactionDraftState {
    val localDate = transaction.timestamp.toLocalDateTime(TimeZone.currentSystemDefault()).date
    return TransactionDraftState(
      mode = TransactionDraftMode.EDIT_EXISTING,
      transactionId = transaction.id,
      dateInput = formatDraftDateInput(localDate),
      selectedDateIso = localDate.toString(),
      description = transaction.description,
      transfers = transaction.transfers.map(::toTransferDraft),
      focusTarget = nextFocus(TransactionField.DATE),
    )
  }

  private fun toTransferDraft(transfer: Transfer): TransferDraftState {
    return TransferDraftState(
      fromAccountId = transfer.accountFrom.id,
      quantity = transfer.quantity,
      quantityInput = transfer.quantity.toString(),
      unitId = transfer.unit.id,
      toAccountId = transfer.accountTo.id,
    )
  }

  private fun nextNewEntryDate(): LocalDate {
    return sessionDefaults?.date ?: currentDate()
  }

  private fun nextNewEntryTransferDefaults(): TransferDraftState {
    return sessionDefaults?.transfer ?: latestTransferDefaults()
  }

  private fun latestTransferDefaults(): TransferDraftState {
    val lastTransfer = transactionsCache.value.firstOrNull()?.transfers?.lastOrNull() ?: return TransferDraftState()
    return normalizeTransferSeed(toTransferDraft(lastTransfer))
  }

  private fun normalizeTransferSeed(transfer: TransferDraftState): TransferDraftState {
    return transfer.copy(
      quantity = null,
      quantityInput = "",
      fromAccountError = false,
      quantityError = false,
      unitError = false,
      toAccountError = false,
    )
  }

  private fun updateSessionDefaults(date: LocalDate, transfer: TransferDraftState) {
    sessionDefaults = SessionDefaults(
      date = date,
      transfer = normalizeTransferSeed(transfer),
    )
  }

  private fun currentDate(): LocalDate {
    return Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
  }

  private fun parseDateInput(dateInput: String): LocalDate? {
    val parts = dateInput.trim().split('-')
    if (parts.size != 3) return null
    val day = parts[0].toIntOrNull() ?: return null
    val month = parts[1].toIntOrNull() ?: return null
    val year = parts[2].toIntOrNull() ?: return null
    return runCatching { LocalDate(year, month, day) }.getOrNull()
  }

  private suspend fun resolveTimestamp(
    selectedDate: LocalDate,
    existingTransaction: Transaction?,
  ): Instant {
    val existingDate = existingTransaction
      ?.timestamp
      ?.toLocalDateTime(TimeZone.currentSystemDefault())
      ?.date
    if (existingDate == selectedDate) {
      return existingTransaction.timestamp
    }
    val latestOnDay = runCatching {
      transactionRepository.getLatestTimestampOnDate(selectedDate, existingTransaction?.id ?: -1L)
    }.getOrNull()
    return if (latestOnDay != null) {
      Instant.fromEpochMilliseconds(latestOnDay.toEpochMilliseconds() + 1)
    } else {
      selectedDate.atTime(LocalTime(12, 0)).toInstant(TimeZone.currentSystemDefault())
    }
  }

  private fun shiftViewport(delta: Int) {
    transactionViewport.update { viewport ->
      viewport.shiftBy(
        delta = delta,
        totalCount = _state.value.totalTransactionCount,
      )
    }
  }

  private fun validateDraft(draft: TransactionDraftState): DraftValidation {
    val parsedDate = parseDateInput(draft.dateInput)
    val dateError = parsedDate == null
    val descriptionError = draft.description.isBlank()
    var focusTarget: RegisterFocusTarget? = null

    if (dateError) {
      focusTarget = nextFocus(TransactionField.DATE)
    } else if (descriptionError) {
      focusTarget = nextFocus(TransactionField.DESCRIPTION)
    }

    val validatedTransfers = draft.transfers.mapIndexed { index, transfer ->
      val fromAccountError = transfer.fromAccountId == null
      val quantityError = transfer.quantity == null
      val unitError = transfer.unitId == null
      val toAccountError = transfer.toAccountId == null || transfer.toAccountId == transfer.fromAccountId
      if (focusTarget == null) {
        focusTarget = when {
          fromAccountError -> nextFocus(TransactionField.FROM_ACCOUNT, index)
          quantityError -> nextFocus(TransactionField.QUANTITY, index)
          unitError -> nextFocus(TransactionField.UNIT, index)
          toAccountError -> nextFocus(TransactionField.TO_ACCOUNT, index)
          else -> null
        }
      }
      transfer.copy(
        fromAccountError = fromAccountError,
        quantityError = quantityError,
        unitError = unitError,
        toAccountError = toAccountError,
      )
    }

    val isValid = !dateError && !descriptionError && validatedTransfers.all {
      !it.fromAccountError && !it.quantityError && !it.unitError && !it.toAccountError
    }
    val error = when {
      dateError -> "Date must use dd-mm-yyyy format"
      descriptionError -> "Description is required"
      else -> if (isValid) null else "Complete all transfer fields before saving"
    }
    return DraftValidation(
      draft = draft.copy(
        selectedDateIso = parsedDate?.toString() ?: draft.selectedDateIso,
        dateError = dateError,
        descriptionError = descriptionError,
        transfers = validatedTransfers,
      ),
      isValid = isValid,
      focusTarget = focusTarget,
      error = error,
    )
  }

  private fun nextFocus(field: TransactionField, transferRowIndex: Int = 0): RegisterFocusTarget {
    focusSequence += 1
    return RegisterFocusTarget(field = field, transferRowIndex = transferRowIndex, sequence = focusSequence)
  }

  private fun nextRevealSequence(): Long {
    revealSequence += 1
    return revealSequence
  }

  private fun groupTransactionsByDate(
    transactions: List<Transaction>,
    activeEditingTransactionId: Long?,
    previousDateIso: String?,
  ): List<TransactionListItem> {
    var lastDateIso = previousDateIso
    return transactions.flatMap { transaction ->
      val date = transaction.timestamp.toLocalDateTime(TimeZone.currentSystemDefault()).date
      val dateIso = date.toString()
      buildList {
        if (dateIso != lastDateIso) {
          add(TransactionListItem.DateHeader(dateIso = dateIso, label = formatDateHeader(date)))
        }
        add(
          TransactionListItem.TransactionItem(
            transaction = transaction,
            isEditing = transaction.id == activeEditingTransactionId,
          ),
        )
      }
        .also { lastDateIso = dateIso }
    }
  }

  private fun formatDateHeader(date: LocalDate): String {
    val month = date.month.name.lowercase().replaceFirstChar(Char::uppercase)
    val weekday = date.dayOfWeek.name.lowercase().replaceFirstChar(Char::uppercase)
    return "$weekday, $month ${date.dayOfMonth}, ${date.year}"
  }

  private data class DraftValidation(
    val draft: TransactionDraftState,
    val isValid: Boolean,
    val focusTarget: RegisterFocusTarget?,
    val error: String?,
  )

  private data class SessionDefaults(
    val date: LocalDate,
    val transfer: TransferDraftState,
  )

  private companion object {
    const val INITIAL_VISIBLE_TRANSACTION_LIMIT = 200
    const val VISIBLE_TRANSACTION_PAGE_SIZE = 100
  }
}

private fun TransactionViewport.shiftBy(delta: Int, totalCount: Int): TransactionViewport {
  val maxOffset = (totalCount - limit).coerceAtLeast(0)
  return copy(offset = (offset + delta).coerceIn(0, maxOffset))
}

private fun TransactionViewport.centerAround(offset: Int, totalCount: Int): TransactionViewport {
  val desiredOffset = (offset - limit / 2).coerceAtLeast(0)
  val maxOffset = (totalCount - limit).coerceAtLeast(0)
  return copy(offset = desiredOffset.coerceIn(0, maxOffset))
}

class UnitPresenter(
  private val unitRepository: UnitRepository,
  private val scope: CoroutineScope,
) {
  private val _state = MutableStateFlow(UnitUiState(isLoading = true))
  val state: StateFlow<UnitUiState> = _state.asStateFlow()

  init {
    scope.launch {
      unitRepository.getUnits().collectLatest { units ->
        _state.update { it.copy(units = units, isLoading = false) }
      }
    }
  }

  fun updateName(name: String) {
    _state.update { it.copy(form = it.form.copy(name = name, nameError = name.isBlank())) }
  }

  fun updateSymbol(symbol: String) {
    _state.update { it.copy(form = it.form.copy(symbol = symbol, symbolError = symbol.isBlank())) }
  }

  fun updateMantissaLength(input: String) {
    val parsed = input.toIntOrNull()
    _state.update {
      it.copy(
        form = it.form.copy(
          mantissaLength = parsed,
          mantissaLengthInput = input,
          mantissaError = input.isNotBlank() && parsed == null,
        ),
      )
    }
  }

  fun createUnit(onSuccess: suspend () -> Unit = {}) {
    val form = _state.value.form
    val validation = UnitFormValidator.validate(form.name, form.symbol, form.mantissaLength)
    if (!validation.isValid) {
      _state.update {
        it.copy(
          form = it.form.copy(
            nameError = "name" in validation.errors,
            symbolError = "symbol" in validation.errors,
            mantissaError = "mantissaLength" in validation.errors,
          ),
        )
      }
      return
    }
    scope.launch {
      runCatching {
        unitRepository.createUnit(form.name, form.symbol, form.mantissaLength ?: 0)
        _state.update { it.copy(form = UnitFormState(), error = null) }
        onSuccess()
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to create unit: ${error.message}") }
      }
    }
  }
}

class AccountPresenter(
  private val accountRepository: AccountRepository,
  private val scope: CoroutineScope,
) {
  private var accountJob: Job? = null
  private val _state = MutableStateFlow(AccountUiState(isLoading = true))
  val state: StateFlow<AccountUiState> = _state.asStateFlow()

  init {
    observeAccounts(false)
  }

  fun toggleShowArchived(showArchived: Boolean) {
    _state.update { it.copy(showArchived = showArchived) }
    observeAccounts(showArchived)
  }

  private fun observeAccounts(showArchived: Boolean) {
    accountJob?.cancel()
    accountJob = scope.launch {
      accountRepository.getAccountDetails(showArchived).collectLatest { accounts ->
        _state.update { it.copy(accounts = accounts, isLoading = false) }
      }
    }
  }

  fun updateNewAccountName(name: String) {
    _state.update { it.copy(form = it.form.copy(name = name)) }
  }

  fun updateNewAccountOwning(owning: Boolean) {
    _state.update { it.copy(form = it.form.copy(owning = owning)) }
  }

  fun createAccount(onSuccess: suspend () -> Unit = {}) {
    val form = _state.value.form
    if (form.name.isBlank()) {
      return
    }
    scope.launch {
      runCatching {
        accountRepository.createAccount(form.name, form.owning)
        _state.update { it.copy(form = AccountFormState(), error = null) }
        onSuccess()
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to create account: ${error.message}") }
      }
    }
  }

  fun toggleEditMode(accountId: Long, enabled: Boolean) {
    _state.update { state ->
      state.copy(
        accounts = state.accounts.map { account ->
          if (account.account.id == accountId) {
            account.copy(
              editMode = enabled,
              nameInput = if (enabled) account.account.name else account.nameInput,
              owningInput = if (enabled) account.account.owning else account.owningInput,
              archivedInput = if (enabled) account.account.isArchived else account.archivedInput,
              showArchivedError = false,
            )
          } else {
            account
          }
        },
      )
    }
  }

  fun updateAccountName(accountId: Long, name: String) {
    _state.update { state ->
      state.copy(accounts = state.accounts.map { if (it.account.id == accountId) it.copy(nameInput = name) else it })
    }
  }

  fun updateAccountOwning(accountId: Long, owning: Boolean) {
    _state.update { state ->
      state.copy(accounts = state.accounts.map { if (it.account.id == accountId) it.copy(owningInput = owning) else it })
    }
  }

  fun updateAccountArchived(accountId: Long, archived: Boolean) {
    scope.launch {
      val allowed = !archived || accountRepository.isArchivingAllowed(accountId)
      _state.update { state ->
        state.copy(
          accounts = state.accounts.map {
            if (it.account.id == accountId) {
              if (allowed) {
                it.copy(archivedInput = archived, showArchivedError = false)
              } else {
                it.copy(showArchivedError = true)
              }
            } else {
              it
            }
          },
        )
      }
    }
  }

  fun applyAccountEdits(accountId: Long, onSuccess: suspend () -> Unit = {}) {
    val account = _state.value.accounts.firstOrNull { it.account.id == accountId } ?: return
    scope.launch {
      runCatching {
        accountRepository.updateAccount(accountId, account.nameInput, account.owningInput, account.archivedInput)
        _state.update { state ->
          state.copy(
            accounts = state.accounts.map {
              if (it.account.id == accountId) {
                it.copy(editMode = false)
              } else {
                it
              }
            },
            error = null,
          )
        }
        onSuccess()
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to update account: ${error.message}") }
      }
    }
  }

  fun checkConsistency() {
    scope.launch {
      runCatching { accountRepository.checkConsistency() }
        .onSuccess { result ->
          _state.update { it.copy(consistencyResult = result, error = null) }
        }
        .onFailure { error ->
          _state.update { it.copy(error = "Failed to check consistency: ${error.message}") }
        }
    }
  }

  fun clearConsistencyResult() {
    _state.update { it.copy(consistencyResult = null) }
  }
}

class AnalyticsPresenter(
  private val analyticsRepository: AnalyticsRepository,
  private val scope: CoroutineScope,
) {
  private val _state = MutableStateFlow(AnalyticsUiState(isLoading = true))
  val state: StateFlow<AnalyticsUiState> = _state.asStateFlow()

  init {
    scope.launch {
      analyticsRepository.observeAccounts().collectLatest { accounts ->
        _state.update {
          it.copy(
            accounts = accounts,
            selectedAccountId = it.selectedAccountId ?: accounts.firstOrNull()?.id,
          )
        }
        loadBalanceData()
      }
    }
    scope.launch {
      analyticsRepository.observeUnits().collectLatest { units ->
        _state.update {
          it.copy(
            units = units,
            selectedUnitId = it.selectedUnitId ?: units.firstOrNull()?.id,
          )
        }
        loadBalanceData()
      }
    }
  }

  fun selectAccount(accountId: Long) {
    _state.update { it.copy(selectedAccountId = accountId) }
    loadBalanceData()
  }

  fun selectUnit(unitId: Long) {
    _state.update { it.copy(selectedUnitId = unitId) }
    loadBalanceData()
  }

  fun selectTimeRange(range: AnalyticsTimeRange) {
    _state.update { it.copy(timeRange = range) }
    loadBalanceData()
  }

  fun loadBalanceData() {
    val state = _state.value
    val accountId = state.selectedAccountId ?: return
    val unitId = state.selectedUnitId ?: return
    scope.launch {
      _state.update { it.copy(isLoading = true, error = null) }
      runCatching {
        analyticsRepository.loadBalanceData(accountId, unitId, _state.value.timeRange)
      }.onSuccess { points ->
        _state.update { it.copy(balanceData = points, isLoading = false, error = null) }
      }.onFailure { error ->
        _state.update { it.copy(isLoading = false, error = "Failed to load balance data: ${error.message}") }
      }
    }
  }
}

class SyncPresenter(
  private val backupManager: BackupManager,
  private val scope: CoroutineScope,
) {
  private val _state = MutableStateFlow(SyncUiState())
  val state: StateFlow<SyncUiState> = _state.asStateFlow()

  init {
    scope.launch {
      combine(backupManager.isSignedIn, backupManager.accountLabel) { isSignedIn, accountLabel ->
        isSignedIn to accountLabel
      }.collectLatest { (isSignedIn, accountLabel) ->
        _state.update { it.copy(isSignedIn = isSignedIn, accountLabel = accountLabel) }
      }
    }
  }

  fun signIn() {
    scope.launch {
      _state.update { it.copy(isLoading = true, error = null) }
      runCatching {
        backupManager.signIn()
        val backups = backupManager.listBackups()
        _state.update { it.copy(backupFiles = backups, isLoading = false, error = null) }
      }.onFailure { error ->
        _state.update { it.copy(isLoading = false, error = "Failed to sign in: ${error.message}") }
      }
    }
  }

  fun loadBackupFiles() {
    scope.launch {
      _state.update { it.copy(isLoading = true, error = null) }
      runCatching { backupManager.listBackups() }
        .onSuccess { files -> _state.update { it.copy(backupFiles = files, isLoading = false, error = null) } }
        .onFailure { error -> _state.update { it.copy(isLoading = false, error = "Failed to load backup files: ${error.message}") } }
    }
  }

  fun uploadBackup() {
    scope.launch {
      _state.update { it.copy(isLoading = true, error = null) }
      runCatching {
        backupManager.uploadBackup()
        backupManager.listBackups()
      }.onSuccess { files ->
        _state.update { it.copy(backupFiles = files, isLoading = false, error = null) }
      }.onFailure { error ->
        _state.update { it.copy(isLoading = false, error = "Failed to upload backup: ${error.message}") }
      }
    }
  }

  fun restoreBackup(fileId: String) {
    _state.update {
      it.copy(
        restoreStatus = it.restoreStatus + (fileId to "Restoring..."),
        error = null,
      )
    }
    scope.launch {
      runCatching { backupManager.restoreBackup(fileId) }
        .onSuccess {
          _state.update { it.copy(restoreStatus = it.restoreStatus + (fileId to "Restored"), error = null) }
        }
        .onFailure { error ->
          _state.update { it.copy(restoreStatus = it.restoreStatus + (fileId to "Failed"), error = "Failed to restore backup: ${error.message}") }
        }
    }
  }

  fun downloadBackup(fileId: String) {
    restoreBackup(fileId)
  }

  fun deleteBackup(fileId: String) {
    scope.launch {
      runCatching {
        backupManager.deleteBackup(fileId)
        backupManager.listBackups()
      }.onSuccess { files ->
        _state.update { it.copy(backupFiles = files, error = null) }
      }.onFailure { error ->
        _state.update { it.copy(error = "Failed to delete backup: ${error.message}") }
      }
    }
  }
}

class SettingsPresenter(
  private val settingsManager: SettingsManager,
  private val scope: CoroutineScope,
) {
  private val _state = MutableStateFlow(SettingsUiState())
  val state: StateFlow<SettingsUiState> = _state.asStateFlow()

  init {
    scope.launch {
      settingsManager.themeMode.collectLatest { mode ->
        _state.update { it.copy(themeMode = mode) }
      }
    }
  }

  fun setThemeMode(mode: ThemeMode) {
    scope.launch {
      settingsManager.setThemeMode(mode)
    }
  }
}
