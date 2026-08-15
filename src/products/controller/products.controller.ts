import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ProductsService } from '../service/products.service';
import { IdempotencyKey } from './idempotency.decorator';
import { CreateProductDto } from './dto/create-product';
import { ListProductsQuery } from './dto/list-products';
import { ProductTokenParam } from './dto/product-token';
import { UpdateStockDto } from './dto/update-stock';
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

  @Delete(':productToken')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(@Param() params: ProductTokenParam): Promise<void> {
    await this.products.remove(params.productToken);
  }

  @Patch(':productToken/stock')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: ProductResponse })
  async changeStock(
    @Param() params: ProductTokenParam,
    @Body() dto: UpdateStockDto,
    @IdempotencyKey() idempotencyKey: string,
  ): Promise<DataResponse<ProductResponse>> {
    const product = await this.products.changeStock(params.productToken, dto.delta, idempotencyKey);
    return { data: ProductResponse.from(product) };
  }
}
