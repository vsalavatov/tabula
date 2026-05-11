package dev.salavatov.tabula.shared.core

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.datetime.Clock
import kotlinx.datetime.Instant
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class TransactionPresenterTest {
  @Test
  fun newDraftUsesLastTransactionDefaults() = runTest {
    val presenterScope = testPresenterScope(testScheduler)
    val fixture = PresenterFixture(
      transactions = listOf(
        transaction(
          id = 1L,
          description = "Cash split",
          timestamp = "2026-05-02T12:00:00Z",
          transfers = listOf(
            transfer(
              id = 11L,
              fromAccount = account(1L, "Checking"),
              toAccount = account(2L, "Wallet"),
              unit = measureUnit(1L, "Euro", "EUR"),
              quantity = 18.5,
            ),
          ),
        ),
      ),
      accounts = listOf(account(1L, "Checking"), account(2L, "Wallet")),
      units = listOf(measureUnit(1L, "Euro", "EUR")),
      scope = presenterScope,
    )
    try {
      advanceUntilIdle()

      val draft = fixture.presenter.state.value.draft
      val today = Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date
      assertEquals(TransactionDraftMode.NEW, draft.mode)
      assertEquals("${today.dayOfMonth.toString().padStart(2, '0')}-${today.monthNumber.toString().padStart(2, '0')}-${today.year}", draft.dateInput)
      assertEquals(today.toString(), draft.selectedDateIso)
      assertEquals("", draft.description)
      assertEquals(1L, draft.transfers.single().fromAccountId)
      assertEquals(2L, draft.transfers.single().toAccountId)
      assertEquals(1L, draft.transfers.single().unitId)
      assertEquals("", draft.transfers.single().quantityInput)
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun invalidDateInputIsRejected() = runTest {
    val fixture = PresenterFixture(scope = testPresenterScope(testScheduler))
    try {
      advanceUntilIdle()

      fixture.presenter.updateDateInput("2026-05-03")
      fixture.presenter.commitDraft()

      val state = fixture.presenter.state.value
      assertTrue(state.draft.dateError)
      assertEquals("Date must use dd-mm-yyyy format", state.error)
      assertEquals(TransactionField.DATE, state.draft.focusTarget?.field)
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun addAndRemoveTransferRowsKeepsRegisterDraftInline() = runTest {
    val fixture = PresenterFixture(scope = testPresenterScope(testScheduler))
    try {
      advanceUntilIdle()

      fixture.presenter.addTransferRow()
      var state = fixture.presenter.state.value
      assertEquals(2, state.draft.transfers.size)
      assertEquals(TransactionField.FROM_ACCOUNT, state.draft.focusTarget?.field)
      assertEquals(1, state.draft.focusTarget?.transferRowIndex)

      fixture.presenter.removeTransferRow(1)
      state = fixture.presenter.state.value
      assertEquals(1, state.draft.transfers.size)
      assertNull(state.activeEditingTransactionId)
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun commitDraftCreatesTimestampAfterLatestEntryOnSameDay() = runTest {
    val existingTimestamp = Instant.parse("2026-05-03T12:00:00Z")
    val presenterScope = testPresenterScope(testScheduler)
    val fixture = PresenterFixture(
      transactions = listOf(
        transaction(
          id = 1L,
          description = "Seed transaction",
          timestamp = existingTimestamp.toString(),
          transfers = listOf(
            transfer(
              id = 11L,
              fromAccount = account(1L, "Checking"),
              toAccount = account(2L, "Wallet"),
              unit = measureUnit(1L, "Euro", "EUR"),
              quantity = 30.0,
            ),
          ),
        ),
      ),
      accounts = listOf(account(1L, "Checking"), account(2L, "Wallet")),
      units = listOf(measureUnit(1L, "Euro", "EUR")),
      scope = presenterScope,
    )
    try {
      advanceUntilIdle()

      fixture.presenter.updateDateInput("03-05-2026")
      fixture.presenter.updateDescription("Second entry")
      fixture.presenter.updateTransferQuantity(0, "12")
      fixture.presenter.commitDraft()
      advanceUntilIdle()

      val created = fixture.transactionRepository.created.single()
      assertEquals("Second entry", created.description)
      assertEquals(existingTimestamp.toEpochMilliseconds() + 1, created.timestamp.toEpochMilliseconds())
      assertEquals(1, created.transfers.size)
      assertEquals(2L, fixture.presenter.state.value.revealTransaction?.transactionId)
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun editingExistingTransactionUsesUpdateAndResetsToNewDraft() = runTest {
    val presenterScope = testPresenterScope(testScheduler)
    val fixture = PresenterFixture(
      transactions = listOf(
        transaction(
          id = 42L,
          description = "Salary split",
          timestamp = "2026-05-03T12:00:00Z",
          transfers = listOf(
            transfer(
              id = 11L,
              fromAccount = account(1L, "Checking"),
              toAccount = account(2L, "Wallet"),
              unit = measureUnit(1L, "Euro", "EUR"),
              quantity = 50.0,
            ),
          ),
        ),
      ),
      accounts = listOf(account(1L, "Checking"), account(2L, "Wallet")),
      units = listOf(measureUnit(1L, "Euro", "EUR")),
      scope = presenterScope,
    )
    try {
      advanceUntilIdle()

      fixture.presenter.beginEditingTransaction(42L)
      fixture.presenter.updateDescription("Salary split updated")
      fixture.presenter.updateTransferQuantity(0, "55")
      fixture.presenter.commitDraft()
      advanceUntilIdle()

      val updated = fixture.transactionRepository.updated.single()
      assertEquals(42L, updated.id)
      assertEquals("Salary split updated", updated.description)
      assertEquals(55.0, updated.transfers.single().quantity)

      val state = fixture.presenter.state.value
      assertNull(state.activeEditingTransactionId)
      assertEquals(TransactionDraftMode.NEW, state.draft.mode)
      assertEquals("", state.draft.description)
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun deletingTransactionUsesRepositoryDelete() = runTest {
    val fixture = PresenterFixture(
      transactions = listOf(
        transaction(
          id = 42L,
          description = "Delete me",
          timestamp = "2026-05-03T12:00:00Z",
          transfers = listOf(
            transfer(
              id = 11L,
              fromAccount = account(1L, "Checking"),
              toAccount = account(2L, "Wallet"),
              unit = measureUnit(1L, "Euro", "EUR"),
              quantity = 50.0,
            ),
          ),
        ),
      ),
      accounts = listOf(account(1L, "Checking"), account(2L, "Wallet")),
      units = listOf(measureUnit(1L, "Euro", "EUR")),
      scope = testPresenterScope(testScheduler),
    )
    try {
      advanceUntilIdle()
      fixture.presenter.deleteTransaction(42L)
      advanceUntilIdle()
      assertEquals(listOf(42L), fixture.transactionRepository.deleted)
      assertTrue(fixture.presenter.state.value.groupedTransactions.none {
        it is TransactionListItem.TransactionItem && it.transaction.id == 42L
      })
    } finally {
      fixture.cancel()
    }
  }

  @Test
  fun transactionListUsesABoundedViewportAndCanShiftOlder() = runTest {
    val fixture = PresenterFixture(
      transactions = (1L..305L).map { index ->
        transaction(
          id = index,
          description = "Transaction $index",
          timestamp = "2026-05-${(index % 28 + 1).toString().padStart(2, '0')}T12:00:00Z",
          transfers = listOf(
            transfer(
              id = index * 10,
              fromAccount = account(1L, "Checking"),
              toAccount = account(2L, "Wallet"),
              unit = measureUnit(1L, "Euro", "EUR"),
              quantity = index.toDouble(),
            ),
          ),
        )
      },
      accounts = listOf(account(1L, "Checking"), account(2L, "Wallet")),
      units = listOf(measureUnit(1L, "Euro", "EUR")),
      scope = testPresenterScope(testScheduler),
    )
    try {
      advanceUntilIdle()

      var state = fixture.presenter.state.value
      assertTrue(state.canLoadMore)
      assertEquals(200, state.visibleTransactions.size)
      assertEquals(0, state.viewportOffset)

      fixture.presenter.loadOlderTransactions()
      advanceUntilIdle()

      state = fixture.presenter.state.value
      assertEquals(200, state.visibleTransactions.size)
      assertEquals(100, state.viewportOffset)
      assertTrue(state.hasNewerTransactions)
      assertTrue(state.canLoadMore)
    } finally {
      fixture.cancel()
    }
  }

  private class PresenterFixture(
    transactions: List<Transaction> = emptyList(),
    accounts: List<Account> = emptyList(),
    units: List<MeasureUnit> = emptyList(),
    private val scope: CoroutineScope,
  ) {
    val transactionRepository = FakeTransactionRepository(transactions)
    private val accountRepository = FakeAccountRepository(accounts)
    private val unitRepository = FakeUnitRepository(units)

    val presenter = TransactionPresenter(
      transactionRepository = transactionRepository,
      accountRepository = accountRepository,
      unitRepository = unitRepository,
      scope = scope,
    )

    fun cancel() {
      scope.cancel()
    }
  }

  private class FakeTransactionRepository(
    initialTransactions: List<Transaction>,
  ) : TransactionRepository {
    private val transactions = MutableStateFlow(initialTransactions)
    val created = mutableListOf<CreatedTransaction>()
    val updated = mutableListOf<UpdatedTransaction>()
    val deleted = mutableListOf<Long>()
    private var nextId = (initialTransactions.maxOfOrNull { it.id } ?: 0L) + 1L

    override fun getTransactions(viewport: Flow<TransactionViewport>): Flow<TransactionWindow> = combine(transactions, viewport) { currentTransactions, currentViewport ->
      val visibleTransactions = currentTransactions.drop(currentViewport.offset).take(currentViewport.limit)
      TransactionWindow(
        transactions = visibleTransactions,
        offset = currentViewport.offset,
        limit = currentViewport.limit,
        totalCount = currentTransactions.size,
        hasOlder = currentViewport.offset + visibleTransactions.size < currentTransactions.size,
        hasNewer = currentViewport.offset > 0,
        previousDateIso = currentTransactions.getOrNull(currentViewport.offset - 1)?.timestamp?.toLocalDateTime(TimeZone.currentSystemDefault())?.date?.toString(),
      )
    }

    override suspend fun getTransactionOffset(transactionId: Long): Int {
      return transactions.value.indexOfFirst { it.id == transactionId }.coerceAtLeast(0)
    }

    override suspend fun getLatestTimestampOnDate(date: kotlinx.datetime.LocalDate, excludeTransactionId: Long): Instant? {
      return transactions.value
        .asSequence()
        .filter { it.id != excludeTransactionId }
        .filter { transaction -> transaction.timestamp.toLocalDateTime(TimeZone.currentSystemDefault()).date == date }
        .maxOfOrNull { it.timestamp }
    }

    override suspend fun createTransaction(description: String, timestamp: Instant, transfers: List<TransferInput>): Long {
      val id = nextId++
      created += CreatedTransaction(description, timestamp, transfers)
      transactions.value = listOf(
        transaction(
          id = id,
          description = description,
          timestamp = timestamp.toString(),
          transfers = transfers.mapIndexed { index, transfer ->
            transfer(
              id = 10_000L + index,
              fromAccount = account(transfer.fromAccountId, "Account ${transfer.fromAccountId}"),
              toAccount = account(transfer.toAccountId, "Account ${transfer.toAccountId}"),
              unit = measureUnit(transfer.unitId, "Unit ${transfer.unitId}", "U${transfer.unitId}"),
              quantity = transfer.quantity,
            )
          },
        ),
      ) + transactions.value
      return id
    }

    override suspend fun updateTransaction(id: Long, description: String, timestamp: Instant, transfers: List<TransferInput>) {
      updated += UpdatedTransaction(id, description, timestamp, transfers)
      transactions.value = transactions.value.map { transaction ->
        if (transaction.id != id) return@map transaction
        transaction(
          id = id,
          description = description,
          timestamp = timestamp.toString(),
          transfers = transfers.mapIndexed { index, transfer ->
            transfer(
              id = 20_000L + index,
              fromAccount = account(transfer.fromAccountId, "Account ${transfer.fromAccountId}"),
              toAccount = account(transfer.toAccountId, "Account ${transfer.toAccountId}"),
              unit = measureUnit(transfer.unitId, "Unit ${transfer.unitId}", "U${transfer.unitId}"),
              quantity = transfer.quantity,
            )
          },
        )
      }
    }

    override suspend fun deleteTransaction(id: Long) {
      deleted += id
      transactions.value = transactions.value.filterNot { it.id == id }
    }
  }

  private class FakeAccountRepository(initialAccounts: List<Account>) : AccountRepository {
    private val accounts = MutableStateFlow(initialAccounts)

    override fun getActiveAccounts(): Flow<List<Account>> = accounts

    override fun getAccountDetails(showArchived: Boolean): Flow<List<EditableAccount>> = flowOf(emptyList())

    override suspend fun createAccount(name: String, owning: Boolean): Long = 0L

    override suspend fun updateAccount(id: Long, name: String, owning: Boolean, archived: Boolean) {}

    override suspend fun checkConsistency(): ConsistencyCheckResult = ConsistencyCheckResult()

    override suspend fun isArchivingAllowed(accountId: Long): Boolean = true
  }

  private class FakeUnitRepository(initialUnits: List<MeasureUnit>) : UnitRepository {
    private val units = MutableStateFlow(initialUnits)

    override fun getUnits(): StateFlow<List<MeasureUnit>> = units

    override suspend fun createUnit(name: String, symbol: String, mantissaLength: Int): Long = 0L
  }

  private data class CreatedTransaction(
    val description: String,
    val timestamp: Instant,
    val transfers: List<TransferInput>,
  )

  private data class UpdatedTransaction(
    val id: Long,
    val description: String,
    val timestamp: Instant,
    val transfers: List<TransferInput>,
  )

  private companion object {
    fun testPresenterScope(testScheduler: TestCoroutineScheduler): CoroutineScope {
      return CoroutineScope(SupervisorJob() + StandardTestDispatcher(testScheduler))
    }

    fun account(id: Long, name: String) = Account(id = id, name = name, owning = true)

    fun measureUnit(id: Long, name: String, symbol: String) = MeasureUnit(
      id = id,
      name = name,
      symbol = symbol,
      mantissaLength = 2,
    )

    fun transfer(
      id: Long,
      fromAccount: Account,
      toAccount: Account,
      unit: MeasureUnit,
      quantity: Double,
    ) = Transfer(
      id = id,
      accountFrom = fromAccount,
      accountTo = toAccount,
      unit = unit,
      quantity = quantity,
    )

    fun transaction(
      id: Long,
      description: String,
      timestamp: String,
      transfers: List<Transfer>,
    ) = Transaction(
      id = id,
      description = description,
      timestamp = Instant.parse(timestamp),
      transfers = transfers,
    )
  }
}
