export type PromptPayIdentifierType = 'mobile' | 'tax_id' | 'ewallet';

export function normalizePromptPayId(value: string) {
  return value.replace(/[\s-]/g, '');
}

export function getPromptPayIdentifierType(value: string): PromptPayIdentifierType | null {
  const normalized = normalizePromptPayId(value);
  if (/^0\d{9}$/.test(normalized)) return 'mobile';
  if (/^\d{13}$/.test(normalized) && isThaiIdentifierChecksumValid(normalized)) return 'tax_id';
  if (/^\d{15}$/.test(normalized)) return 'ewallet';
  return null;
}

export function isThaiIdentifierChecksumValid(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const total = value.slice(0, 12).split('').reduce((sum, digit, index) => sum + Number(digit) * (13 - index), 0);
  return (11 - (total % 11)) % 10 === Number(value[12]);
}
