import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '../generated/prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  isValidDocument,
  onlyDigits,
} from '../shared/validators/document.validator';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    const normalizedDocument = onlyDigits(createCustomerDto.document);

    this.validateDocument(
      normalizedDocument,
      createCustomerDto.documentType,
    );

    const existingCustomer = await this.prisma.customer.findUnique({
      where: {
        document: normalizedDocument,
      },
    });

    if (existingCustomer) {
      throw new BadRequestException(
        'Já existe um cliente cadastrado com este documento.',
      );
    }

    return this.prisma.customer.create({
      data: {
        name: createCustomerDto.name,
        documentType: createCustomerDto.documentType,
        document: normalizedDocument,
        phone: createCustomerDto.phone,
        email: createCustomerDto.email,
      },
    });
  }

  async findAll() {
    return this.prisma.customer.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return customer;
  }

  async findByDocument(document: string) {
    const normalizedDocument = onlyDigits(document);

    const customer = await this.prisma.customer.findUnique({
      where: {
        document: normalizedDocument,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    return customer;
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    await this.ensureCustomerExists(id);

    let normalizedDocument: string | undefined = undefined;

    if (updateCustomerDto.document) {
      normalizedDocument = onlyDigits(updateCustomerDto.document);
    }

    const currentCustomer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!currentCustomer) {
      throw new NotFoundException('Cliente não encontrado.');
    }

    const finalDocumentType =
      updateCustomerDto.documentType ?? currentCustomer.documentType;
    const finalDocument = normalizedDocument ?? currentCustomer.document;

    if (updateCustomerDto.document || updateCustomerDto.documentType) {
      this.validateDocument(finalDocument, finalDocumentType);
    }

    if (normalizedDocument && normalizedDocument !== currentCustomer.document) {
      const existingCustomer = await this.prisma.customer.findUnique({
        where: {
          document: normalizedDocument,
        },
      });

      if (existingCustomer && existingCustomer.id !== id) {
        throw new BadRequestException(
          'Já existe um cliente cadastrado com este documento.',
        );
      }
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        name: updateCustomerDto.name,
        documentType: updateCustomerDto.documentType,
        document: normalizedDocument,
        phone: updateCustomerDto.phone,
        email: updateCustomerDto.email,
      },
    });
  }

  async remove(id: string) {
    await this.ensureCustomerExists(id);

    return this.prisma.customer.update({
      where: { id },
      data: {
        isActive: false,
      },
    });
  }

  private validateDocument(
    document: string,
    documentType: DocumentType,
  ): void {
    if (!isValidDocument(document, documentType)) {
      throw new BadRequestException('Documento inválido para o tipo informado.');
    }
  }

  private async ensureCustomerExists(id: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer) {
      throw new NotFoundException('Cliente não encontrado.');
    }
  }
}