// ws/tests/ws/auth.ws.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import MemoryWsState from '../../state/memory.state.js';

describe('MemoryWsState - auth suite', () => {
  let state;

  beforeEach(() => {
    state = new MemoryWsState();
    state.clear();
  });

  it('enregistre un client et stocke les informations d\'auth', () => {
    const meta = { userId: 'u1', token: 'tok-123', role: 'teacher' };
    state.registerClient('authClient1', null, meta);

    const client = state.getClient('authClient1');
    expect(client).toBeDefined();
    expect(client.meta.userId).toBe('u1');
    expect(client.meta.token).toBe('tok-123');
    expect(client.meta.role).toBe('teacher');
  });

  it('met à jour le meta d\'un client existant', () => {
    state.registerClient('authClient2', null, { userId: 'u2', token: 'old' });
    // simuler mise à jour (ré-enregistrement)
    state.registerClient('authClient2', null, { userId: 'u2', token: 'new', verified: true });

    const client = state.getClient('authClient2');
    expect(client).toBeDefined();
    expect(client.meta.token).toBe('new');
    expect(client.meta.verified).toBe(true);
  });

  it('supprime un client authentifié', () => {
    state.registerClient('authClient3', null, { userId: 'u3' });
    expect(state.getClient('authClient3')).toBeDefined();

    const removed = state.removeClient('authClient3');
    expect(removed).toBe(true);
    expect(state.getClient('authClient3')).toBeUndefined();
  });

  it('envoie un message d\'auth (sendToClient) et le client le reçoit via ws.send', () => {
    const sent = [];
    const mockWs = { send: (msg) => sent.push(msg), readyState: 1 };
    state.registerClient('authClient4', mockWs, { userId: 'u4' });

    const ok = state.sendToClient('authClient4', { type: 'auth:ok', user: 'u4' });
    expect(ok).toBe(true);
    expect(sent.length).toBe(1);
    const parsed = JSON.parse(sent[0]);
    expect(parsed.type).toBe('auth:ok');
    expect(parsed.user).toBe('u4');
  });

  it('envoie un message d\'auth échoue si socket non ouvert et stocke lastMessage', () => {
    const sent = [];
    const mockWs = { send: (msg) => sent.push(msg), readyState: 0 };
    state.registerClient('authClient5', mockWs, { userId: 'u5' });

    const ok = state.sendToClient('authClient5', { type: 'auth:challenge' });
    expect(ok).toBe(false);
    const client = state.getClient('authClient5');
    expect(client.meta.lastMessage).toBe(JSON.stringify({ type: 'auth:challenge' }));
    expect(sent.length).toBe(0);
  });

  it('broadcast d\'un message d\'auth à tous les clients sauf exclusions', () => {
    const s1 = { send: () => {}, readyState: 1 };
    const s2 = { send: () => {}, readyState: 1 };
    state.registerClient('authA', s1, { userId: 'A' });
    state.registerClient('authB', s2, { userId: 'B' });
    state.registerClient('authC', null, { userId: 'C' });

    const count = state.broadcast({ type: 'auth:update' }, { excludeIds: ['authB'] });
    expect(count).toBe(2);

    const clientC = state.getClient('authC');
    expect(clientC.meta.lastMessage).toBe(JSON.stringify({ type: 'auth:update' }));
  });

  it('clear supprime les données d\'auth et réinitialise l\'état', () => {
    state.registerClient('authX', null, { userId: 'X' });
    state.createCall('callAuth', { from: 'authX' });
    state.setState('auth:room', { locked: true });

    state.clear();

    expect(state.getAllClients().length).toBe(0);
    expect(state.getCall('callAuth')).toBeUndefined();
    expect(state.getState('auth:room')).toBeUndefined();
  });
});
