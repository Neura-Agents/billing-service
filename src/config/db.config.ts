import { Pool } from 'pg';
import { ENV } from './env.config';
import logger from './logger';

export const pool = new Pool({
    host: ENV.DB.HOST,
    port: ENV.DB.PORT,
    user: ENV.DB.USER,
    password: ENV.DB.PASSWORD,
    database: ENV.DB.NAME,
    options: `-c search_path=${ENV.DB.SCHEMA},public`,
});

export const initDb = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_wallets (
                user_id VARCHAR(255) PRIMARY KEY,
                credits NUMERIC(15, 10) DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS billing_transactions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id VARCHAR(255) NOT NULL,
                amount NUMERIC(15, 10) NOT NULL,
                type VARCHAR(50) NOT NULL, -- 'consumption', 'top-up', 'refund', 'adjustment'
                provider VARCHAR(50) DEFAULT 'system', -- 'system', 'manual', 'razorpay', etc.
                execution_id VARCHAR(255), -- Idempotency key from platform-service
                description TEXT,
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_billing_transactions_user_id ON billing_transactions(user_id);
            CREATE INDEX IF NOT EXISTS idx_billing_transactions_execution_id ON billing_transactions(execution_id);

            DO $$
            BEGIN
                -- Constraint 1: Transactions reference Wallets
                IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_billing_transactions_user_id') THEN
                    ALTER TABLE billing_transactions 
                    ADD CONSTRAINT fk_billing_transactions_user_id 
                    FOREIGN KEY (user_id) REFERENCES user_wallets(user_id) ON DELETE CASCADE;
                END IF;

                -- Constraint 2: Wallets reference Users (Cross-service check)
                IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
                    -- Initial migration (ensure all users have wallets with a starting balance of $10.00)
                    INSERT INTO user_wallets (user_id, credits)
                    SELECT keycloak_id, 10.0 FROM users
                    ON CONFLICT (user_id) DO NOTHING;

                    -- Add constraint if not exists
                    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_user_wallets_user_id') THEN
                        ALTER TABLE user_wallets 
                        ADD CONSTRAINT fk_user_wallets_user_id 
                        FOREIGN KEY (user_id) REFERENCES users(keycloak_id) ON DELETE CASCADE;
                    END IF;
                END IF;
            END $$;
        `);
        logger.info('Billing database initialized successfully');
    } catch (error) {
        logger.error({ error }, 'Failed to initialize billing database');
        throw error;
    }
};
