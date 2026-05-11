@file:Suppress("UNCHECKED_CAST_TO_EXTERNAL_INTERFACE")

package dev.salavatov.tabula.shared.db

import app.cash.sqldelight.Query
import app.cash.sqldelight.Transacter
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlCursor
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlPreparedStatement
import kotlinx.coroutines.await
import kotlin.js.Promise

@JsModule("sql.js")
@JsNonModule
private external fun initSqlJs(config: dynamic = definedExternally): Promise<dynamic>

class SqlJsDriver private constructor(
  private val database: dynamic,
) : SqlDriver {
  private val listeners = linkedMapOf<String, MutableSet<Query.Listener>>()
  private var currentTransactionRef: JsTransaction? = null

  companion object {
    suspend fun open(bytes: ByteArray? = null): SqlJsDriver {
      val sql = initSqlJs().await()
      val databaseCtor = sql.Database
      val database = if (bytes != null && bytes.isNotEmpty()) {
        val data = bytes.toUint8Array()
        js("Reflect.construct(databaseCtor, [data])")
      } else {
        js("Reflect.construct(databaseCtor, [])")
      }
      return SqlJsDriver(database)
    }
  }

  override fun <R> executeQuery(
    identifier: Int?,
    sql: String,
    mapper: (SqlCursor) -> QueryResult<R>,
    parameters: Int,
    binders: (SqlPreparedStatement.() -> Unit)?,
  ): QueryResult<R> {
    val bindings = SqlJsPreparedStatement(parameters).apply { binders?.invoke(this) }
    val statement = database.prepare(sql)
    return try {
      statement.bind(bindings.parametersArray())
      mapper(SqlJsCursor(statement))
    } finally {
      statement.free()
    }
  }

  override fun execute(
    identifier: Int?,
    sql: String,
    parameters: Int,
    binders: (SqlPreparedStatement.() -> Unit)?,
  ): QueryResult<Long> {
    val bindings = SqlJsPreparedStatement(parameters).apply { binders?.invoke(this) }
    database.run(sql, bindings.parametersArray())
    return QueryResult.Value(database.getRowsModified().toString().toLongOrNull() ?: 0L)
  }

  override fun newTransaction(): QueryResult<Transacter.Transaction> {
    val enclosing = currentTransactionRef
    if (enclosing == null) {
      database.run("BEGIN TRANSACTION")
    }
    val transaction = JsTransaction(enclosing)
    currentTransactionRef = transaction
    return QueryResult.Value(transaction)
  }

  override fun currentTransaction(): Transacter.Transaction? = currentTransactionRef

  override fun addListener(vararg queryKeys: String, listener: Query.Listener) {
    queryKeys.forEach { key ->
      listeners.getOrPut(key) { linkedSetOf() }.add(listener)
    }
  }

  override fun removeListener(vararg queryKeys: String, listener: Query.Listener) {
    queryKeys.forEach { key -> listeners[key]?.remove(listener) }
  }

  override fun notifyListeners(vararg queryKeys: String) {
    val toNotify = linkedSetOf<Query.Listener>()
    queryKeys.forEach { key -> listeners[key]?.let(toNotify::addAll) }
    toNotify.forEach { it.queryResultsChanged() }
  }

  override fun close() {
    database.close()
  }

  fun exportBytes(): ByteArray = database.export().unsafeCast<org.khronos.webgl.Uint8Array>().toByteArray()

  private inner class JsTransaction(
    override val enclosingTransaction: Transacter.Transaction?,
  ) : Transacter.Transaction() {
    override fun endTransaction(successful: Boolean): QueryResult<Unit> {
      if (enclosingTransaction == null) {
        if (successful) {
          database.run("END TRANSACTION")
        } else {
          database.run("ROLLBACK TRANSACTION")
        }
      }
      currentTransactionRef = enclosingTransaction as JsTransaction?
      return QueryResult.Unit
    }
  }
}

private class SqlJsPreparedStatement(parameterCount: Int) : SqlPreparedStatement {
  private val params = MutableList<dynamic>(parameterCount) { null }

  override fun bindBytes(index: Int, bytes: ByteArray?) {
    params[index] = bytes?.toUint8Array()
  }

  override fun bindLong(index: Int, long: Long?) {
    params[index] = long?.toDouble()
  }

  override fun bindDouble(index: Int, double: Double?) {
    params[index] = double
  }

  override fun bindString(index: Int, string: String?) {
    params[index] = string
  }

  override fun bindBoolean(index: Int, boolean: Boolean?) {
    params[index] = when (boolean) {
      null -> null
      true -> 1
      false -> 0
    }
  }

  fun parametersArray(): Array<dynamic> = params.toTypedArray()
}

private class SqlJsCursor(
  private val statement: dynamic,
) : SqlCursor {
  private var currentRow: dynamic = null

  override fun next(): QueryResult<Boolean> {
    val hasRow = statement.step() as Boolean
    currentRow = if (hasRow) {
      statement.get()
    } else {
      null
    }
    return QueryResult.Value(hasRow)
  }

  override fun getString(index: Int): String? {
    val row = currentRow ?: return null
    return row[index] as? String
  }

  override fun getLong(index: Int): Long? {
    val row = currentRow ?: return null
    val value = row[index] ?: return null
    return when (value) {
      is Number -> value.toLong()
      else -> value.toString().toLongOrNull()
    }
  }

  override fun getBytes(index: Int): ByteArray? {
    val row = currentRow ?: return null
    val value = row[index] ?: return null
    return if (value.asDynamic().constructor?.name == "Uint8Array") {
      value.unsafeCast<org.khronos.webgl.Uint8Array>().toByteArray()
    } else {
      null
    }
  }

  override fun getDouble(index: Int): Double? {
    val row = currentRow ?: return null
    val value = row[index] ?: return null
    return when (value) {
      is Number -> value.toDouble()
      else -> value.toString().toDoubleOrNull()
    }
  }

  override fun getBoolean(index: Int): Boolean? = getLong(index)?.let { it != 0L }
}

private fun ByteArray.toUint8Array(): org.khronos.webgl.Uint8Array {
  val array = org.khronos.webgl.Uint8Array(size)
  forEachIndexed { index, byte -> array.asDynamic()[index] = byte.toInt() and 0xFF }
  return array
}

private fun org.khronos.webgl.Uint8Array.toByteArray(): ByteArray {
  val bytes = ByteArray(length)
  for (index in 0 until length) {
    bytes[index] = this.asDynamic()[index].unsafeCast<Number>().toByte()
  }
  return bytes
}
