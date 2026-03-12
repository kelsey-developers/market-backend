export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Market Backend API',
    version: '1.0.0',
    description: 'Full REST API for market-backend: health, product categories, products, suppliers, inventory (balances, dataset, warehouses, allocations, movements), purchase orders (CRUD + receive), goods receipt attachments, units (listings), and bookings. Use /docs for Swagger UI, /openapi.json for the raw spec.',
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local development' },
    { url: 'https://{tunnel}.trycloudflare.com', description: 'Cloudflare tunnel', variables: { tunnel: { default: 'your-tunnel-subdomain' } } },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Product Categories' },
    { name: 'Products' },
    { name: 'Suppliers' },
    { name: 'Inventory' },
    { name: 'Purchase Orders' },
    { name: 'Damage Incidents' },
    { name: 'Goods Receipts' },
    { name: 'Units' },
    { name: 'Bookings' },
  ],
  paths: {
    '/': {
      get: {
        tags: ['Health'],
        summary: 'Root',
        description: 'Returns service name. Use /health for health check.',
        responses: { 200: { description: 'Service running', content: { 'application/json': { schema: { type: 'object', properties: { message: { type: 'string', example: 'market-backend is running' } } } } } } },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['Health'],
        summary: 'OpenAPI spec',
        description: 'Returns this OpenAPI 3.0.3 document as JSON.',
        responses: { 200: { description: 'OpenAPI JSON' } },
      },
    },
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: { 200: { description: 'Service is healthy' } },
      },
    },
    '/health/ready': {
      get: {
        tags: ['Health'],
        summary: 'Readiness (service + DB)',
        responses: {
          200: { description: 'Ready' },
          503: { description: 'DB unreachable' },
        },
      },
    },
    '/api/product-categories': {
      get: {
        tags: ['Product Categories'],
        summary: 'List categories',
        responses: { 200: { description: 'List of categories' } },
      },
      post: {
        tags: ['Product Categories'],
        summary: 'Create category',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code', 'name'],
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Category created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/product-categories/{id}': {
      patch: {
        tags: ['Product Categories'],
        summary: 'Update category',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/products': {
      get: {
        tags: ['Products'],
        summary: 'List products',
        responses: { 200: { description: 'List of products' } },
      },
      post: {
        tags: ['Products'],
        summary: 'Create product',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sku', 'name', 'unit'],
                properties: {
                  sku: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  unit: { type: 'string' },
                  itemType: { type: 'string', enum: ['consumable', 'non_consumable'] },
                  reorderLevel: { type: 'integer', minimum: 0 },
                  supplierId: { type: 'string' },
                  categoryId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Product created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/products/{id}': {
      patch: {
        tags: ['Products'],
        summary: 'Update product',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sku: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  unit: { type: 'string' },
                  itemType: { type: 'string', enum: ['consumable', 'non_consumable'] },
                  reorderLevel: { type: 'integer', minimum: 0 },
                  supplierId: { type: 'string' },
                  categoryId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/suppliers': {
      get: {
        tags: ['Suppliers'],
        summary: 'List suppliers',
        responses: { 200: { description: 'List of suppliers' } },
      },
      post: {
        tags: ['Suppliers'],
        summary: 'Create supplier',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string' },
                  contactName: { type: 'string' },
                  contactEmail: { type: 'string', format: 'email' },
                  contactPhone: { type: 'string' },
                  address: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Supplier created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/suppliers/{id}': {
      patch: {
        tags: ['Suppliers'],
        summary: 'Update supplier',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  contactName: { type: 'string' },
                  contactEmail: { type: 'string', format: 'email' },
                  contactPhone: { type: 'string' },
                  address: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/inventory': {
      get: {
        tags: ['Inventory'],
        summary: 'List inventory balances',
        responses: { 200: { description: 'List of balances by product/warehouse' } },
      },
    },
    '/api/inventory/dataset': {
      get: {
        tags: ['Inventory'],
        summary: 'Get inventory dashboard dataset',
        responses: {
          200: {
            description: 'Dataset payload used by inventory frontend',
          },
        },
      },
    },
    '/api/inventory/warehouses': {
      post: {
        tags: ['Inventory'],
        summary: 'Create warehouse',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'Receiving Warehouse' },
                  location: { type: 'string', example: 'B1 Service Area' },
                  code: { type: 'string', example: 'RCV' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Warehouse created' },
          400: { description: 'Validation error' },
        },
      },
    },
    '/api/inventory/warehouses/{id}': {
      patch: {
        tags: ['Inventory'],
        summary: 'Update warehouse',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  location: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/inventory/allocations': {
      post: {
        tags: ['Inventory'],
        summary: 'Create or update allocation (product ↔ unit)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'unitId', 'quantityDelta'],
                properties: {
                  productId: { type: 'string' },
                  unitId: { type: 'string' },
                  quantityDelta: { type: 'integer' },
                  minStock: { type: 'integer', minimum: 0 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Allocation updated' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/inventory/movements': {
      post: {
        tags: ['Inventory'],
        summary: 'Record stock movement (IN / OUT / ADJUSTMENT)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['productId', 'warehouseId', 'type', 'quantity'],
                properties: {
                  productId: { type: 'string' },
                  warehouseId: { type: 'string' },
                  type: { type: 'string', enum: ['IN', 'OUT', 'ADJUSTMENT'] },
                  quantity: { type: 'integer', minimum: 1 },
                  reason: { type: 'string' },
                  referenceType: { type: 'string', enum: ['purchase_order', 'goods_receipt', 'booking', 'damage_incident', 'manual_adjustment'] },
                  referenceId: { type: 'string' },
                  purchaseOrderId: { type: 'string' },
                  goodsReceiptId: { type: 'string' },
                  bookingId: { type: 'string' },
                  damageIncidentId: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Movement recorded' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/purchase-orders': {
      get: {
        tags: ['Purchase Orders'],
        summary: 'List purchase orders',
        responses: { 200: { description: 'List of POs with supplier and items' } },
      },
      post: {
        tags: ['Purchase Orders'],
        summary: 'Create purchase order',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['supplierId', 'items'],
                properties: {
                  supplierId: { type: 'string' },
                  notes: { type: 'string' },
                  items: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['productId', 'quantityOrdered'],
                      properties: {
                        productId: { type: 'string' },
                        quantityOrdered: { type: 'integer', minimum: 1 },
                        unitCost: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'PO created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/purchase-orders/{id}': {
      get: {
        tags: ['Purchase Orders'],
        summary: 'Get purchase order by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'PO with supplier, items, and receipts' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Purchase Orders'],
        summary: 'Update purchase order',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  supplierId: { type: 'string' },
                  status: { type: 'string', enum: ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'] },
                  expectedDelivery: { type: 'string' },
                  notes: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/purchase-orders/{id}/receive': {
      post: {
        tags: ['Purchase Orders', 'Goods Receipts'],
        summary: 'Create goods receipt from purchase order',
        description: 'Primary goods receipt creation endpoint. Receives PO items, creates a GoodsReceipt + GoodsReceiptItems, updates inventory balances, creates stock movements, and updates PO status.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['warehouseId', 'items'],
                properties: {
                  warehouseId: { type: 'string' },
                  receivedByUserId: { type: 'string' },
                  notes: { type: 'string' },
                  items: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['productId', 'quantityReceived'],
                      properties: {
                        productId: { type: 'string' },
                        quantityReceived: { type: 'integer', minimum: 1 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Goods receipt created and PO updated.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    purchaseOrder: { type: 'object' },
                    goodsReceipt: { type: 'object' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation or business rule error' },
          404: { description: 'Purchase order not found' },
        },
      },
    },
    '/api/damage-incidents': {
      get: {
        tags: ['Damage Incidents'],
        summary: 'List damage incidents',
        parameters: [
          { name: 'unitId', in: 'query', schema: { type: 'string' } },
          { name: 'bookingId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'charged_to_guest', 'absorbed', 'settled'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'List of damage incidents' } },
      },
      post: {
        tags: ['Damage Incidents'],
        summary: 'Create damage incident',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['unitId', 'description', 'cost'],
                properties: {
                  bookingId: { type: 'string' },
                  unitId: { type: 'string' },
                  reportedByUserId: { type: 'string' },
                  resolvedByUserId: { type: 'string' },
                  reportedAt: { type: 'string', format: 'date-time' },
                  resolvedAt: { type: 'string', format: 'date-time' },
                  description: { type: 'string' },
                  resolutionNotes: { type: 'string' },
                  cost: { type: 'number' },
                  chargedToGuest: { type: 'number' },
                  absorbedAmount: { type: 'number' },
                  status: { type: 'string', enum: ['open', 'charged_to_guest', 'absorbed', 'settled'] },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Damage incident created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/damage-incidents/{id}': {
      get: {
        tags: ['Damage Incidents'],
        summary: 'Get damage incident by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Damage incident details' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Damage Incidents'],
        summary: 'Update damage incident',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  bookingId: { type: 'string', nullable: true },
                  unitId: { type: 'string' },
                  reportedByUserId: { type: 'string', nullable: true },
                  resolvedByUserId: { type: 'string', nullable: true },
                  reportedAt: { type: 'string', format: 'date-time' },
                  resolvedAt: { type: 'string', format: 'date-time', nullable: true },
                  description: { type: 'string' },
                  resolutionNotes: { type: 'string', nullable: true },
                  cost: { type: 'number' },
                  chargedToGuest: { type: 'number' },
                  absorbedAmount: { type: 'number' },
                  status: { type: 'string', enum: ['open', 'charged_to_guest', 'absorbed', 'settled'] },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Damage incident updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/damage-incidents/{id}/attachments': {
      get: {
        tags: ['Damage Incidents'],
        summary: 'List damage incident attachments',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of attachments' }, 404: { description: 'Not found' } },
      },
      post: {
        tags: ['Damage Incidents'],
        summary: 'Upload damage incident images',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                  },
                },
                required: ['files'],
              },
            },
          },
        },
        responses: { 201: { description: 'Attachments uploaded' }, 400: { description: 'Validation error' }, 404: { description: 'Damage incident not found' } },
      },
    },
    '/api/damage-incidents/attachments/{attachmentId}/content': {
      get: {
        tags: ['Damage Incidents'],
        summary: 'Get damage attachment content',
        parameters: [{ name: 'attachmentId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 302: { description: 'Redirects to attachment URL' }, 404: { description: 'Attachment not found' } },
      },
    },
    '/api/goods-receipts/{id}/attachments': {
      post: {
        tags: ['Goods Receipts'],
        summary: 'Upload goods receipt images',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  files: {
                    type: 'array',
                    items: { type: 'string', format: 'binary' },
                  },
                },
                required: ['files'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Attachments uploaded' },
          400: { description: 'Validation error' },
          404: { description: 'Goods receipt not found' },
        },
      },
    },
    '/api/goods-receipts/attachments/{attachmentId}/content': {
      get: {
        tags: ['Goods Receipts'],
        summary: 'Get attachment image content',
        parameters: [
          {
            name: 'attachmentId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: { description: 'Image bytes' },
          404: { description: 'Attachment not found' },
        },
      },
    },
    '/api/units': {
      get: {
        tags: ['Units'],
        summary: 'List units (listings)',
        parameters: [
          { name: 'featured', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
          { name: 'city', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'List of units' } },
      },
    },
    '/api/units/manage': {
      get: {
        tags: ['Units'],
        summary: 'List units (auth: admin/agent)',
        responses: { 200: { description: 'List of units' } },
      },
    },
    '/api/units/{id}': {
      get: {
        tags: ['Units'],
        summary: 'Get unit by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Unit details' }, 404: { description: 'Not found' } },
      },
      patch: {
        tags: ['Units'],
        summary: 'Update unit (auth: admin/agent)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['available', 'unavailable', 'maintenance'] },
                  is_featured: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' }, 400: { description: 'Validation error' }, 404: { description: 'Not found' } },
      },
    },
    '/api/bookings': {
      get: {
        tags: ['Bookings'],
        summary: 'List bookings for a listing',
        parameters: [{ name: 'listingId', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'List of bookings' }, 400: { description: 'listingId required' } },
      },
      post: {
        tags: ['Bookings'],
        summary: 'Create booking',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['listing_id', 'check_in_date', 'check_out_date'],
                properties: {
                  listing_id: { type: 'string' },
                  check_in_date: { type: 'string' },
                  check_out_date: { type: 'string' },
                  num_guests: { type: 'integer' },
                  extra_guests: { type: 'integer' },
                  landmark: { type: 'string' },
                  parking_info: { type: 'string' },
                  notes: { type: 'string' },
                  payment_method: { type: 'string' },
                  total_amount: { type: 'number' },
                  client: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Booking created' }, 400: { description: 'Validation error' } },
      },
    },
    '/api/bookings/my': {
      get: {
        tags: ['Bookings'],
        summary: "Current user's bookings (auth: admin/agent)",
        responses: { 200: { description: 'List of bookings' } },
      },
    },
    '/api/bookings/{id}': {
      get: {
        tags: ['Bookings'],
        summary: 'Get booking by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Booking details' }, 404: { description: 'Not found' } },
      },
    },
  },
} as const;
