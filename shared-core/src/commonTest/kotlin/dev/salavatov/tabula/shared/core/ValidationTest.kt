package dev.salavatov.tabula.shared.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ValidationTest {
  @Test
  fun transferValidationRejectsSameAccount() {
    val result = TransferFormValidator.validate(
      fromAccountId = 1L,
      toAccountId = 1L,
      unitId = 2L,
      quantity = 10.0,
    )

    assertFalse(result.isValid)
    assertTrue("accounts" in result.errors)
  }

  @Test
  fun unitValidationAcceptsNormalInput() {
    val result = UnitFormValidator.validate(
      name = "Euro",
      symbol = "EUR",
      mantissaLength = 2,
    )

    assertTrue(result.isValid)
  }
}
