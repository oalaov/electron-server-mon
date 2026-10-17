// Нагрузочное и стрессовое тестирование модуля SSHClient.
// Запуск:  SSH_PASSWORD=пароль node tests/load-test.js [host] [port] [user]
// По умолчанию: localhost 2222 student (тестовый Docker-контейнер с sshd).
const { SSHClient } = require('../ssh');

const host = process.argv[2] || 'localhost';
const port = parseInt(process.argv[3] || '2222', 10);
const username = process.argv[4] || 'student';
const password = process.env.SSH_PASSWORD;
if (!password) { console.error('Укажите пароль: SSH_PASSWORD=... node tests/load-test.js'); process.exit(1); }

const cfg = { host, port, username, password };
const ms = () => Number(process.hrtime.bigint() / 1000000n);
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

async function oneSession(requests) {
  const c = new SSHClient(cfg);
  const t0 = ms();
  const r = await c.connect();
  if (!r.success) throw new Error(r.error);
  const times = [];
  try {
    for (let i = 0; i < requests; i++) {
      const t = ms();
      const m = await c.getMetrics();
      if (!m || m.cpu === undefined) throw new Error('пустые метрики');
      times.push(ms() - t);
    }
  } finally { c.disconnect(); }
  return { connect: t0, times };
}

async function load() {
  console.log('\n=== Нагрузочное: 1 соединение, 100 последовательных запросов метрик ===');
  const c = new SSHClient(cfg);
  const r = await c.connect();
  if (!r.success) { console.error('Не удалось подключиться:', r.error); process.exit(1); }
  const times = []; let errors = 0;
  const t0 = ms();
  for (let i = 0; i < 100; i++) {
    const t = ms();
    try { await c.getMetrics(); times.push(ms() - t); } catch { errors++; }
  }
  const total = ms() - t0;
  c.disconnect();
  console.log(`запросов: 100, ошибок: ${errors}, общее время: ${total} мс`);
  console.log(`среднее: ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(1)} мс, p95: ${pct(times, 0.95)} мс, максимум: ${Math.max(...times)} мс`);
}

async function stress() {
  console.log('\n=== Стрессовое: рост числа параллельных соединений (по 3 запроса на соединение) ===');
  console.log('соединений | успешно | ошибок | время, мс | RSS, МБ');
  for (const n of [10, 25, 50, 100, 200]) {
    const t0 = ms();
    const res = await Promise.allSettled(Array.from({ length: n }, () => oneSession(3)));
    const ok = res.filter(r => r.status === 'fulfilled').length;
    const firstErr = res.find(r => r.status === 'rejected');
    console.log(`${String(n).padStart(10)} | ${String(ok).padStart(7)} | ${String(n - ok).padStart(6)} | ${String(ms() - t0).padStart(9)} | ${(process.memoryUsage().rss / 1048576).toFixed(0)}`
      + (firstErr ? `   (пример ошибки: ${firstErr.reason.message})` : ''));
    if (n - ok > n / 2) { console.log('Более половины соединений отклонено — остановка.'); break; }
  }
}

(async () => { await load(); await stress(); process.exit(0); })();
