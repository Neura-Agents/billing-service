import { Request, Response } from 'express';
import { RazorpayService } from '../services/RazorpayService';
import { CreditService } from '../services/CreditService';
import { CurrencyService } from '../services/CurrencyService';
import { pool } from '../config/db.config';
import logger from '../config/logger';

export class RazorpayController {
    /**
     * Create a Razorpay order.
     */
    static async createOrder(req: any, res: Response) {
        try {
            const { credits, amount, currency } = req.body;
            const userId = req.user.sub || req.user.id;

            if (!credits && (!amount || amount <= 0)) {
                return res.status(400).json({ error: 'Valid amount or credits is required' });
            }

            // Enforce per-transaction maximum credits limit (100,000)
            const MAX_CREDITS_PER_TXN = 100000;
            const requestedCredits = credits || (amount ? await CurrencyService.convertToUSD(amount, currency || 'INR') : 0);

            if (requestedCredits > MAX_CREDITS_PER_TXN) {
                return res.status(400).json({ 
                    error: `Transaction blocked: Single top-up cannot exceed ${MAX_CREDITS_PER_TXN.toLocaleString()} credits. Requested: ${requestedCredits.toFixed(2)}` 
                });
            }

            const order = await RazorpayService.createOrder(userId, { 
                credits, 
                amount, 
                currency: currency || 'INR' 
            });

            res.json({
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            });
        } catch (error) {
            logger.error({ error }, 'Controller: Failed to create Razorpay order');
            res.status(500).json({ error: 'Failed to create payment order' });
        }
    }

    /**
     * Verify payment and top up credits with idempotency.
     */
    static async verifyPayment(req: any, res: Response) {
        try {
            logger.info({ body: req.body }, 'Received Razorpay verification request');
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;
            const userId = req.user.sub || req.user.id;

            // 1. Verify and update order status (Idempotent check inside verifyPayment)
            const isVerified = await RazorpayService.verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature);

            if (!isVerified) {
                return res.status(400).json({ error: 'Payment verification failed' });
            }

            // 2. Fetch order details from DB to get converted amounts
            const orderResult = await pool.query(
                "SELECT amount, amount_usd, exchange_rate FROM payment_orders WHERE order_id = $1",
                [razorpay_order_id]
            );

            if (orderResult.rows.length === 0) {
                return res.status(404).json({ error: 'Order not found' });
            }

            const order = orderResult.rows[0];

            // 3. Check if transaction was already logged
            const checkQuery = await pool.query(
                "SELECT * FROM billing_transactions WHERE metadata->>'razorpay_order_id' = $1",
                [razorpay_order_id]
            );

            if (checkQuery.rows.length > 0) {
                logger.info({ razorpay_order_id }, 'Credits already added for this order');
                return res.json({
                    status: 'success',
                    message: 'Credits already added'
                });
            }

            // 4. Top up the credits (use the original USD amount)
            const newBalance = await CreditService.topUp(
                userId,
                parseFloat(order.amount_usd),
                'razorpay',
                `Top-up via Razorpay: ${razorpay_payment_id}`,
                { 
                    razorpay_order_id, 
                    razorpay_payment_id,
                    amount_inr: order.amount,
                    exchange_rate: order.exchange_rate
                }
            );

            res.json({
                status: 'success',
                balance: newBalance,
                message: 'Payment verified and credits added'
            });
        } catch (error) {
            logger.error({ error }, 'Controller: Failed to verify payment');
            res.status(500).json({ error: 'Failed to verify payment' });
        }
    }
}
