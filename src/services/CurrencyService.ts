import axios from 'axios';
import logger from '../config/logger';

export class CurrencyService {
    private static cachedRates: Record<string, number> = {};
    private static lastFetched: number = 0;
    private static CACHE_TTL = 3600000; // 1 hour

    /**
     * Get exchange rate from USD to target currency.
     */
    static async getRate(toCurrency: string = 'INR'): Promise<number> {
        if (toCurrency === 'USD') return 1;

        const now = Date.now();
        if (Object.keys(this.cachedRates).length > 0 && (now - this.lastFetched < this.CACHE_TTL)) {
            return this.cachedRates[toCurrency] || (toCurrency === 'INR' ? 83.5 : 1);
        }

        try {
            const response = await axios.get('http://platform-service:3006/backend/api/platform/external/exchange-rates');
            const rates = response.data.rates || {};
            this.cachedRates = rates;
            this.lastFetched = now;
            return rates[toCurrency] || (toCurrency === 'INR' ? 83.5 : 1);
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to fetch exchange rates from platform-service');
            return toCurrency === 'INR' ? 83.5 : 1; // Fallback
        }
    }

    /**
     * Get USD to INR exchange rate (compat).
     */
    static async getUSDtoINRRate(): Promise<number> {
        return this.getRate('INR');
    }

    /**
     * Convert USD to INR.
     */
    static async convertToINR(usdAmount: number): Promise<number> {
        const rate = await this.getRate('INR');
        return parseFloat((usdAmount * rate).toFixed(2));
    }

    /**
     * Convert any amount to USD based on currency.
     */
    static async convertToUSD(amount: number, fromCurrency: string): Promise<number> {
        const rate = await this.getRate(fromCurrency);
        return parseFloat((amount / rate).toFixed(6));
    }
}
