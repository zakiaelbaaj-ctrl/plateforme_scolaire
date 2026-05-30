let channels = {};

export const DataChannelService = {

  init(peerConnection, isInitiator) {

    if (isInitiator) {
      channels.chat = peerConnection.createDataChannel("chat", { ordered: true });
      channels.draw = peerConnection.createDataChannel("draw", {
        ordered: false,
        maxRetransmits: 0
      });

      this._setup(channels.chat);
      this._setup(channels.draw);
    }

    peerConnection.ondatachannel = (event) => {
      const channel = event.channel;
      channels[channel.label] = channel;
      this._setup(channel);
    };
  },

  _setup(channel) {
    channel.onopen = () => console.log("ð¡ DC open:", channel.label);
    channel.onclose = () => console.log("ð DC closed:", channel.label);

    channel.onmessage = (event) => {
      this._handleMessage(channel.label, event.data);
    };
  },

  _handleMessage(type, raw) {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (type) {
      case "chat":
        window.appendMessage?.("peer", data.text);
        break;

      case "draw":
        if (data.type === "stroke") window.drawStroke?.(data.payload);
        if (data.type === "text")   window.drawText?.(data.payload);
        if (data.type === "clear")  window.clearCanvas?.();
        break;
    }
  },

  sendChat(text) {
    const ch = channels.chat;
    if (ch?.readyState === "open") {
      ch.send(JSON.stringify({ text }));
    }
  },

  sendStroke(stroke) {
    const ch = channels.draw;
    if (ch?.readyState === "open") {
      ch.send(JSON.stringify({ type: "stroke", payload: stroke }));
    }
  },

  sendText(textObj) {
    const ch = channels.draw;
    if (ch?.readyState === "open") {
      ch.send(JSON.stringify({ type: "text", payload: textObj }));
    }
  },

  clear() {
    const ch = channels.draw;
    if (ch?.readyState === "open") {
      ch.send(JSON.stringify({ type: "clear" }));
    }
  }
};
