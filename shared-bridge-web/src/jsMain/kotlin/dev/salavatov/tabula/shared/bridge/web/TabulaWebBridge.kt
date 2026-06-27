@file:OptIn(ExperimentalJsExport::class)
@file:Suppress("UnsafeCastFromDynamic")

package dev.salavatov.tabula.shared.bridge.web

import dev.salavatov.tabula.shared.core.*
import dev.salavatov.tabula.shared.db.*
import kotlinx.browser.window
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.khronos.webgl.ArrayBuffer
import org.khronos.webgl.Uint8Array
import org.w3c.fetch.RequestInit
import kotlin.js.Promise

private val json = Json {
  ignoreUnknownKeys = true
  encodeDefaults = true
}

@Serializable
data class TabulaWebConfig(
  val googleClientId: String,
  val cacheKey: String = "tabula.db",
  val useMockDrive: Boolean = false,
)

@JsExport
fun createTabulaWebBridge(configJson: String): TabulaWebBridge {
  return TabulaWebBridge(json.decodeFromString(configJson))
}

@JsExport
class Subscription(
  private val disposeBlock: () -> Unit,
) {
  fun dispose() = disposeBlock()
}

@Serializable
private data class TransactionListSlice(
  val visibleTransactions: List<Transaction> = emptyList(),
  val viewportOffset: Int = 0,
  val viewportLimit: Int = 0,
  val totalTransactionCount: Int = 0,
  val hasOlderTransactions: Boolean = false,
  val hasNewerTransactions: Boolean = false,
  val previousDateIso: String? = null,
)

@Serializable
private data class TransactionDraftSlice(
  val draft: TransactionDraftState = TransactionDraftState(),
)

@Serializable
private data class TransactionLookupSlice(
  val accounts: List<Account> = emptyList(),
  val units: List<MeasureUnit> = emptyList(),
)

@Serializable
private data class TransactionMetaSlice(
  val activeEditingTransactionId: Long? = null,
  val revealTransaction: TransactionRevealState? = null,
  val isLoading: Boolean = false,
  val error: String? = null,
)

