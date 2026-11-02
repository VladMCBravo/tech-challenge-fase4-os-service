export function normalizePlate(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function isValidVehiclePlate(plate: string): boolean {
  const normalized = normalizePlate(plate);

  const oldPattern = /^[A-Z]{3}[0-9]{4}$/;
  const mercosulPattern = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

  return oldPattern.test(normalized) || mercosulPattern.test(normalized);
}