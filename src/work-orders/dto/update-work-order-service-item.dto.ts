import { PartialType } from '@nestjs/swagger';
import { CreateWorkOrderServiceItemDto } from './create-work-order-service-item.dto';

export class UpdateWorkOrderServiceItemDto extends PartialType(
  CreateWorkOrderServiceItemDto,
) {}