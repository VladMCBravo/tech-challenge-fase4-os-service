export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(cpf: string): boolean {
  const cleaned = onlyDigits(cpf);

  if (cleaned.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cleaned)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += Number(cleaned[i]) * (10 - i);
  }

  let remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;
  if (remainder !== Number(cleaned[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(cleaned[i]) * (11 - i);
  }

  remainder = (sum * 10) % 11;
  if (remainder === 10) remainder = 0;

  return remainder === Number(cleaned[10]);
}

export function isValidCnpj(cnpj: string): boolean {
  const cleaned = onlyDigits(cnpj);

  if (cleaned.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleaned)) return false;

  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(cleaned[i]) * weights1[i];
  }

  let remainder = sum % 11;
  const digit1 = remainder < 2 ? 0 : 11 - remainder;
  if (digit1 !== Number(cleaned[12])) return false;

  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += Number(cleaned[i]) * weights2[i];
  }

  remainder = sum % 11;
  const digit2 = remainder < 2 ? 0 : 11 - remainder;

  return digit2 === Number(cleaned[13]);
}

export function isValidDocument(
  document: string,
  documentType: 'CPF' | 'CNPJ',
): boolean {
  if (documentType === 'CPF') return isValidCpf(document);
  return isValidCnpj(document);
}