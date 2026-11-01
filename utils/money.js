// Money compared in whole cents, so 0.1 + 0.2 never makes an exact payment look
// "more than the remaining". Use it for every > / < check on amounts.
const cents = (x) => Math.round(Number(x || 0) * 100);

// Largest amount the NUMERIC(12,2) money columns can hold.
export const MAX_MONEY = 9999999999.99;

export default cents;
