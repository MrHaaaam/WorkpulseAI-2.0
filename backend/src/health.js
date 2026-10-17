export function healthHandler(connection) {
  return (_request, response) => response.json({ ok: true, database: connection.readyState === 1 ? 'connected' : 'disconnected' });
}
