# Billing and Credit Management Service

The **Billing Service** is responsible for managing user credits, usage tracking, and billing operations within the AgenticAI platform.

---

## 🚀 Key Features

- **Credit Management**: Track and manage user credit balances (credits_balance, total_credits_bought, etc.).
- **Usage Tracking**: Monitor and record usage across various services (LLM tokens, tool executions, etc.).
- **Transaction History**: Maintain a ledger of all credit purchases and usage deductions.
- **Access Control**: Interface with other services to provide credit-based access checks.
- **Dynamic Pricing**: Support for various pricing models and currency conversion (integration ready).

---

## 🛠 Technology Stack

- **Framework**: Express
- **Database**: PostgreSQL (`pg`)
- **Validation**: Zod
- **Tracing & Logging**: Pino
- **Security**: Keycloak (JWT) and internal service secrets.
- **Language**: TypeScript

---

## 📥 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables in a `.env` file (see `.env.example`).

### Development

Run the API server:
```bash
npm run dev
```

---

## 🏗 Architecture

- **`src/index.ts`**: Entry point for API requests.
- **`src/controllers/`**: API handlers for credit and usage operations.
- **`src/services/`**: Business logic (e.g., `CreditService.ts`).
- **`src/routes/`**: Route definitions for external and internal APIs.
- **`src/models/`**: PostgreSQL interaction layer.
- **`src/middleware/`**: Authentication and validation middlewares.

---

## 🔗 Integration

This service coordinates closely with:
- **`agent-service`**: To deduct credits based on agent execution usage.
- **`auth-user-service`**: To link credits and usage to specific user profiles.
- **`platform-service`**: To provide unified usage and billing data for dashboards.
