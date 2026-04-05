import app from './app';
import { env } from './config/env';
import logger from './lib/logger';

app.listen(env.PORT, env.HOST, () => {
  logger.info(`Server running on http://${env.HOST}:${env.PORT}`);
  logger.info(`Swagger docs: http://${env.HOST}:${env.PORT}/api-docs`);
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught exception: ${err.message}\n${err.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  logger.error(`Unhandled rejection: ${msg}`);
});
