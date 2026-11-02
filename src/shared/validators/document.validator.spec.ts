import {
  isValidCnpj,
  isValidCpf,
  isValidDocument,
  onlyDigits,
} from './document.validator';

describe('document.validator', () => {
  describe('onlyDigits', () => {
    it('deve remover caracteres não numéricos', () => {
      expect(onlyDigits('529.982.247-25')).toBe('52998224725');
      expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181');
    });
  });

  describe('isValidCpf', () => {
    it('deve validar um CPF válido', () => {
      expect(isValidCpf('52998224725')).toBe(true);
      expect(isValidCpf('529.982.247-25')).toBe(true);
    });

    it('deve rejeitar CPF inválido', () => {
      expect(isValidCpf('52998224724')).toBe(false);
      expect(isValidCpf('11111111111')).toBe(false);
      expect(isValidCpf('123')).toBe(false);
    });
  });

  describe('isValidCnpj', () => {
    it('deve validar um CNPJ válido', () => {
      expect(isValidCnpj('11222333000181')).toBe(true);
      expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    });

    it('deve rejeitar CNPJ inválido', () => {
      expect(isValidCnpj('11222333000180')).toBe(false);
      expect(isValidCnpj('11111111111111')).toBe(false);
      expect(isValidCnpj('123')).toBe(false);
    });
  });

  describe('isValidDocument', () => {
    it('deve validar CPF conforme tipo', () => {
      expect(isValidDocument('52998224725', 'CPF')).toBe(true);
    });

    it('deve validar CNPJ conforme tipo', () => {
      expect(isValidDocument('11222333000181', 'CNPJ')).toBe(true);
    });

    it('deve rejeitar documento inválido para o tipo informado', () => {
      expect(isValidDocument('52998224724', 'CPF')).toBe(false);
      expect(isValidDocument('11222333000180', 'CNPJ')).toBe(false);
    });
  });
});