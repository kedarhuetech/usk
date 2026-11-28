const PREFIX = "ledgerly:";

export const transactionStorageKeys = Object.freeze({
  sales: `${PREFIX}saleInvoices.v1`,
  purchases: `${PREFIX}purchaseBills.v1`,
  paymentIns: `${PREFIX}paymentIns.v1`,
  paymentOuts: `${PREFIX}paymentOuts.v1`,
  saleOrders: `${PREFIX}saleOrders.v1`,
  purchaseOrders: `${PREFIX}purchaseOrders.v1`,
  saleInvoiceUi: `${PREFIX}saleInvoiceUiActions.v1`,
  expenses: `${PREFIX}expenses.v1`,
  expenseCategories: `${PREFIX}expenseCategories.v1`,
  expenseItems: `${PREFIX}expenseItems.v1`,
});
