import { PartialType } from '@nestjs/swagger';
import { CreateWorkOrderPartItemDto } from './create-work-order-part-item.dto';

export class UpdateWorkOrderPartItemDto extends PartialType(
  CreateWorkOrderPartItemDto,
) {}