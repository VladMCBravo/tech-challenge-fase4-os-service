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
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiOperation({ summary: 'Cria um novo serviço' })
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lista todos os serviços' })
  findAll() {
    return this.servicesService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Lista os serviços ativos' })
  findActive() {
    return this.servicesService.findActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Busca um serviço por ID' })
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualiza um serviço' })
  update(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
  ) {
    return this.servicesService.update(id, updateServiceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Inativa um serviço' })
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }
}