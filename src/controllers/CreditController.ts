import { Request, Response } from 'express';
import { CreditService } from '../services/CreditService';
import logger from '../config/logger';

export class CreditController {
    /**
     * Get user credit balance.
     */
    static async getBalance(req: any, res: Response) {
        try {
            // Support both internal (query param) and user (JWT) auth
            const userId = (req.query.userId as string) || req.user?.sub || req.user?.id;

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            const balance = await CreditService.getBalance(userId);
            res.json({ balance });
        } catch (error) {
            logger.error({ error, userId: req.user?.id }, 'Failed to get balance');
            res.status(500).json({ error: 'Failed to retrieve balance' });
        }
    }

    /**
     * Get user transaction history.
     */
    static async getTransactions(req: any, res: Response) {
        try {
            const userId = req.user.sub || req.user.id;
            const limit = parseInt(req.query.limit as string) || 10;
            const offset = parseInt(req.query.offset as string) || 0;
            const type = req.query.type as string;

            const result = await CreditService.getTransactions(userId, limit, offset, type);
            res.json(result);
        } catch (error) {
            logger.error({ error, userId: req.user?.id }, 'Failed to get transactions');
            res.status(500).json({ error: 'Failed to retrieve transaction history' });
        }
    }

    /**
     * Consume credits (Internal Only).
     */
    static async consume(req: Request, res: Response) {
        try {
            const { userId, amount, executionId, description } = req.body;

            if (!userId || !amount || !executionId) {
                return res.status(400).json({ error: 'userId, amount, and executionId are required' });
            }

            const newBalance = await CreditService.consume(userId, parseFloat(amount), executionId, description || 'General Consumption');
            res.json({ balance: newBalance });
        } catch (error: any) {
            logger.error({ err: error, body: req.body }, 'Failed to consume credits in controller');
            res.status(402).json({
                error: error.message || 'Payment Required (Insufficient Funds)',
                details: error.message
            });
        }
    }

    /**
     * Top-up credits (Internal Only - system for now).
     */
    static async topUp(req: Request, res: Response) {
        try {
            const { userId, amount, provider, description, metadata } = req.body;

            if (!userId || !amount) {
                return res.status(400).json({ error: 'userId and amount are required' });
            }

            const newBalance = await CreditService.topUp(userId, parseFloat(amount), provider || 'system', description || 'Manual Recharge', metadata);
            res.json({ balance: newBalance, status: 'success' });
        } catch (error: any) {
            logger.error({ error, body: req.body }, 'Failed to top-up credits in controller');
            res.status(500).json({ error: 'Failed to top-up credits' });
        }
    }
}
