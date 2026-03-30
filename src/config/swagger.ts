import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';
import { env } from './env';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'nodejs-app API',
      version: '1.0.0',
      description: 'nodejs-app REST API documentation',
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: [path.join(__dirname, '../routes/v1/*.{ts,js}')],
};

export const swaggerSpec = swaggerJsdoc(options);
