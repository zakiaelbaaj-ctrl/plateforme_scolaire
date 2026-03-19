// ws/tests/ws/chat.ws.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import MemoryWsState from '../../state/memory.state.js';

describe('MemoryWsState - chat suite', () => {
  let state;

  beforeEach(() => {
    state = new MemoryWsState();
    state.clear();
  });

  it('enregistre plusieurs clients et retourne la liste', () => {
    state.registerClient('u1', null, { name: 'Alice' });
    state.registerClient('u2', null, { name: 'Bob' });

    const clients = state.getAllClients();
    expect(clients).toHaveLength(2);
    const ids = clients.map(c => c.id).sort();
    expect(ids).toEqual(['u1', 'u2']);
  });

  it('envoie un message privé via sendToClient', () => {
    const sent = [];
    const mockWs = { send: (msg) => sent.push(msg), readyState: 1 };
    state.registerClient('u3', mockWs, { name: 'Charlie' });

    const ok = state.sendToClient('u3', { type: 'chat:msg', text: 'hello' });
    expect(ok).toBe(true);
    expect(sent.length).toBe(1);
    const parsed = JSON.parse(sent[0]);
    expect(parsed.type).toBe('chat:msg');
    expect(parsed.text).toBe('hello');
  });

  it('stocke lastMessage si le client n\'a pas de socket', () => {
    state.registerClient('u4', null, { name: 'Dana' });
    const ok = state.sendToClient('u4', { type: 'chat:msg', text: 'hi' });
    expect(ok).toBe(true);

    const client = state.getClient('u4');
    expect(client.meta.lastMessage).toBe(JSON.stringify({ type: 'chat:msg', text: 'hi' }));
  });

  it('broadcast envoie à tous les clients sauf l\'exclu', () => {
    const sentA = [];
    const sentB = [];
    const wsA = { send: (m) => sentA.push(m), readyState: 1 };
    const wsB = { send: (m) => sentB.push(m), readyState: 1 };

    state.registerClient('a', wsA, { name: 'A' });
    state.registerClient('b', wsB, { name: 'B' });
    state.registerClient('c', null, { name: 'C' });

    const count = state.broadcast({ type: 'chat:broadcast', text: 'news' }, { excludeIds: ['b'] });
    expect(count).toBe(2);

    // 'a' should have received via ws.send
    expect(sentA.length).toBe(1);
    expect(JSON.parse(sentA[0]).text).toBe('news');

    // 'b' excluded, so no message
    expect(sentB.length).toBe(0);

    // 'c' has no ws, message stored in meta
    const clientC = state.getClient('c');
    expect(clientC.meta.lastMessage).toBe(JSON.stringify({ type: 'chat:broadcast', text: 'news' }));
  });

  it('crée et récupère l\'historique d\'un call lié au chat', () => {
    state.createCall('call-chat-1', { room: 'room1', participants: ['u1', 'u2'] });
    const call = state.getCall('call-chat-1');
    expect(call).toEqual({ room: 'room1', participants: ['u1', 'u2'] });

    state.endCall('call-chat-1');
    expect(state.getCall('call-chat-1')).toBeUndefined();
  });

  it('setState/getState pour stocker les métadonnées d\'une salle de chat', () => {
    state.setState('room:room1', { topic: 'physics', pinned: [] });
    expect(state.getState('room:room1')).toEqual({ topic: 'physics', pinned: [] });

    state.setState('room:room1', { topic: 'chemistry' });
    expect(state.getState('room:room1')).toEqual({ topic: 'chemistry' });
  });

  it('clear réinitialise l\'état du chat', () => {
    state.registerClient('z', null, {});
    state.createCall('callZ', { foo: 'bar' });
    state.setState('chat:meta', { x: 1 });

    state.clear();

    expect(state.getAllClients().length).toBe(0);
    expect(state.getCall('callZ')).toBeUndefined();
    expect(state.getState('chat:meta')).toBeUndefined();
  });
});
