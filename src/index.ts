import express from 'express';
import cors from 'cors';
import { ENV } from './config/env.config';
import logger from './config/logger';
import { initDb } from './config/db.config';

import creditRoutes from './routes/credit.routes';
import adminRoutes from './routes/admin.routes';

const app = express();

app.use(cors());
app.use(express.json());

// Debug middleware
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check
app.get('/health', (req: express.Request, res: express.Response) => {
    res.json({ status: 'ok', service: 'billing-service' });
});

// Routes
app.use('/backend/api/billing', creditRoutes);
app.use('/backend/api/revenue/admin', adminRoutes);

const startServer = async () => {
    try {
        await initDb();
        app.listen(ENV.PORT, () => {
            logger.info(`Billing service running on port ${ENV.PORT}`);
        });
    } catch (error) {
        logger.error({ error }, 'Failed to start billing-service');
        process.exit(1);
    }
};

startServer();
