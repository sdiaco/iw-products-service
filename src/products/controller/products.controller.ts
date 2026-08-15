import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ProductsService } from '../service/products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponse, type DataResponse } from './product.response';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(201)
  @ApiCreatedResponse({ type: ProductResponse })
  async create(
    @Body() dto: CreateProductDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DataResponse<ProductResponse>> {
    const product = await this.products.create(dto);
    void reply.header('Location', `/products/${product.productToken}`);
    return { data: ProductResponse.from(product) };
  }
}
