const WebSocket = require("ws");
const legacy = require("legacy-encoding");
const net = require("net");

const OkeChatServer = ({ port }) => {
  const callbacks = {
    clientAuth: [],
  };

  const wss = new WebSocket.Server({
    port,
  });

  console.log(`Websocket oke chat server running on port ${port}`);

  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      try {
        const d = JSON.parse(data);

        switch (d.type) {
          case "message":
            ws.kuskiName &&
              msg(d.data.channel, `${ws.kuskiName}: ${d.data.message}`);
            break;
          case "auth":
            ws.kuskiName = callbacks.clientAuth && callbacks.clientAuth(d.data);
            break;
          default:
        }
      } catch (e) {
        console.log(e);
      }
    });
  });

  const cli = new net.Socket();
  let conn = false;

  const bDump = (buffer) =>
    console.log(buffer.toString("hex").match(/../g).join(" "));

  cli.on("data", (data) => {
    if (!conn) {
      // ok if chan field is "server" and name is "err" its eror
      conn = true;
      console.log("Connected to okeol");
    }

    const l = data.readInt16LE();
    const code = data.readInt8(2);

    switch (code) {
      case 2:
        const d = legacy
          .decode(data.slice(3, l + 2), "windows-1252")
          .split("\0");

        const line = {
          channel: d[0],
          name: d[1],
          message: d[2],
        };

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "message", data: line }));
          }
        });

        break;
      default:
    }
  });

  const msg = (channel, message) => {
    const l = channel.length + message.length + 2;
    const head = Buffer.alloc(3);
    head.writeUInt16LE(l);
    head.writeUInt8(0x01, 2);

    const data = Buffer.concat([
      head,
      legacy.encode(channel, "windows-1252"),
      Buffer.from([0x00]),

      legacy.encode(message, "windows-1252"),
      Buffer.from([0x00]),
    ]);

    cli.write(data);
  };

  const connect = ({ host, port, name, pass }) => {
    cli.connect(port, host);

    cli.on("connect", () => {
      auth(name, pass);
    });
  };

  const auth = (name, pass) => {
    const l = name.length + pass.length + 4;
    const head = Buffer.alloc(3);
    head.writeUInt16LE(l);
    head.writeUInt8(0x00, 2);

    const data = Buffer.alloc(l);
    let i = data.write(name, 0);
    i = data.writeUInt8(0x00, i);
    i += data.write(pass, i);
    i = data.writeUInt8(0x00, i);
    data.writeUInt16LE(0x0002, i);
    cli.write(Buffer.concat([head, data]));
  };

  return {
    connect,
    auth,
    msg,
    on: (e, f) => {
      callbacks[e] = f;
    },
  };
};

module.exports = OkeChatServer;
