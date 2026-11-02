import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehiclesService } from './vehicles.service';

@ApiTags('Vehicles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo veículo' })
  create(@Body() createVehicleDto: CreateVehicleDto) {
    return this.vehiclesService.create(createVehicleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os veículos' })
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Get('plate/:plate')
  @ApiOperation({ summary: 'Busca um veículo por placa' })
  findByPlate(@Param('plate') plate: string) {
    return this.vehiclesService.findByPlate(plate);
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Lista veículos por cliente' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.vehiclesService.findByCustomer(customerId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um veículo por ID' })
  findOne(@Param('id') id: string) {
    return this.vehiclesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza um veículo' })
  update(
    @Param('id') id: string,
    @Body() updateVehicleDto: UpdateVehicleDto,
  ) {
    return this.vehiclesService.update(id, updateVehicleDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativa um veículo' })
  remove(@Param('id') id: string) {
    return this.vehiclesService.remove(id);
  }
}