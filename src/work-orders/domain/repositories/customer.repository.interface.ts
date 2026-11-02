// src/customers/domain/repositories/customer.repository.interface.ts
export interface ICustomerRepository {
  findById(id: string): Promise<any>;
}