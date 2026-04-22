export const CallStateMachine = (() => {
  const STATES = {
    IDLE:    "idle",
    CALLING: "calling",
    RINGING: "ringing",
    IN_CALL: "inCall",
    ENDED:   "ended"
  };

  let state = STATES.IDLE;
  const listeners = new Set();

  const transitions = {
    idle:    ["calling", "ringing", "inCall", "ended"], // ✅ idle → ended autorisé
    calling: ["ringing", "inCall", "ended"],
    ringing: ["inCall", "ended"],
    inCall:  ["ended"],
    ended:   ["idle"]
  };

  function canTransition(to) {
    return transitions[state]?.includes(to) ?? false;
  }

  function setState(nextState) {
    if (!canTransition(nextState)) {
      console.warn(`[CallStateMachine] Transition refusée: ${state} -> ${nextState}`);
      return false;
    }
    state = nextState;
    listeners.forEach(cb => {
      try { cb(state); } catch(e) { console.error("CallState listener error:", e); }
    });
    return true;
  }

  function onChange(cb) {
    if (typeof cb === "function") listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function getState() { return state; }

  function reset() {
    if (state === STATES.IDLE) return; // ✅ évite boucle si déjà idle
    state = STATES.IDLE;
    listeners.forEach(cb => {
      try { cb(state); } catch(e) { console.error("CallState listener error:", e); }
    });
  }

  return { STATES, setState, onChange, getState, reset };
})();

export default CallStateMachine;