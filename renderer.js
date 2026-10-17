// Получаем элементы
const btnConnect = document.getElementById('btn-connect');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const btnCommand = document.getElementById('btn-command');
const btnDisconnect = document.getElementById('btn-disconnect');
const btnTheme = document.getElementById('btn-theme');

// Экранирование данных, полученных с сервера (защита от XSS)
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let ramChart = null;
let cpuChart = null;

btnConnect.addEventListener('click', async () => {
  const config = {
    host: document.getElementById('host').value.trim(),
    port: parseInt(document.getElementById('port').value),
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value
  };

  if (!config.host || !config.username || !config.password) {
    setStatus('❌ Заполните все поля', 'error');
    return;
  }

  setStatus('Подключение...', 'loading');
  btnConnect.disabled = true;

  const result = await window.api.connect(config);

  btnConnect.disabled = false;

  if (result.success) {
    setStatus('Подключено к ' + config.host, 'success');
    btnCommand.disabled = false;
    btnDisconnect.disabled = false;
    startAutoRefresh();
  } else {
    setStatus('Ошибка: ' + result.error, 'error');
  }
});

btnDisconnect.addEventListener('click', async () => {
  btnDisconnect.disabled = true;
  stopAutoRefresh();

  const result = await window.api.disconnect();

  if (result.success) {
    metricsEl.innerHTML = '';
    btnCommand.disabled = true;
    setStatus('Отключено от сервера', 'success');
  } else {
    btnDisconnect.disabled = false;
    setStatus('Ошибка: ' + result.error, 'error');
  }
});

btnCommand.addEventListener('click', async () => {
  const command = document.getElementById('command').value.trim();
  const outputEl = document.getElementById('output');

  if (!command) {
    setStatus('Введите команду', 'error');
    return;
  }

  // Первый вывод заменяет заглушку, дальше результаты накапливаются
  if (!outputEl.dataset.used) {
    outputEl.textContent = '';
    outputEl.dataset.used = '1';
  }

  btnCommand.disabled = true;
  setStatus('Выполняю...', 'loading');

  const result = await window.api.exec(command);

  btnCommand.disabled = false;

  if (result.success) {
    setStatus('Команда выполнена', 'success');
    outputEl.textContent += `$ ${command}\n${result.output}\n\n`;
  } else {
    // Ошибку показываем в консоли вывода: строка статуса находится в другом
    // блоке и перезаписывается автообновлением метрик каждые 5 секунд
    setStatus('Ошибка: ' + result.error, 'error');
    outputEl.textContent += `$ ${command}\n[Ошибка] ${result.error}\n\n`;
  }
  outputEl.scrollTop = outputEl.scrollHeight;
});

let refreshInterval = null;

function startAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  updateMetrics();
  refreshInterval = setInterval(updateMetrics, 5000);
}

async function updateMetrics() {
  const result = await window.api.getMetrics();

  if (result.success) {
    renderMetrics(result.metrics);
    renderCharts();   // ← ЭТОГО НЕ ХВАТАЛО
    setStatus('Метрики обновлены: ' + new Date().toLocaleTimeString(), 'success');
  } else {
    setStatus('Ошибка обновления: ' + result.error, 'error');
    stopAutoRefresh();
  }
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

function setStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = 'status status--' + type;
}

function renderMetrics(metrics) {
  const cpu = Number(metrics.cpu) || 0;
  const ram = metrics.ram || { used: 0, total: 0, percent: 0 };
  const swap = metrics.swap || { used: 0, total: 0, percent: 0 };
  const disk = metrics.disk || { filesystem: '—', used: '—', size: '—', percent: 0 };

  metricsEl.innerHTML = `
    <div class="metric-card">
      <h3 class="metric-card__title">Uptime</h3>
      <p class="metric-card__value">${esc(metrics.uptime)}</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">CPU</h3>
      <p class="metric-card__value">${cpu}%</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${cpu}%"></div>
      </div>
      <p class="metric-card__percent">${cpu}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">RAM</h3>
      <p class="metric-card__value">${ram.used} / ${ram.total} MB</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${ram.percent}%"></div>
      </div>
      <p class="metric-card__percent">${ram.percent}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">Swap</h3>
      <p class="metric-card__value">${swap.used} / ${swap.total} MB</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${swap.percent}%"></div>
      </div>
      <p class="metric-card__percent">${swap.percent}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">Диск (${esc(disk.filesystem)})</h3>
      <p class="metric-card__value">${esc(disk.used)} / ${esc(disk.size)}</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${disk.percent}%"></div>
      </div>
      <p class="metric-card__percent">${disk.percent}%</p>
    </div>
  `;
}

async function renderCharts() {
  const result = await window.api.getHistory();
  if (!result.success) return;

  const history = result.history;
  if (history.length === 0) return;

  const labels = history.map(h => h.time);
  const cpuData = history.map(h => h.cpu);
  const ramData = history.map(h => h.ram);

  if (!ramChart) {
    const ctx = document.getElementById('chart-ram').getContext('2d');
    ramChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'RAM %',
          data: ramData,
          borderColor: '#1a73e8',
          backgroundColor: 'rgba(26, 115, 232, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
        plugins: { legend: { display: false } }
      }
    });
  } else {
    ramChart.data.labels = labels;
    ramChart.data.datasets[0].data = ramData;
    ramChart.update('none');
  }

  if (!cpuChart) {
    const ctx = document.getElementById('chart-cpu').getContext('2d');
    cpuChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CPU %',
          data: cpuData,
          borderColor: '#e53935',
          backgroundColor: 'rgba(229, 57, 53, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
        plugins: { legend: { display: false } }
      }
    });
  } else {
    cpuChart.data.labels = labels;
    cpuChart.data.datasets[0].data = cpuData;
    cpuChart.update('none');
  }
}

btnTheme.addEventListener('click', () => {
  document.body.classList.toggle('dark');
  const isDark = document.body.classList.contains('dark');
  btnTheme.textContent = isDark ? 'светлая' : 'темная';
});

