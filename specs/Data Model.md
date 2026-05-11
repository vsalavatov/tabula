# Data Model

## Transaction

Each transaction is represented as the following data: date (timestamp), description, a list of transfers.
In general, a single transaction may consist of multiple transfers.

## Transfer

Each transfer is composed of a quantity, a unit, an account from which the transfer is made, and an account to which the transfer is made.

## Quantity

Quantity is just a double precision floating point number. 

Since the operations with floating point numbers are imprecise, it is said that any quantity less than 1e-9 by absolute value is considered negligible, or zero.

## Unit

A Unit representation is a string that specifies the unit of measurement for the quantity. 
It can signify, e.g., a currency like "EUR", "USD", or anything else that is measurable.
A Unit is associated with a mantissa length, i.e., how many decimal places are used to represent the quantity.

## Asset

An Asset is a store of a specific Unit that belongs to an Account. It contains a Quantity of that Unit.

## Account

An Account consists of Assets – pairs of (Quantity, Unit).
An Account can be either in possession by the user, or not.
An Account can be either active or archived. Only empty accounts can be archived. Empty account is an account whose assets have negligible quantities.