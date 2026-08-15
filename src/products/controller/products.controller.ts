import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ProductsService } from '../service/products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQuery } from './dto/list-products.query';
import { ProductTokenParam } from './dto/product-token.param';
import { ProductResponse, type DataResponse, type PagedResponse } from './product.response';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOkResponse({ type: ProductResponse, isArray: true })
  async list(@Query() query: ListProductsQuery): Promise<PagedResponse<ProductResponse>> {
    const page = await this.products.list(query.page, query.size);
    return { data: page.items.map((p) => ProductResponse.from(p)), meta: page.meta };
  }

  @Get(':productToken')
  @ApiOkResponse({ type: ProductResponse })
  async get(@Param() params: ProductTokenParam): Promise<DataResponse<ProductResponse>> {
    return { data: ProductResponse.from(await this.products.get(params.productToken)) };
  }

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
