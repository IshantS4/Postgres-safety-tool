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

    it('rejects multiple statements', async () => {
    expect(await operationType('SELECT 1; DROP TABLE users')).toBe('UNKNOWN');
    expect(await operationType('DELETE FROM users; COMMIT;')).toBe('UNKNOWN');
    expect(await operationType("UPDATE users SET plan='x' WHERE id=1; DELETE FROM users")).toBe('UNKNOWN');
});
it('classifies SELECT INTO as DDL', async () => {
    expect(await operationType('SELECT * INTO copy FROM users')).toBe('DDL');
});
it('catches DELETE hidden behind a DELETE or INSERT CTE', async () => {
    expect(await operationType('WITH x AS (DELETE FROM users RETURNING *) DELETE FROM users WHERE id=1')).toBe('WRITE_CTE');
    expect(await operationType("WITH x AS (INSERT INTO users(name,email) VALUES ('a','b') RETURNING *) SELECT * FROM x")).toBe('WRITE_CTE');
});
it('allows a harmless read-only CTE', async () => {
    expect(await operationType('WITH x AS (SELECT 1 a) SELECT * FROM x')).toBe('SELECT');
});
it('rejects EXPLAIN and a comment-wrapped query correctly', async () => {
    expect(await operationType('EXPLAIN ANALYZE DELETE FROM users')).toBe('UNKNOWN');
    expect(await operationType('/* hi */ DELETE FROM users')).toBe('DELETE');
});
});