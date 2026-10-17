// Модульные тесты. Запуск: npm test (встроенный runner Node.js, без доп. зависимостей)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const { isCommandAllowed } = require('../validate');
const { SSHClient } = require('../ssh');

// ---------- validate.js: фильтр команд ----------
test('validate: разрешённые команды проходят', () => {
  for (const c of ['echo HelloWorld', 'uptime', 'ls -la /var/log', 'df -h', 'free -m', 'whoami']) {
    assert.equal(isCommandAllowed(c), true, c);
  }
});

test('validate: опасные и неразрешённые команды отклоняются', () => {
  const bad = ['rm -rf /', 'rm -rf', 'cat /etc/passwd', 'ls; rm -rf /', 'echo $(whoami)',
    'echo `id`', 'ls | nc host 1', 'echo hi > /tmp/x', 'ls\nrm x', 'ls && reboot', '', '   ',
    null, undefined, 42, 'a'.repeat(300)];
  for (const c of bad) assert.equal(isCommandAllowed(c), false, String(c).slice(0, 30));
});

// ---------- ssh.js: разбор вывода команд (exec подменён заглушкой) ----------
const FREE = `               total        used        free      shared  buff/cache   available
Mem:           15812         781       13500          12        1530       15031
Swap:           4096           0        4096
`;
const TOP = '%Cpu(s):  1.2 us,  0.5 sy,  0.0 ni, 98.0 id,  0.3 wa,  0.0 hi,  0.0 si,  0.0 st\n';
const DF = `Filesystem      Size  Used Avail Use% Mounted on
overlay        1007G  2.3G  954G   1% /
tmpfs            64M     0   64M   0% /dev
/dev/sda1       100M   10M   90M  10% /boot
`;
const UPTIME = ' 13:51:50 up 2 min,  0 users,  load average: 0.01, 0.02, 0.00\n';

function mockClient(overrides = {}) {
  const outputs = { 'uptime': UPTIME, 'free -m': FREE, "top -bn1 | grep 'Cpu(s)'": TOP, 'df -h': DF, ...overrides };
  const c = new SSHClient({});
  c.connected = true;
  c.exec = async cmd => outputs[cmd];
  return c;
}

test('ssh: getRAM считает использование RAM и swap', async () => {
  const r = await mockClient().getRAM();
  assert.deepEqual(r.ram, { total: 15812, used: 781, free: 13500, percent: 5 });
  assert.deepEqual(r.swap, { total: 4096, used: 0, percent: 0 });
});

test('ssh: getCPU вычисляет загрузку по значению idle', async () => {
  assert.equal(await mockClient().getCPU(), 2);
});

test('ssh: getCPU возвращает 0 при неожиданном формате', async () => {
  assert.equal(await mockClient({ "top -bn1 | grep 'Cpu(s)'": 'нет данных' }).getCPU(), 0);
});

test('ssh: getDisk находит корневой раздел', async () => {
  const d = await mockClient().getDisk();
  assert.deepEqual(d, { filesystem: 'overlay', size: '1007G', used: '2.3G', avail: '954G', percent: 1 });
});

test('ssh: getDisk возвращает null, если корневого раздела нет', async () => {
  assert.equal(await mockClient({ 'df -h': 'Filesystem Size Used Avail Use% Mounted on\ntmpfs 64M 0 64M 0% /dev\n' }).getDisk(), null);
});

test('ssh: getMetrics собирает все показатели', async () => {
  const m = await mockClient().getMetrics();
  assert.equal(m.cpu, 2);
  assert.equal(m.ram.percent, 5);
  assert.equal(m.disk.percent, 1);
  assert.match(m.uptime, /up 2 min/);
});

test('ssh: exec без подключения выбрасывает ошибку', async () => {
  const c = new SSHClient({});
  await assert.rejects(() => c.exec('uptime'), /Не подключено/);
});

// ---------- renderer.js: экранирование и устойчивость отрисовки ----------
function loadRenderer() {
  const els = {};
  const el = id => els[id] || (els[id] = {
    id, innerHTML: '', textContent: '', className: '', dataset: {}, disabled: false,
    addEventListener(ev, fn) { (this.handlers = this.handlers || {})[ev] = fn; }, getContext() { return {}; }
  });
  const ctx = vm.createContext({
    document: { getElementById: el, body: { classList: { toggle() {}, contains() { return false; } } } },
    window: { api: {} }, Chart: function () {}, setInterval() {}, clearInterval() {}, console, Date
  });
  const api = vm.runInContext(read('renderer.js') + '\n;({ esc, renderMetrics })', ctx);
  return { ...api, els, window: ctx.window };
}

test('renderer: esc экранирует HTML-символы', () => {
  const { esc } = loadRenderer();
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc(null), '');
});

test('renderer: вредоносный uptime не попадает в DOM как HTML (XSS)', () => {
  const { renderMetrics, els } = loadRenderer();
  renderMetrics({
    uptime: '<img src=x onerror=alert(1)>', cpu: 1,
    ram: { used: 1, total: 2, percent: 50 }, swap: { used: 0, total: 0, percent: 0 },
    disk: { filesystem: '<b>fs</b>', used: '1G', size: '2G', percent: 50 }
  });
  assert.ok(!els.metrics.innerHTML.includes('<img'));
  assert.ok(!els.metrics.innerHTML.includes('<b>fs'));
  assert.ok(els.metrics.innerHTML.includes('&lt;img'));
});

test('renderer: отсутствие disk/ram/swap не приводит к падению', () => {
  const { renderMetrics } = loadRenderer();
  assert.doesNotThrow(() => renderMetrics({ uptime: 'up', cpu: 0, ram: null, swap: undefined, disk: null }));
});

test('renderer: кнопка «Отключиться» вызывает api.disconnect и блокирует команды', async () => {
  const { els, window } = loadRenderer();
  let called = 0;
  window.api.disconnect = async () => { called++; return { success: true }; };
  els['btn-disconnect'].disabled = false;
  els['btn-command'].disabled = false;
  await els['btn-disconnect'].handlers.click();
  assert.equal(called, 1);
  assert.equal(els['btn-command'].disabled, true);
  assert.equal(els['btn-disconnect'].disabled, true);
  assert.equal(els.status.textContent, 'Отключено от сервера');
});

test('renderer: при ошибке отключения кнопка снова доступна', async () => {
  const { els, window } = loadRenderer();
  window.api.disconnect = async () => ({ success: false, error: 'сбой' });
  await els['btn-disconnect'].handlers.click();
  assert.equal(els['btn-disconnect'].disabled, false);
  assert.match(els.status.textContent, /сбой/);
});

// ---------- проверки конфигурации безопасности (анализ исходного кода) ----------
test('security: пароль не сохраняется в БД', () => {
  assert.match(read('main.js'), /password:\s*null/);
  assert.doesNotMatch(read('main.js'), /password:\s*config\.password\s*\n\s*\}\)/);
});

test('security: DevTools открываются только в режиме разработки', () => {
  assert.match(read('main.js'), /if \(!app\.isPackaged\) win\.webContents\.openDevTools\(\)/);
});

test('security: contextIsolation включён, nodeIntegration выключен', () => {
  const m = read('main.js');
  assert.match(m, /contextIsolation:\s*true/);
  assert.match(m, /nodeIntegration:\s*false/);
});

test('security: в index.html есть CSP и нет тестовых учётных данных', () => {
  const h = read('index.html');
  assert.match(h, /Content-Security-Policy/);
  assert.doesNotMatch(h, /student123/);
});
