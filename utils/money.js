// Money compared in whole cents, so 0.1 + 0.2 never makes an exact payment look
// "more than the remaining". Use it for every > / < check on amounts.
const cents = (x) => Math.round(Number(x || 0) * 100);

// Round to the currency's smallest unit: IQD has no fils in practice (whole dinars), other currencies keep cents.
export const WHOLE_UNIT_CURRENCIES = ['IQD'];
export const roundMoney = (x, currency) =>
    WHOLE_UNIT_CURRENCIES.includes(currency) ? Math.round(Number(x || 0)) : Math.round(Number(x || 0) * 100) / 100;

// Largest amount the NUMERIC(12,2) money columns can hold.
export const MAX_MONEY = 9999999999.99;

export default cents;
