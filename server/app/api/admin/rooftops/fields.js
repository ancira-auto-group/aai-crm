import { str } from '../../../../lib/http.js';

/**
 * Store details from the Rooftops form. For an update, fields left out keep their current value.
 */
export function storeFields(body, existing = {}) {
  const field = (key, column, label, max) => (body[key] === undefined
    ? (existing[column] ?? null)
    : (str(body[key], { field: label, max }) || null));
  return {
    fullName: field('fullName', 'full_name', 'Full name', 150),
    address: field('address', 'address', 'Address', 200),
    phone: field('phone', 'phone', 'Phone', 40),
    hours: field('hours', 'hours', 'Hours', 300)
  };
}
