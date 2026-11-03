import { describe, it, expect } from 'vitest';
import { operationType } from './classifier.js';

describe('AST Security Guardrail Tests', () => {
    it('should allow normal SELECT queries', async () => {
        const type = await operationType('SELECT * FROM users;');
        expect(type).toBe('SELECT');
    });

    it('should classify normal DELETE as DELETE', async () => {
        const type = await operationType("DELETE FROM users WHERE email = 'jack@tech.com';");
        expect(type).toBe('DELETE');
    });

    it('should completely block DDL statements (Trojan Horse #1)', async () => {
        const type = await operationType('DROP TABLE users;');
        expect(type).toBe('DDL');
    });

    it('should catch destructive DELETE hidden inside SELECT CTE (Trojan Horse #2)', async () => {
        const type = await operationType('WITH hack AS (DELETE FROM users) SELECT * FROM users;');
        expect(type).toBe('WRITE_CTE');
    });

    it('should catch destructive UPDATE hidden inside UPDATE CTE (Trojan Horse #3)', async () => {
        const type = await operationType("WITH hack AS (UPDATE users SET plan = 'free') UPDATE dummy SET a=1;");
        expect(type).toBe('WRITE_CTE');
    });

    it('should reject invalid or garbage queries', async () => {
        const type = await operationType('SELECT * FROM;;;;');
        expect(type).toBe('UNKNOWN');
    });
});