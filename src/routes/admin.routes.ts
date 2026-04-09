import { Router } from 'express';
import { AdminRevenueController } from '../controllers/AdminRevenueController';
import { authenticate, checkRole } from '../middleware/auth.middleware';

const router = Router();

// Dashboard analytics (Stats)
router.get('/stats', 
    authenticate, 
    checkRole(['platform-admin']), 
    (req, res) => AdminRevenueController.getStats(req as any, res)
);

// Detailed transactions
router.get('/transactions', 
    authenticate, 
    checkRole(['platform-admin']), 
    (req, res) => AdminRevenueController.getTransactions(req as any, res)
);

// Financial Insights
router.get('/insights', 
    authenticate, 
    checkRole(['platform-admin']), 
    (req, res) => AdminRevenueController.getInsights(req as any, res)
);

export default router;
