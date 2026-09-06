// Fallback pty host: runs under the system `node` when node-pty could not be loaded inside Electron
// (typically because `electron-rebuild` has not run). Protocol: newline-delimited JSON on stdin/stdout.
//   in : {type:"spawn",id,cwd,cols,rows,shell,args,env} | {type:"write",id,data} | {type:"resize",id,cols,rows} | {type:"kill",id}
//   out: {type:"data",id,data} | {type:"exit",id,code} | {type:"error",message}
const pty = require("node-pty");
const readline = require("node:readline");

const sessions = new Map();
const send = (o) => process.stdout.write(JSON.stringify(o) + "\n");

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.type === "spawn") {
    try {
      const p = pty.spawn(m.shell, m.args || [], { name: "xterm-256color", cwd: m.cwd, cols: m.cols, rows: m.rows, env: m.env });
      sessions.set(m.id, p);
      p.onData((d) => send({ type: "data", id: m.id, data: d }));
      p.onExit(({ exitCode }) => { sessions.delete(m.id); send({ type: "exit", id: m.id, code: exitCode }); });
    } catch (e) { send({ type: "error", message: String(e && e.message || e) }); send({ type: "exit", id: m.id, code: -1 }); }
  } else if (m.type === "write") sessions.get(m.id)?.write(m.data);
  else if (m.type === "resize") sessions.get(m.id)?.resize(m.cols, m.rows);
  else if (m.type === "kill") sessions.get(m.id)?.kill();
});
process.stdin.on("end", () => { for (const p of sessions.values()) p.kill(); process.exit(0); });
