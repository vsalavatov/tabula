# Transactions View

This is the main view of the Tabula application. It displays a list of transactions and allows user to add new ones.

## New transaction editor

On top of the view is located the new transaction editor. 
It is 'sticky', meaning it remains visible while scrolling through the transaction list.

It has the following editing fields in order:
* date
* description
* a list of transfers (if there is more than one transfer, it can be added by a button):
  * from account
  * quantity
  * unit
  * to account

## Ergonomic addition

One of the main features in the application is the convenient addition of new transactions. 
Often, there are plenty of transactions that the user wants to add, so it should be possible to do quickly.

### Current behavior

The new transaction editor is keyboard-first and supports forward tabbing through fields.

With one transfer row, `Tab` order is:
* date
* description
* transfer 1 from account
* transfer 1 quantity
* transfer 1 unit
* transfer 1 to account

When there are multiple transfer rows, tabbing continues through the same four transfer fields for each row in order.

Date field typing behavior:
* when the date field receives keyboard/programmatic focus (including initial focus in the composer, and `Shift+Tab` back from description), overwrite cursor starts at the first date character
* overwrite cursor is shown as a one-character block selection over the next date digit that will be replaced
* typing works in overwrite mode: typed digits replace existing date digits at caret position, while separators are skipped automatically
* overwrite cursor advances on every typed digit, even when the typed digit is the same as the existing one
* typed `-` separators are tolerated and ignored for replacement (typing continues at the same overwrite position)
* when the date field is cleared and user types digits only, separators are auto-inserted (`11052026` -> `11-05-2026`)
* when the date field is cleared and user types separators explicitly, that input is also tolerated (`11-05-2026` stays valid)
* when date input is valid and date field is focused, `ArrowUp` steps date to next day and `ArrowDown` steps date to previous day
* when date input is invalid, `ArrowUp`/`ArrowDown` do not change date
* examples:
  * starting from `11-05-2026`, typing `0507` or `05-07` results in `05-07-2026`
  * starting from `11-05-2026`, typing `1104` results in `11-04-2026`

`from account`, `unit`, and `to account` fields are searchable dropdowns:
* while user types, options are filtered by case-insensitive substring match
* on forward `Tab`, if typed text points to a different first filtered option, that option is applied before focus moves on
* on `Enter`, if typed text points to a different first filtered option, that option is applied and the key press is consumed (no transaction save)

Transaction save via keyboard:
* pressing `Enter` in any field saves the transaction draft
* exception: in searchable dropdown fields, when `Enter` is used to apply a typed candidate as described above, it does not save

After successful save, editor is reset for the next entry and focus returns to the date field.


## Infinite scrolling support

The transaction list supports infinite scrolling, allowing users to view all transactions without pagination.
The displayed slice is updated dynamically as the user scrolls, ensuring a seamless experience.
