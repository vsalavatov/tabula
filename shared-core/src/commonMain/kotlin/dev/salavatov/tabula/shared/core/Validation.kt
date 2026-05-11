package dev.salavatov.tabula.shared.core

data class ValidationResult(
  val isValid: Boolean,
  val errors: Map<String, String> = emptyMap(),
) {
  companion object {
    fun valid() = ValidationResult(isValid = true)
    fun invalid(errors: Map<String, String>) = ValidationResult(isValid = false, errors = errors)
  }
}

object UnitFormValidator {
  fun validate(name: String, symbol: String, mantissaLength: Int?): ValidationResult {
    val errors = mutableMapOf<String, String>()
    if (name.isBlank()) errors["name"] = "Name is required"
    if (symbol.isBlank()) errors["symbol"] = "Symbol is required"
    if (mantissaLength == null) {
      errors["mantissaLength"] = "Mantissa length is required"
    } else if (mantissaLength < 0) {
      errors["mantissaLength"] = "Mantissa length cannot be negative"
    }
    return if (errors.isEmpty()) ValidationResult.valid() else ValidationResult.invalid(errors)
  }
}

object TransferFormValidator {
  fun validate(
    fromAccountId: Long?,
    toAccountId: Long?,
    unitId: Long?,
    quantity: Double?,
  ): ValidationResult {
    val errors = mutableMapOf<String, String>()
    if (fromAccountId == null) errors["fromAccount"] = "Source account is required"
    if (toAccountId == null) errors["toAccount"] = "Destination account is required"
    if (unitId == null) errors["unit"] = "Unit is required"
    if (quantity == null) {
      errors["quantity"] = "Quantity is required"
    } else if (quantity <= 0) {
      errors["quantity"] = "Quantity must be positive"
    }
    if (fromAccountId != null && toAccountId != null && fromAccountId == toAccountId) {
      errors["accounts"] = "Source and destination accounts must be different"
    }
    return if (errors.isEmpty()) ValidationResult.valid() else ValidationResult.invalid(errors)
  }
}

object TransactionFormValidator {
  fun validate(description: String, hasTransfers: Boolean): ValidationResult {
    val errors = mutableMapOf<String, String>()
    if (description.isBlank()) errors["description"] = "Description is required"
    if (!hasTransfers) errors["transfers"] = "At least one transfer is required"
    return if (errors.isEmpty()) ValidationResult.valid() else ValidationResult.invalid(errors)
  }
}
