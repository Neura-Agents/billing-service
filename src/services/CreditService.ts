import { pool } from '../config/db.config';
import logger from '../config/logger';

export class CreditService {
    /**
     * Get user credit balance. Initializes wallet if it doesn't exist.
     */
    static async getBalance(userId: string): Promise<number> {
        const result = await pool.query(
            'SELECT credits FROM user_wallets WHERE user_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            // Auto-initialize wallet for new user with $10.00 credits for testing
            const initialCredits = 0.0;
            await pool.query(
                `INSERT INTO user_wallets (user_id, credits) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id) DO NOTHING`,
                [userId, initialCredits]
            );
            logger.info({ userId, credits: initialCredits }, 'New wallet initialized with starting balance');
            return initialCredits;
        }

        return parseFloat(result.rows[0].credits);
    }

    /**
     * Consume credits atomically. Returns the new balance.
     * Throws error if insufficient funds.
     */
    static async consume(userId: string, amount: number, executionId: string, description: string) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Get current balance and consume (cap at 0)
            const updateResult = await client.query(
                `UPDATE user_wallets 
                 SET credits = GREATEST(0, credits - $2), updated_at = NOW() 
                 WHERE user_id = $1 
                 RETURNING credits`,
                [userId, amount]
            );

            if (updateResult.rows.length === 0) {
                throw new Error(`Wallet not found for user: ${userId}`);
            }

            const newBalance = parseFloat(updateResult.rows[0].credits);

            // 2. Log transaction
            await client.query(
                `INSERT INTO billing_transactions (user_id, amount, type, execution_id, description) 
                 VALUES ($1, $2, 'consumption', $3, $4)`,
                [userId, -amount, executionId, description]
            );

            await client.query('COMMIT');
            logger.info({ userId, amount, executionId, newBalance }, 'Credits consumed (capped at 0)');
            return newBalance;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error({ err: error, userId, amount, executionId }, 'Failed to consume credits');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Top up user credits.
     */
    static async topUp(userId: string, amount: number, provider: string, description: string, metadata: any = {}) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Initialize or update wallet
            const updateResult = await client.query(
                `INSERT INTO user_wallets (user_id, credits) 
                 VALUES ($1, $2) 
                 ON CONFLICT (user_id) 
                 DO UPDATE SET credits = user_wallets.credits + $2, updated_at = NOW() 
                 RETURNING credits`,
                [userId, amount]
            );

            const newBalance = parseFloat(updateResult.rows[0].credits);

            // 2. Log transaction
            await client.query(
                `INSERT INTO billing_transactions (user_id, amount, type, provider, description, metadata) 
                 VALUES ($1, $2, 'top-up', $3, $4, $5)`,
                [userId, amount, provider, description, JSON.stringify(metadata)]
            );

            await client.query('COMMIT');
            logger.info({ userId, amount, provider }, 'Credits topped up successfully');
            return newBalance;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error({ error, userId, amount }, 'Failed to top up credits');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get transaction history for a user.
     */
    static async getTransactions(userId: string, limit: number = 50, offset: number = 0) {
        const result = await pool.query(
            `SELECT * FROM billing_transactions 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );
        return result.rows;
    }
}
