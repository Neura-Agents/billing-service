import { Response } from 'express';
import { pool } from '../config/db.config';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import logger from '../config/logger';

export class AdminRevenueController {
    /**
     * Get revenue and profit stats for charts and KPIs.
     */
    static async getStats(req: AuthenticatedRequest, res: Response) {
        try {
            const { from, to } = req.query;
            
            let query = `
                SELECT 
                    date_trunc('day', po.created_at)::date as date,
                    SUM(po.amount_usd) as revenue,
                    SUM(po.amount_usd - (po.amount_usd * COALESCE(pgp.fee_percentage, 0) / 100) - COALESCE(pgp.fixed_fee, 0)) as profit,
                    COUNT(*) as transactions
                FROM payment_orders po
                LEFT JOIN payment_gateway_providers pgp ON po.gateway_id = pgp.id
                WHERE po.status = 'captured'
            `;
            const params: any[] = [];

            if (from) {
                params.push(from);
                query += ` AND po.created_at >= $${params.length}`;
            }
            if (to) {
                params.push(to);
                query += ` AND po.created_at <= $${params.length}`;
            }

            query += ` GROUP BY date ORDER BY date ASC`;

            const result = await pool.query(query, params);
            res.json(result.rows.map((row: any) => ({
                ...row,
                revenue: parseFloat(row.revenue),
                profit: parseFloat(row.profit),
                transactions: parseInt(row.transactions)
            })));
        } catch (error) {
            logger.error({ error }, 'Failed to fetch admin revenue stats');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get a paginated list of all captured payment transactions.
     */
    static async getTransactions(req: AuthenticatedRequest, res: Response) {
        try {
            const { from, to, limit = 10, offset = 0, search = '' } = req.query;
            
            let query = `
                SELECT 
                    po.order_id as id,
                    po.user_id,
                    u.email as user_email,
                    po.amount_usd as amount,
                    po.amount as amount_native,
                    po.currency,
                    po.status,
                    po.created_at,
                    COALESCE(pgp.name, 'Razorpay') as payment_method,
                    'credit_purchase' as type
                FROM payment_orders po
                LEFT JOIN payment_gateway_providers pgp ON po.gateway_id = pgp.id
                LEFT JOIN users u ON po.user_id = u.keycloak_id
                WHERE po.status = 'captured'
            `;
            const params: any[] = [];

            if (from) {
                params.push(from);
                query += ` AND po.created_at >= $${params.length}`;
            }
            if (to) {
                params.push(to);
                query += ` AND po.created_at <= $${params.length}`;
            }

            if (search) {
                params.push(`%${search}%`);
                query += ` AND (po.order_id ILIKE $${params.length} OR po.user_id ILIKE $${params.length} OR u.email ILIKE $${params.length})`;
            }

            const countQuery = `SELECT COUNT(*) FROM (${query}) as total`;
            
            query += ` ORDER BY po.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            
            const [transactionsResult, countResult] = await Promise.all([
                pool.query(query, [...params, limit, offset]),
                pool.query(countQuery, params)
            ]);

            res.json({
                transactions: transactionsResult.rows.map((row: any) => ({
                    ...row,
                    user_name: row.user_id.substring(0, 8), // Fallback: ID snippet
                    status: 'completed', // 'captured' in DB maps to 'completed' in UI
                    amount: parseFloat(row.amount_native),
                    amount_usd: parseFloat(row.amount)
                })),
                total: parseInt(countResult.rows[0].count)
            });
        } catch (error) {
            logger.error({ error }, 'Failed to fetch admin transactions');
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    /**
     * Get revenue insights (peak day, growth rate, etc).
     */
    static async getInsights(req: AuthenticatedRequest, res: Response) {
        try {
            const { from, to } = req.query;
            let dateFilter = '';
            const params: any[] = [];

            if (from) {
                params.push(from);
                dateFilter += ` AND po.created_at >= $${params.length}`;
            }
            if (to) {
                params.push(to);
                dateFilter += ` AND po.created_at <= $${params.length}`;
            }
            
            // Peak Day
            const peakResult = await pool.query(`
                SELECT date_trunc('day', po.created_at)::date as date, SUM(po.amount_usd) as revenue
                FROM payment_orders po
                WHERE po.status = 'captured' ${dateFilter}
                GROUP BY date ORDER BY revenue DESC LIMIT 1
            `, params);

            // Total Volume
            const volumeResult = await pool.query(`
                SELECT COUNT(*) as count FROM payment_orders po WHERE po.status = 'captured' ${dateFilter}
            `, params);

            // Top Payment Method
            const topMethodResult = await pool.query(`
                SELECT pgp.name, COUNT(*) as count
                FROM payment_orders po
                JOIN payment_gateway_providers pgp ON po.gateway_id = pgp.id
                WHERE po.status = 'captured' ${dateFilter}
                GROUP BY pgp.name ORDER BY count DESC LIMIT 1
            `, params);

            // Growth Rate (Compare last 30 days to previous 30 days)
            const growthResult = await pool.query(`
                WITH monthly_revenue AS (
                    SELECT 
                        SUM(CASE WHEN po.created_at >= NOW() - INTERVAL '30 days' THEN po.amount_usd ELSE 0 END) as current_month,
                        SUM(CASE WHEN po.created_at >= NOW() - INTERVAL '60 days' AND po.created_at < NOW() - INTERVAL '30 days' THEN po.amount_usd ELSE 0 END) as last_month
                    FROM payment_orders po
                    WHERE po.status = 'captured'
                )
                SELECT 
                    current_month,
                    last_month,
                    CASE 
                        WHEN last_month > 0 THEN ((current_month - last_month) / last_month) * 100
                        ELSE 0 
                    END as growth_rate
                FROM monthly_revenue
            `);

            const peakDay = peakResult.rows[0];
            const topMethod = topMethodResult.rows[0];
            const growthData = growthResult.rows[0];
            
            res.json({
                peak_revenue_day: peakDay ? peakDay.date : 'N/A',
                growth_rate: parseFloat(growthData?.growth_rate || 0).toFixed(1),
                top_payment_method: topMethod ? topMethod.name : 'Razorpay',
                total_volume: parseInt(volumeResult.rows[0].count)
            });
        } catch (error) {
            logger.error({ error }, 'Failed to fetch admin revenue insights');
            res.status(500).json({ error: 'Internal server error' });
        }
    }
}
