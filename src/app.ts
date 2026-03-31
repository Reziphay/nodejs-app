import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import v1Routes from './routes/v1';
import { errorMiddleware } from './middlewares/error.middleware';
import { httpLoggerMiddleware } from './middlewares/http-logger.middleware';

const app: Application = express();

// HTTP request logger — must be first so it captures all requests
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

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/v1', v1Routes);

app.use(errorMiddleware);

export default app;
