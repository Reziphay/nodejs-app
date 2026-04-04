import path from 'path';
import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import v1Routes from './routes/v1';
import { errorMiddleware } from './middlewares/error.middleware';
import { httpLoggerMiddleware } from './middlewares/http-logger.middleware';
import { env } from './config/env';

const app: Application = express();

app.use(httpLoggerMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files — path must never expose outside storage dir
app.use('/uploads', express.static(path.resolve(env.STORAGE_DIR), { index: false, dotfiles: 'deny' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', v1Routes);

app.use(errorMiddleware);

export default app;
