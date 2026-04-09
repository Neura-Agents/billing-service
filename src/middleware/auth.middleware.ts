import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import logger from '../config/logger';
import { ENV } from '../config/env.config';

const client = jwksClient({
    jwksUri: `${ENV.KEYCLOAK.ISSUER_URL}/protocol/openid-connect/certs`,
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5
});

function getKey(header: any, callback: (err: Error | null, key?: string) => void) {
    client.getSigningKey(header.kid, (err, key: any) => {
        if (err) {
            callback(err);
            return;
        }
        const signingKey = key.getPublicKey();
        callback(null, signingKey);
    });
}

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        username?: string;
        email?: string;
        roles?: string[];
    };
    [key: string]: any; // Allow for other express properties if needed
}

/**
 * Standard JWT Authentication for public API calls (e.g., from Frontend)
 */
export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    let token: string | undefined;
    const authHeader = req.headers.authorization;
    const queryToken = req.query.jwt as string;

    if (authHeader) {
        token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    } else if (queryToken) {
        token = queryToken;
    }

    if (token) {
        try {
            const decoded = await new Promise<any>((resolve, reject) => {
                jwt.verify(token!, getKey, {
                    issuer: [ENV.KEYCLOAK.ISSUER_URL, ENV.KEYCLOAK.PUBLIC_ISSUER_URL],
                    algorithms: ['RS256']
                }, (err, payload) => {
                    if (err) return reject(err);
                    resolve(payload);
                });
            });

            if (decoded && decoded.sub) {
                req.user = {
                    id: decoded.sub,
                    username: decoded.preferred_username,
                    email: decoded.email,
                    roles: decoded.realm_access?.roles || []
                };
                return next();
            }
        } catch (err: any) {
            logger.error({ err: err.message }, 'Token verification error in billing-service');
            return res.status(401).json({ error: `Unauthorized: ${err.message}` });
        }
    }

    // Development bypass if needed
    if (ENV.NODE_ENV === 'development' && req.headers['x-user-id']) {
        req.user = { id: req.headers['x-user-id'] as string, roles: ['admin'] };
        return next();
    }

    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
};

/**
 * Internal Authentication for service-to-service communication
 */
export const internalAuth = (req: Request, res: Response, next: NextFunction) => {
    const internalKey = req.headers['x-internal-key'];
    
    if (!internalKey || internalKey !== ENV.INTERNAL_SERVICE_SECRET) {
        logger.warn({ path: req.path, ip: req.ip }, 'Unauthorized internal service access attempt');
        return res.status(401).json({ error: 'Unauthorized: Invalid internal secret' });
    }
    
    next();
};

/**
 * Role-based access control middleware
 */
export const checkRole = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized: No user found in request' });
        }

        const hasRole = roles.every(role => req.user?.roles?.includes(role));
        
        if (!hasRole) {
            logger.warn({ userId: req.user.id, requiredRoles: roles, userRoles: req.user.roles }, 'Insufficient permissions for endpoint');
            return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
        }

        next();
    };
};