@JsExport
class TabulaWebBridge(
  private val config: TabulaWebConfig,
) {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
  private val cache = BrowserDatabaseCache(config.cacheKey)
  private val auth = GoogleTokenAuth(config.googleClientId)
  private val session = BrowserDatabaseSession()
  private val settingsManager = BrowserSettingsManager()
  private val backupManager: BackupManager = if (config.useMockDrive) {
    MockBackupManager(cache, session)
  } else {
    DriveBackupManager(auth, cache, session)
  }
  private val transactionRepository: TransactionRepository = TransactionRepositoryImpl(session.database)
  private val unitRepository: UnitRepository = UnitRepositoryImpl(session.database, scope)
  private val accountRepository: AccountRepository = AccountRepositoryImpl(session.database)
  private val analyticsRepository: AnalyticsRepository = AnalyticsRepositoryImpl(session.database)
  private val transactionPresenter = TransactionPresenter(transactionRepository, accountRepository, unitRepository, scope)
  private val unitPresenter = UnitPresenter(unitRepository, scope)
  private val accountPresenter = AccountPresenter(accountRepository, scope)
  private val analyticsPresenter = AnalyticsPresenter(analyticsRepository, scope)
  private val syncPresenter = SyncPresenter(backupManager, scope)
  private val settingsPresenter = SettingsPresenter(settingsManager, scope)
  private val transactionListState = transactionPresenter.state
    .map {
      TransactionListSlice(
        visibleTransactions = it.visibleTransactions,
        viewportOffset = it.viewportOffset,
        viewportLimit = it.viewportLimit,
        totalTransactionCount = it.totalTransactionCount,
        hasOlderTransactions = it.hasOlderTransactions,
        hasNewerTransactions = it.hasNewerTransactions,
        previousDateIso = it.previousDateIso,
      )
    }
    .stateIn(scope, SharingStarted.Eagerly, TransactionListSlice())
  private val transactionDraftState = transactionPresenter.state
    .map { TransactionDraftSlice(draft = it.draft) }
    .stateIn(scope, SharingStarted.Eagerly, TransactionDraftSlice())
  private val transactionLookupState = transactionPresenter.state
    .map { TransactionLookupSlice(accounts = it.accounts, units = it.units) }
    .stateIn(scope, SharingStarted.Eagerly, TransactionLookupSlice())
  private val transactionMetaState = transactionPresenter.state
    .map {
      TransactionMetaSlice(
        activeEditingTransactionId = it.activeEditingTransactionId,
        revealTransaction = it.revealTransaction,
        isLoading = it.isLoading,
        error = it.error,
      )
    }
    .stateIn(scope, SharingStarted.Eagerly, TransactionMetaSlice())

  init {
    scope.launch {
      session.open(cache.readBytes())
    }
    scope.launch {
      if (auth.restoreCachedSession()) {
        syncPresenter.loadBackupFiles()
      }
    }
  }

  fun getTransactionsListJson(): String = json.encodeToString(transactionListState.value)
  fun getTransactionsDraftJson(): String = json.encodeToString(transactionDraftState.value)
  fun getTransactionsLookupJson(): String = json.encodeToString(transactionLookupState.value)
  fun getTransactionsMetaJson(): String = json.encodeToString(transactionMetaState.value)
  fun getUnitsStateJson(): String = json.encodeToString(unitPresenter.state.value)
  fun getAccountsStateJson(): String = json.encodeToString(accountPresenter.state.value)
  fun getAnalyticsStateJson(): String = json.encodeToString(analyticsPresenter.state.value)
  fun getSyncStateJson(): String = json.encodeToString(syncPresenter.state.value)
  fun getSettingsStateJson(): String = json.encodeToString(settingsPresenter.state.value)

  fun subscribeTransactionsList(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(transactionListState, listener)

  fun subscribeTransactionsDraft(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(transactionDraftState, listener)

  fun subscribeTransactionsLookup(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(transactionLookupState, listener)

  fun subscribeTransactionsMeta(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(transactionMetaState, listener)

  fun subscribeUnitsState(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(unitPresenter.state, listener)

  fun subscribeAccountsState(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(accountPresenter.state, listener)

  fun subscribeAnalyticsState(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(analyticsPresenter.state, listener)

  fun subscribeSyncState(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(syncPresenter.state, listener)

  fun subscribeSettingsState(listener: (String) -> Unit): Subscription =
    subscribeSerializedState(settingsPresenter.state, listener)

  fun dispose() {
    session.close()
    scope.cancel()
  }

  fun signIn() = syncPresenter.signIn()
  fun loadBackups() = syncPresenter.loadBackupFiles()
  fun uploadBackup() = syncPresenter.uploadBackup()
  fun restoreBackup(fileId: String) = syncPresenter.restoreBackup(fileId)
  fun downloadBackup(fileId: String) = syncPresenter.downloadBackup(fileId)
  fun deleteBackup(fileId: String) = syncPresenter.deleteBackup(fileId)
  fun exportDatabaseBase64(): Promise<String> = Promise { resolve, reject ->
    scope.launch {
      runCatching {
        session.exportBytes().toBase64()
      }.onSuccess {
        resolve(it)
      }.onFailure {
        reject(it)
      }
    }
  }
  fun importDatabaseBase64(base64: String): Promise<Unit> = Promise { resolve, reject ->
    scope.launch {
      runCatching {
        val bytes = base64.base64ToByteArray()
        cache.writeBytes(bytes)
        session.open(bytes)
      }.onSuccess {
        resolve(Unit)
      }.onFailure {
        reject(it)
      }
    }
  }
  fun beginNewTransactionEntry() = transactionPresenter.beginNewEntry()
  fun cancelEditingTransaction() = transactionPresenter.cancelEditing()
  fun updateTransactionDescription(description: String) = transactionPresenter.updateDescription(description)
  fun updateTransactionDateInput(dateInput: String) = transactionPresenter.updateDateInput(dateInput)
  fun stepTransactionDate(days: Int) = transactionPresenter.stepDate(days)
  fun addTransferRow() = transactionPresenter.addTransferRow()
  fun loadOlderTransactions() = transactionPresenter.loadOlderTransactions()
  fun loadNewerTransactions() = transactionPresenter.loadNewerTransactions()
  fun createUnit() = unitPresenter.createUnit { persistLocalSnapshot() }
  fun toggleShowArchived(showArchived: Boolean) = accountPresenter.toggleShowArchived(showArchived)
  fun updateNewAccountName(name: String) = accountPresenter.updateNewAccountName(name)
  fun updateNewAccountInPossession(inPossession: Boolean) = accountPresenter.updateNewAccountInPossession(inPossession)
  fun createAccount() = accountPresenter.createAccount { persistLocalSnapshot() }
  fun checkConsistency() = accountPresenter.checkConsistency()
  fun clearConsistencyResult() = accountPresenter.clearConsistencyResult()

  fun beginEditingTransaction(transactionId: Double) {
    transactionPresenter.beginEditingTransaction(transactionId.toLong())
  }

  fun updateTransferFromAccount(rowIndex: Double, accountId: Double?) {
    transactionPresenter.updateTransferFromAccount(rowIndex.toInt(), accountId?.toLong())
  }

  fun updateTransferQuantity(rowIndex: Double, quantity: String) {
    transactionPresenter.updateTransferQuantity(rowIndex.toInt(), quantity)
  }

  fun updateTransferUnit(rowIndex: Double, unitId: Double?) {
    transactionPresenter.updateTransferUnit(rowIndex.toInt(), unitId?.toLong())
  }

  fun updateTransferToAccount(rowIndex: Double, accountId: Double?) {
    transactionPresenter.updateTransferToAccount(rowIndex.toInt(), accountId?.toLong())
  }

  fun deleteTransaction(transactionId: Double) {
    transactionPresenter.deleteTransaction(transactionId.toLong())
  }

  fun removeTransferRow(rowIndex: Double) {
    transactionPresenter.removeTransferRow(rowIndex.toInt())
  }

  fun commitTransactionDraft() {
    transactionPresenter.commitDraft { persistLocalSnapshot() }
  }

  fun updateUnitName(name: String) {
    unitPresenter.updateName(name)
  }

  fun updateUnitSymbol(symbol: String) {
    unitPresenter.updateSymbol(symbol)
  }

  fun updateUnitMantissaLength(value: String) {
    unitPresenter.updateMantissaLength(value)
  }

  fun toggleAccountEditMode(accountId: Double, enabled: Boolean) {
    accountPresenter.toggleEditMode(accountId.toLong(), enabled)
  }

  fun updateAccountName(accountId: Double, name: String) {
    accountPresenter.updateAccountName(accountId.toLong(), name)
  }

  fun updateAccountInPossession(accountId: Double, inPossession: Boolean) {
    accountPresenter.updateAccountInPossession(accountId.toLong(), inPossession)
  }

  fun updateAccountArchived(accountId: Double, archived: Boolean) {
    accountPresenter.updateAccountArchived(accountId.toLong(), archived)
  }

  fun applyAccountEdits(accountId: Double) {
    accountPresenter.applyAccountEdits(accountId.toLong()) { persistLocalSnapshot() }
  }

  fun selectAnalyticsAccount(accountId: Double) {
    analyticsPresenter.selectAccount(accountId.toLong())
  }

  fun selectAnalyticsUnit(unitId: Double) {
    analyticsPresenter.selectUnit(unitId.toLong())
  }

  fun selectAnalyticsTimeRange(range: String) {
    runCatching { AnalyticsTimeRange.valueOf(range) }.getOrNull()?.let(analyticsPresenter::selectTimeRange)
  }

  fun setThemeMode(mode: String) {
    runCatching { ThemeMode.valueOf(mode) }.getOrNull()?.let(settingsPresenter::setThemeMode)
  }

  private suspend fun persistLocalSnapshot() {
    cache.writeBytes(session.exportBytes())
  }

  private inline fun <reified T> subscribeSerializedState(
    flow: StateFlow<T>,
    crossinline listener: (String) -> Unit,
  ): Subscription {
    var lastEncoded = json.encodeToString(flow.value)
    listener(lastEncoded)
    val job = scope.launch {
      flow
        .collectLatest {
          val encoded = json.encodeToString(it)
          if (encoded != lastEncoded) {
            lastEncoded = encoded
            listener(encoded)
          }
        }
    }
    return Subscription { job.cancel() }
  }
}

private class BrowserSettingsManager : SettingsManager {
  private val storageKey = "tabula.themeMode"
  private val theme = MutableStateFlow(readThemeMode())
  override val themeMode: StateFlow<ThemeMode> = theme.asStateFlow()

  override suspend fun setThemeMode(mode: ThemeMode) {
    window.localStorage.setItem(storageKey, mode.name)
    theme.value = mode
  }

  private fun readThemeMode(): ThemeMode {
    val stored = window.localStorage.getItem(storageKey) ?: return ThemeMode.SYSTEM
    return runCatching { ThemeMode.valueOf(stored) }.getOrDefault(ThemeMode.SYSTEM)
  }
}

private class DriveBackupManager(
  private val auth: GoogleTokenAuth,
  private val cache: BrowserDatabaseCache,
  private val session: BrowserDatabaseSession,
) : BackupManager {
  override val isSignedIn: StateFlow<Boolean> = auth.isSignedIn
  override val accountLabel: StateFlow<String?> = auth.accountLabel

  override suspend fun signIn() {
    auth.ensureSignedIn()
  }

  override suspend fun listBackups(): List<BackupFileInfo> = DriveApi(auth).listBackups()

  override suspend fun uploadBackup(): BackupFileInfo {
    val snapshot = session.exportBytes()
    cache.writeBytes(snapshot)
    val device = window.navigator.asDynamic().platform as? String ?: "web"
    return DriveApi(auth).uploadBackup(snapshot, buildBackupName(device))
  }

  override suspend fun restoreBackup(fileId: String) {
    val bytes = DriveApi(auth).downloadBackup(fileId)
    cache.writeBytes(bytes)
    session.open(bytes)
  }

  override suspend fun downloadBackup(fileId: String) {
    restoreBackup(fileId)
  }

  override suspend fun deleteBackup(fileId: String) {
    DriveApi(auth).deleteBackup(fileId)
  }
}

private class MockBackupManager(
  private val cache: BrowserDatabaseCache,
  private val session: BrowserDatabaseSession,
) : BackupManager {
  private val signedIn = MutableStateFlow(false)
  private val label = MutableStateFlow<String?>(null)
  private val backups = linkedMapOf<String, StoredBackup>()
  private var hasSeededInitialBackup = false

  override val isSignedIn: StateFlow<Boolean> = signedIn.asStateFlow()
  override val accountLabel: StateFlow<String?> = label.asStateFlow()

  override suspend fun signIn() {
    ensureSignedIn()
  }

  override suspend fun listBackups(): List<BackupFileInfo> {
    ensureSignedIn()
    return backups.values.map { it.info }.reversed()
  }

  override suspend fun uploadBackup(): BackupFileInfo {
    ensureSignedIn()
    val bytes = session.exportBytes().copyOf()
    cache.writeBytes(bytes)
    val info = BackupFileInfo(
      id = "mock-${js("Date.now()").unsafeCast<Double>().toLong()}",
      name = buildBackupName("mock-web"),
    )
    backups[info.id] = StoredBackup(info, bytes)
    return info
  }

  override suspend fun restoreBackup(fileId: String) {
    ensureSignedIn()
    val bytes = backups[fileId]?.bytes ?: error("Mock backup not found: $fileId")
    cache.writeBytes(bytes)
    session.open(bytes.copyOf())
  }

  override suspend fun downloadBackup(fileId: String) {
    restoreBackup(fileId)
  }

  override suspend fun deleteBackup(fileId: String) {
    ensureSignedIn()
    backups.remove(fileId)
  }

  private suspend fun ensureSignedIn() {
    if (!signedIn.value) {
      signedIn.value = true
      label.value = "Mock Google Drive"
    }
    if (!hasSeededInitialBackup) {
      val initialBytes = session.exportBytes().copyOf()
      val info = BackupFileInfo(
        id = "mock-initial",
        name = buildBackupName("mock-seed"),
      )
      backups[info.id] = StoredBackup(info, initialBytes)
      hasSeededInitialBackup = true
    }
  }

  private data class StoredBackup(
    val info: BackupFileInfo,
    val bytes: ByteArray,
  )
}

private class DriveApi(
  private val auth: GoogleTokenAuth,
) {
  suspend fun listBackups(): List<BackupFileInfo> {
    val response = window.fetch(
      "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name)&orderBy=createdTime desc",
      requestInit("GET", auth.requireToken()),
    ).await()
    val payload = JSON.parse<dynamic>(response.text().await())
    val files = payload.files as? Array<dynamic> ?: emptyArray()
    return files.map { file -> BackupFileInfo(id = file.id as String, name = file.name as String) }
  }

  suspend fun downloadBackup(fileId: String): ByteArray {
    val response = window.fetch(
      "https://www.googleapis.com/drive/v3/files/$fileId?alt=media",
      requestInit("GET", auth.requireToken()),
    ).await()
    return Uint8Array(response.arrayBuffer().await()).toByteArray()
  }

  suspend fun uploadBackup(bytes: ByteArray, name: String): BackupFileInfo {
    val boundary = "tabula-${js("Math.random().toString(36).slice(2)").unsafeCast<String>()}"
    val metadataObject = js("({})")
    metadataObject.name = name
    metadataObject.parents = arrayOf("appDataFolder")
    metadataObject.mimeType = "application/x-sqlite3"
    val metadataJson = JSON.stringify(metadataObject)
    val prefix = "--$boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n$metadataJson\r\n--$boundary\r\nContent-Type: application/octet-stream\r\n\r\n"
    val suffix = "\r\n--$boundary--"
    val binary = bytes.toUint8Array()
    val blobOptions = js("({})")
    blobOptions.type = "multipart/related; boundary=$boundary"
    val parts = arrayOf<dynamic>(prefix, binary, suffix)
    val body = js("new Blob(parts, blobOptions)")
    val response = window.fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
      requestInit("POST", auth.requireToken(), body),
    ).await()
    val payload = JSON.parse<dynamic>(response.text().await())
    return BackupFileInfo(id = payload.id as String, name = payload.name as String)
  }

  suspend fun deleteBackup(fileId: String) {
    window.fetch(
      "https://www.googleapis.com/drive/v3/files/$fileId",
      requestInit("DELETE", auth.requireToken()),
    ).await()
  }
}

private class GoogleTokenAuth(
  private val clientId: String,
) {
  private val tokenStorageKey = "tabula.googleDriveAccessToken.$clientId"
  private val tokenExpiryStorageKey = "tabula.googleDriveAccessTokenExpiry.$clientId"
  private val signedIn = MutableStateFlow(false)
  private val label = MutableStateFlow<String?>(null)
  private var accessToken: String? = null
  private var accessTokenExpiryMillis: Long? = null

  val isSignedIn: StateFlow<Boolean> = signedIn.asStateFlow()
  val accountLabel: StateFlow<String?> = label.asStateFlow()

  fun restoreCachedSession(): Boolean {
    if (accessToken != null) return true
    return restoreCachedToken()
  }

  suspend fun ensureSignedIn() {
    if (hasUsableToken()) return
    if (restoreCachedToken()) return
    applyTokenResponse(requestToken())
  }

  suspend fun requireToken(): String {
    ensureSignedIn()
    return accessToken ?: error("No access token available")
  }

  private suspend fun requestToken(prompt: String? = null): dynamic = Promise<dynamic> { resolve, reject ->
      val google = js("window.google")
      if (google == undefined) {
        reject(Throwable("Google Identity Services script is not loaded"))
        return@Promise
      }
      val config = js("({})")
      config.client_id = clientId
      config.scope = "https://www.googleapis.com/auth/drive.appdata"
      config.callback = { response: dynamic ->
        if (response != null && response.access_token != undefined) {
          resolve(response)
        } else if (response != null && response.error != undefined) {
          val description = response.error_description as? String
          val code = response.error as? String
          reject(Throwable(description ?: code ?: "Failed to acquire Google access token"))
        } else {
          reject(Throwable("Missing access token"))
        }
      }
      if (prompt != null) {
        config.prompt = prompt
      }
      val client = google.accounts.oauth2.initTokenClient(config)
      if (prompt != null) {
        val overrideConfig = js("({})")
        overrideConfig.prompt = prompt
        client.requestAccessToken(overrideConfig)
      } else {
        client.requestAccessToken()
      }
    }.await()

  private fun applyTokenResponse(tokenResponse: dynamic) {
    val token = tokenResponse.access_token as String
    accessToken = token
    accessTokenExpiryMillis = (js("Date.now()").unsafeCast<Double>().toLong()) +
      ((tokenResponse.expires_in as? Number)?.toLong()?.times(1000) ?: DEFAULT_ACCESS_TOKEN_TTL_MILLIS)
    signedIn.value = true
    label.value = "Google Drive"
    window.localStorage.setItem(tokenStorageKey, token)
    window.localStorage.setItem(tokenExpiryStorageKey, accessTokenExpiryMillis.toString())
  }

  private fun restoreCachedToken(): Boolean {
    val cachedToken = window.localStorage.getItem(tokenStorageKey) ?: return false
    val expiry = window.localStorage.getItem(tokenExpiryStorageKey)?.toLongOrNull()
    if (expiry == null || expiry <= js("Date.now()").unsafeCast<Double>().toLong()) {
      clearCachedToken()
      return false
    }
    accessToken = cachedToken
    accessTokenExpiryMillis = expiry
    signedIn.value = true
    label.value = "Google Drive"
    return true
  }

  private fun hasUsableToken(): Boolean {
    val token = accessToken ?: return false
    val expiry = accessTokenExpiryMillis ?: return false
    val now = js("Date.now()").unsafeCast<Double>().toLong()
    if (expiry <= now) {
      accessToken = null
      accessTokenExpiryMillis = null
      clearCachedToken()
      return false
    }
    if (token.isBlank()) {
      clearCachedToken()
      return false
    }
    return true
  }

  private fun clearCachedToken() {
    accessToken = null
    accessTokenExpiryMillis = null
    window.localStorage.removeItem(tokenStorageKey)
    window.localStorage.removeItem(tokenExpiryStorageKey)
  }

  private companion object {
    const val DEFAULT_ACCESS_TOKEN_TTL_MILLIS = 3_600_000L
  }
}

private class BrowserDatabaseCache(
  private val key: String,
) {
  private val fallbackKey = "$key.base64"

  suspend fun readBytes(): ByteArray? = if (isOpfsSupported()) readOpfsBytes() else readIndexedDbBytes()

  suspend fun writeBytes(bytes: ByteArray) {
    if (!isOpfsSupported() || !writeOpfsBytes(bytes)) {
      writeIndexedDbBytes(bytes)
    }
  }

  private fun isOpfsSupported(): Boolean {
    val storage = js("navigator.storage")
    return storage != undefined && storage.getDirectory != undefined
  }

  private suspend fun readOpfsBytes(): ByteArray? = runCatching {
    val storage = js("navigator.storage")
    if (storage == undefined || storage.getDirectory == undefined) {
      null
    } else {
      val root = storage.getDirectory().unsafeCast<Promise<dynamic>>().await()
      val handle = root.getFileHandle(key).unsafeCast<Promise<dynamic>>().await()
      val file = handle.getFile().unsafeCast<Promise<dynamic>>().await()
      Uint8Array(file.arrayBuffer().unsafeCast<Promise<dynamic>>().await().unsafeCast<ArrayBuffer>()).toByteArray()
    }
  }.getOrNull()

  private suspend fun writeOpfsBytes(bytes: ByteArray): Boolean = runCatching {
    val storage = js("navigator.storage")
    if (storage == undefined || storage.getDirectory == undefined) {
      false
    } else {
      val root = storage.getDirectory().unsafeCast<Promise<dynamic>>().await()
      val options = js("({ create: true })")
      val handle = root.getFileHandle(key, options).unsafeCast<Promise<dynamic>>().await()
      val writable = handle.createWritable().unsafeCast<Promise<dynamic>>().await()
      writable.write(bytes.toUint8Array()).unsafeCast<Promise<dynamic>>().await()
      writable.close().unsafeCast<Promise<dynamic>>().await()
      true
    }
  }.getOrDefault(false)

  private suspend fun readIndexedDbBytes(): ByteArray? {
    val encoded = window.localStorage.getItem(fallbackKey) ?: return null
    return encoded.base64ToByteArray()
  }

  private suspend fun writeIndexedDbBytes(bytes: ByteArray) {
    window.localStorage.setItem(fallbackKey, bytes.toBase64())
  }
}

private fun requestInit(method: String, token: String, body: dynamic = undefined): RequestInit {
  val headers = js("({})")
  headers.Authorization = "Bearer $token"
  val init = js("({})").unsafeCast<RequestInit>()
  init.asDynamic().method = method
  init.asDynamic().headers = headers
  if (body != undefined) {
    init.asDynamic().body = body
  }
  return init
}

private fun buildBackupName(deviceSuffix: String): String {
  val now = js("new Date().toISOString()").unsafeCast<String>().replace(":", "-").replace(".", "-")
  return "${now}_$deviceSuffix"
}

private fun ByteArray.toUint8Array(): Uint8Array {
  val result = Uint8Array(size)
  forEachIndexed { index, byte -> result.asDynamic()[index] = byte.toInt() and 0xFF }
  return result
}

private fun Uint8Array.toByteArray(): ByteArray {
  val result = ByteArray(length)
  for (index in 0 until length) {
    result[index] = this.asDynamic()[index].unsafeCast<Number>().toByte()
  }
  return result
}

private fun ByteArray.toBase64(): String {
  val chars = CharArray(size) { index -> (this[index].toInt() and 0xFF).toChar() }
  return window.btoa(chars.concatToString())
}

private fun String.base64ToByteArray(): ByteArray {
  val decoded = window.atob(this)
  return ByteArray(decoded.length) { index -> decoded[index].code.toByte() }
}
