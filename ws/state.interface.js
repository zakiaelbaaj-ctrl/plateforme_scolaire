// ws/state.interface.js

export default class WsStateInterface {
  registerClient(clientId, ws, meta) {
    throw new Error("Not implemented");
  }

  removeClient(clientId) {
    throw new Error("Not implemented");
  }

  getClient(clientId) {
    throw new Error("Not implemented");
  }

  createCall(callId, payload) {
    throw new Error("Not implemented");
  }

  getCall(callId) {
    throw new Error("Not implemented");
  }

  endCall(callId) {
    throw new Error("Not implemented");
  }
}
