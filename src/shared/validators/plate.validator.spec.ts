import {
  isValidVehiclePlate,
  normalizePlate,
} from './plate.validator';

describe('plate.validator', () => {
  describe('normalizePlate', () => {
    it('deve normalizar a placa removendo separadores e colocando em maiúsculo', () => {
      expect(normalizePlate('abc1d23')).toBe('ABC1D23');
      expect(normalizePlate('abc-1234')).toBe('ABC1234');
    });
  });

  describe('isValidVehiclePlate', () => {
    it('deve validar placa no padrão antigo', () => {
      expect(isValidVehiclePlate('ABC1234')).toBe(true);
      expect(isValidVehiclePlate('ABC-1234')).toBe(true);
    });

    it('deve validar placa Mercosul', () => {
      expect(isValidVehiclePlate('ABC1D23')).toBe(true);
      expect(isValidVehiclePlate('abc1d23')).toBe(true);
    });

    it('deve rejeitar placa inválida', () => {
      expect(isValidVehiclePlate('1234567')).toBe(false);
      expect(isValidVehiclePlate('AB12345')).toBe(false);
      expect(isValidVehiclePlate('AAAAAAA')).toBe(false);
    });
  });
});