// ws/tests/ws/appel.ws.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import MemoryWsState from '../../state/memory.state.js';

describe('MemoryWsState - appel suite', () => {
  let state;

  beforeEach(() => {
    state = new MemoryWsState();
    state.clear();
  });

  it('enregistre et récupère un client avec meta', () => {
    state.registerClient('client1', { send: () => {} }, { name: 'Alice' });

    const client = state.getClient('client1');
    expect(client).toBeDefined();
    expect(client.meta).toBeDefined();
    expect(client.meta.name).toBe('Alice');
  });

  it('addClient alias fonctionne', () => {
    state.addClient({ id: 'client2', ws: { send: () => {} }, meta: { role: 'student' } });

    const client = state.getClient('client2');
    expect(client).toBeDefined();
    expect(client.meta.role).toBe('student');
  });

  it('supprime un client', () => {
    state.registerClient('client3', null, {});
    expect(state.getClient('client3')).toBeDefined();

    const removed = state.removeClient('client3');
    expect(removed).toBe(true);
    expect(state.getClient('client3')).toBeUndefined();
  });

  it('crée, récupère et termine un call', () => {
    state.createCall('call1', { from: 'client1', to: 'client2' });
    expect(state.getCall('call1')).toEqual({ from: 'client1', to: 'client2' });

    const ended = state.endCall('call1');
    expect(ended).toBe(true);
    expect(state.getCall('call1')).toBeUndefined();
  });

  it('sendToClient utilise ws.send quand disponible', () => {
    const sent = [];
    const mockWs = { send: (msg) => sent.push(msg), readyState: 1 };
    state.registerClient('client4', mockWs, {});

    const ok = state.sendToClient('client4', { type: 'ping' });
    expect(ok).toBe(true);
    expect(sent.length).toBe(1);
    expect(JSON.parse(sent[0]).type).toBe('ping');
  });

  it('sendToClient stocke lastMessage si pas de ws', () => {
    state.registerClient('client5', null, {});
    const ok = state.sendToClient('client5', 'hello');
    expect(ok).toBe(true);

    const client = state.getClient('client5');
    expect(client.meta.lastMessage).toBe('hello');
  });

  it('sendToClient simule stockage si readyState != 1', () => {
    const sent = [];
    const mockWs = { send: (msg) => sent.push(msg), readyState: 0 };
    state.registerClient('client6', mockWs, {});
    const ok = state.sendToClient('client6', { x: 1 });
    expect(ok).toBe(false);

    const client = state.getClient('client6');
    expect(client.meta.lastMessage).toBe(JSON.stringify({ x: 1 }));
    expect(sent.length).toBe(0);
  });

  it('broadcast envoie à tous sauf exclusions', () => {
    const s1 = { send: () => {}, readyState: 1 };
    const s2 = { send: () => {}, readyState: 1 };
    state.registerClient('a', s1, {});
    state.registerClient('b', s2, {});
    state.registerClient('c', null, {});

    const count = state.broadcast({ ev: 'update' }, { excludeIds: ['b'] });
    expect(count).toBe(2);

    const clientC = state.getClient('c');
    expect(clientC.meta.lastMessage).toBe(JSON.stringify({ ev: 'update' }));
  });

  it('setState et getState fonctionnent', () => {
    state.setState('room:1', { topic: 'math' });
    expect(state.getState('room:1')).toEqual({ topic: 'math' });
  });

  it('clear réinitialise tout', () => {
    state.registerClient('x', null, {});
    state.createCall('callX', { foo: 'bar' });
    state.setState('k', 123);

    state.clear();

    expect(state.getAllClients().length).toBe(0);
    expect(state.getCall('callX')).toBeUndefined();
    expect(state.getState('k')).toBeUndefined();
  });
});
