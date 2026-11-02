// src/vehicles/domain/repositories/vehicle.repository.interface.ts
export interface IVehicleRepository {
  findById(id: string): Promise<any>;
}