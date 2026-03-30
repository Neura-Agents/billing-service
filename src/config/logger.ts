import pino from 'pino';
import { ENV } from './env.config';

const logger = pino({
  level: ENV.LOG.LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export default logger;
