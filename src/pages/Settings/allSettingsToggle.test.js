import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  getAppSettings,
  saveAppSettings,
  resetAppSettings,
  APP_SETTINGS_UPDATED_EVENT,
} from '../../services/appSettingsStorage.js';

// Mock localStorage and window for Node environment
if (typeof globalThis.window === 'undefined') {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
      clear: () => storage.clear(),
    },
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

test('All General settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const generalToggles = [
    'enableGstin',
    'stopSaleOnNegativeStock',
    'blockNewItemsFromTxn',
    'blockNewPartiesFromTxn',
    'enableEstimateQuotation',
    'enableProformaInvoice',
    'enableSalePurchaseOrder',
    'enableOtherIncome',
    'enableFixedAssets',
    'enableDeliveryChallan',
    'goodsReturnOnDeliveryChallan',
    'printAmountInDeliveryChallan',
    'multiFirmEnabled',
    'godownManagementEnabled',
    'autoBackup',
    'auditTrail',
  ];

  for (const key of generalToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    // Toggle opposite
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    // Toggle back to initial
    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
    assert.strictEqual(getAppSettings()[key], initial, `Failed to retrieve restored ${key}`);
  }
});

test('All Transaction settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const txnToggles = [
    'enableInvoiceBillNo',
    'addTimeOnTransactions',
    'cashSaleByDefault',
    'billingNameOfParties',
    'customerPoDetails',
    'inclusiveTaxOnRate',
    'displayPurchasePriceOfItems',
    'showLast5SalePrice',
    'showLast5PurchasePrice',
    'enableFreeItemQuantity',
    'enableItemCount',
    'enableEwayBillNo',
    'enableQuickEntry',
    'doNotShowInvoicePreview',
    'enableRepeatInvoices',
    'passcodeForTxnEditDelete',
    'discountDuringPayments',
    'linkPaymentsToInvoices',
    'dueDatesAndPaymentTerms',
    'showProfitWhileMakingSaleInvoice',
    'showWholesalePriceToggle',
    'enableTermsAndConditions',
    'roundOffTotal',
    'roundOffTransaction',
    'enableTransactionDiscount',
    'enableItemDiscount',
  ];

  for (const key of txnToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Party settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const partyToggles = [
    'enablePartyGrouping',
    'enableShippingAddress',
    'printShippingAddress',
    'managePartyStatus',
    'enablePaymentReminder',
    'enableCreditLimitWarning',
    'enableLoyaltyPoints',
  ];

  for (const key of partyToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Item settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const itemToggles = [
    'enableBarcodeScanning',
    'enableItemCategory',
    'enableItemDescription',
    'enableBatchTracking',
    'enableSerialTracking',
  ];

  for (const key of itemToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Taxes & GST settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const taxToggles = [
    'enableGst',
    'enableHsnSacCode',
    'additionalCessOnItem',
    'reverseCharge',
    'reverseChargeApplicable',
    'enablePlaceOfSupply',
    'compositeScheme',
    'enableTcs',
    'enableTds',
  ];

  for (const key of taxToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Service Reminders settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const reminderToggles = [
    'serviceRemindersEnabled',
    'serviceRemindersAutoWhatsApp',
  ];

  for (const key of reminderToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Transaction Message settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const msgToggles = [
    'sendSmsOnSale',
    'sendWhatsappOnSale',
    'txnMsgSendToParty',
    'txnMsgSendUpdateMessage',
    'txnMsgSendCopyToSelf',
    'txnMsgAutoShareUSKNetwork',
    'txnMsgIncludePartyBalance',
    'txnMsgIncludeWebInvoiceLink',
    'txnMsgIncludePaymentLink',
    'txnMsgAutoSales',
    'txnMsgAutoPurchase',
    'txnMsgAutoSalesReturn',
    'txnMsgAutoPurchaseReturn',
    'txnMsgAutoPaymentIn',
    'txnMsgAutoPaymentOut',
    'txnMsgAutoSaleOrder',
    'txnMsgAutoPurchaseOrder',
    'txnMsgAutoEstimate',
    'txnMsgAutoProformaInvoice',
    'txnMsgAutoDeliveryChallan',
    'txnMsgAutoCancelledInvoice',
  ];

  for (const key of msgToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});

test('All Print settings toggles switch state and persist correctly', () => {
  resetAppSettings();
  const printToggles = [
    'makeRegularPrinterDefault',
    'printRepeatHeader',
    'printCompanyName',
    'printCompanyLogo',
    'printAddress',
    'printEmail',
    'printPhoneNumber',
    'printGstinOnSale',
    'printOriginalDuplicate',
    'expandTableWholePage',
    'printTotalItemQty',
    'printAmountWithDecimal',
    'printReceivedAmount',
    'printBalanceAmount',
    'printCurrentBalanceParty',
    'printTaxDetails',
    'printYouSaved',
    'printAmountWithGrouping',
    'printDescription',
    'printTermsAndConditions',
    'printReceivedByDetails',
    'printDeliveredByDetails',
    'printSignature',
    'printPaymentMode',
    'printAcknowledgement',
    'printBankDetails',
    'printGstSummary',
  ];

  for (const key of printToggles) {
    const initial = Boolean(DEFAULT_SETTINGS[key]);
    
    const toggled = saveAppSettings({ [key]: !initial });
    assert.strictEqual(toggled[key], !initial, `Failed to toggle ${key} to ${!initial}`);
    assert.strictEqual(getAppSettings()[key], !initial, `Failed to retrieve persisted ${key}`);

    const restored = saveAppSettings({ [key]: initial });
    assert.strictEqual(restored[key], initial, `Failed to restore ${key} to ${initial}`);
  }
});
