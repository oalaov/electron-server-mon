// Получаем элементы
const btnConnect = document.getElementById('btn-connect');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const btnCommand = document.getElementById('btn-command');
const btnTheme = document.getElementById('btn-theme');

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
    startAutoRefresh();
  } else {
    setStatus('Ошибка: ' + result.error, 'error');
  }
});

btnCommand.addEventListener('click', async () => {
  const command = document.getElementById('command').value.trim();   // ← исправил commmand → command

  if (!command) {
    setStatus('Введите команду', 'error');
    return;
  }

  btnCommand.disabled = true;
  setStatus('Выполняю...', 'loading');

  const result = await window.api.exec(command);

  btnCommand.disabled = false;

  if (result.success) {
    setStatus('Команда выполнена', 'success');
    const outputEl = document.getElementById('output');
    outputEl.textContent += `$ ${command}\n\n${result.output}`;
  } else {
    setStatus('Ошибка: ' + result.error, 'error');
  }
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
  metricsEl.innerHTML = `
    <div class="metric-card">
      <h3 class="metric-card__title">Uptime</h3>
      <p class="metric-card__value">${metrics.uptime}</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">CPU</h3>
      <p class="metric-card__value">${metrics.cpu}%</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${metrics.cpu}%"></div>
      </div>
      <p class="metric-card__percent">${metrics.cpu}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">RAM</h3>
      <p class="metric-card__value">${metrics.ram.used} / ${metrics.ram.total} MB</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${metrics.ram.percent}%"></div>
      </div>
      <p class="metric-card__percent">${metrics.ram.percent}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">Swap</h3>
      <p class="metric-card__value">${metrics.swap.used} / ${metrics.swap.total} MB</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${metrics.swap.percent}%"></div>
      </div>
      <p class="metric-card__percent">${metrics.swap.percent}%</p>
    </div>

    <div class="metric-card">
      <h3 class="metric-card__title">Диск (${metrics.disk.filesystem})</h3>
      <p class="metric-card__value">${metrics.disk.used} / ${metrics.disk.size}</p>
      <div class="metric-bar">
        <div class="metric-bar__fill" style="width: ${metrics.disk.percent}%"></div>
      </div>
      <p class="metric-card__percent">${metrics.disk.percent}%</p>
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

