import Razorpay from 'razorpay';
import crypto from 'crypto';
import logger from '../config/logger';
import { pool } from '../config/db.config';
import { ENV } from '../config/env.config';

const razorpay = new Razorpay({
    key_id: ENV.RAZORPAY.KEY_ID,
    key_secret: ENV.RAZORPAY.KEY_SECRET,
});

import { CurrencyService } from './CurrencyService';

export class RazorpayService {
    /**
     * Create a new order in Razorpay and save to DB.
     */
    static async createOrder(userId: string, input: { credits?: number, amount?: number, currency?: string }) {
        try {
            const currency = input.currency || 'INR';
            let inrAmount: number;
            let usdAmount: number;
            const rate = await CurrencyService.getUSDtoINRRate();

            if (input.credits) {
                usdAmount = input.credits;
                inrAmount = await CurrencyService.convertToINR(usdAmount);
            } else if (input.amount) {
                inrAmount = input.amount;
                usdAmount = inrAmount / rate;
            } else {
                throw new Error('Either credits or amount must be provided');
            }
            
            const receipt = `rcpt_${Date.now()}_${userId.substring(0, 8)}`;
            const options = {
                amount: Math.round(inrAmount * 100), // amount in paise
                currency,
                receipt,
            };

            const order = await razorpay.orders.create(options);

            await pool.query(
                `INSERT INTO payment_orders (order_id, user_id, amount, amount_usd, exchange_rate, currency, receipt, status, gateway_id) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'created', (SELECT id FROM payment_gateway_providers WHERE name = 'Razorpay' LIMIT 1))`,
                [order.id, userId, inrAmount, usdAmount, rate, currency, receipt]
            );

            logger.info({ orderId: order.id, userId, usdAmount, inrAmount, rate }, 'Razorpay order created with conversion');
            return order;
        } catch (error) {
            logger.error({ error }, 'Failed to create Razorpay order');
            throw error;
        }
    }

    /**
     * Verify payment signature and update order status.
     */
    static async verifyPayment(orderId: string, paymentId: string, signature: string) {
        const secret = ENV.RAZORPAY.KEY_SECRET;
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(orderId + "|" + paymentId);
        const generated_signature = hmac.digest('hex');

        if (generated_signature !== signature) {
            logger.warn({ orderId, paymentId }, 'Invalid Razorpay signature');
            return false;
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Check if order exists and is not already processed
            const orderResult = await client.query(
                'SELECT * FROM payment_orders WHERE order_id = $1 FOR UPDATE',
                [orderId]
            );

            if (orderResult.rows.length === 0) {
                throw new Error('Order not found');
            }

            const order = orderResult.rows[0];
            if (order.status === 'captured') {
                logger.info({ orderId }, 'Order already captured');
                await client.query('COMMIT');
                return true;
            }

            // 2. Update order status
            await client.query(
                `UPDATE payment_orders 
                 SET status = 'captured', payment_id = $2, signature = $3, updated_at = NOW() 
                 WHERE order_id = $1`,
                [orderId, paymentId, signature]
            );

            await client.query('COMMIT');
            return true;
        } catch (error) {
            await client.query('ROLLBACK');
            logger.error({ error, orderId }, 'Failed to verify and update order status');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get order details by ID.
     */
    static async getOrder(orderId: string) {
        const result = await pool.query('SELECT * FROM payment_orders WHERE order_id = $1', [orderId]);
        return result.rows[0];
    }
}
