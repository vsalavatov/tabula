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

When the transactions view is opened, the focus is placed on the date field of the new transaction editor.



## Infinite scrolling support

The transaction list supports infinite scrolling, allowing users to view all transactions without pagination.
The displayed slice is updated dynamically as the user scrolls, ensuring a seamless experience.