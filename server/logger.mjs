export function createLogger(stream = process.stdout) {
  const write = (level, event, fields = {}) => {
    stream.write(`${JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })}\n`);
  };
  return {
    info(event, fields) {
      write('info', event, fields);
    },
    warn(event, fields) {
      write('warn', event, fields);
    },
  };
}
