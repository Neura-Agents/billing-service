import { Router } from 'express';
import { CreditController } from '../controllers/CreditController';
import { authenticate, internalAuth } from '../middleware/auth.middleware';

const router = Router();

// Balance check: accessible by user (JWT) OR internal services (Shared Secret)
const authorizeBalance = (req: any, res: any, next: any) => {
    // If x-internal-key is present, use internalAuth logic
    if (req.headers['x-internal-key']) {
        return internalAuth(req, res, next);
    }
    // Otherwise, use standard user auth
    return authenticate(req, res, next);
};

// Publicly accessible via Gateway (User authenticated) OR internal
router.get('/balance', authorizeBalance, CreditController.getBalance);
router.get('/history', authenticate, CreditController.getTransactions);

// Internal routes (Only services with shared secret)
router.post('/consume', internalAuth, CreditController.consume);
router.post('/top-up', internalAuth, CreditController.topUp);

export default router;
