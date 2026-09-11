const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const vm = require('node:vm');
function request(path, method = 'GET', body, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3100/api/auth/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) } }, res => {
      let data = ''; res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) }));
    });
    req.on('error', reject); req.end(body && JSON.stringify(body));
  });
}
test('persistent session restores, renews and clears on logout', async () => {
  const source = fs.readFileSync('src/seed.js', 'utf8');
  const password = source.match(/hashPassword\(['"]([^'"]+)/)[1];
  const users = JSON.parse(fs.readFileSync('data/usuarios.json'));
  const login = await request('login', 'POST', { email: users[0].email, senha: password });
  assert.equal(login.status, 200);
  const cookies = login.headers['set-cookie'];
  assert.ok(cookies.every(c => /httponly/i.test(c) && /samesite=lax/i.test(c)));
  const expiry = new Date(cookies[0].match(/expires=([^;]+)/i)[1]);
  assert.ok(expiry - Date.now() > 399 * 86400000);
  const cookie = cookies.map(c => c.split(';')[0]).join('; ');
  const me = await request('me', 'GET', undefined, cookie);
  assert.equal(me.status, 200); assert.equal(me.data.usuario.id, users[0].id);
  assert.ok(me.headers['set-cookie']);
  const logout = await request('logout', 'POST', undefined, cookie);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers['set-cookie'].every(c => /expires=Thu, 01 Jan 1970/i.test(c)));
  assert.equal((await request('me')).status, 401);
});
test('device information updates and unsupported APIs retain fallback', async () => {
  const source = fs.readFileSync('public/device-status.js', 'utf8');
  const run = navigator => {
    const els = { connectionStatus: {}, batteryStatus: { textContent: 'Bateria —', setAttribute() {} } };
    const events = {};
    vm.runInNewContext(source, { navigator, document: { getElementById: id => els[id], addEventListener() {} }, window: { addEventListener: (type, cb) => events[type] = cb } });
    return { els, events };
  };
  const unsupported = run({ onLine: true });
  assert.equal(unsupported.els.batteryStatus.textContent, 'Bateria —');
  const handlers = {};
  const battery = { level: .42, charging: false, addEventListener: (type, cb) => handlers[type] = cb };
  const navigator = { onLine: true, getBattery: async () => battery };
  const supported = run(navigator); await Promise.resolve();
  assert.equal(supported.els.batteryStatus.textContent, '42%');
  battery.level = .8; battery.charging = true; handlers.levelchange();
  assert.equal(supported.els.batteryStatus.textContent, '⚡ 80%');
  navigator.onLine = false; supported.events.offline();
  assert.equal(supported.els.connectionStatus.textContent, 'Offline');
});
