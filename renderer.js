// Получаем элементы
const btnConnect = document.getElementById('btn-connect');
const btnRefresh = document.getElementById('btn-refresh');
const statusEl = document.getElementById('status');
const metricsEl = document.getElementById('metrics');
const btnCommand = document.getElementById('btn-command');
const commmandEl = document.getElementById('output');

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

  setStatus('⏳ Подключение...', 'loading');
  btnConnect.disabled = true;

  const result = await window.api.connect(config);

  btnConnect.disabled = false;

  if (result.success) {
    setStatus('✅ Подключено к ' + config.host, 'success');
    btnRefresh.disabled = false;
  } else {
    setStatus('❌ Ошибка: ' + result.error, 'error');
    btnRefresh.disabled = true;
  }
});

btnRefresh.addEventListener('click', async () => {
  setStatus('⏳ Загрузка метрик...', 'loading');
  btnRefresh.disabled = true;

  const result = await window.api.getMetrics();

  btnRefresh.disabled = false;

  if (result.success) {
    setStatus('✅ Метрики обновлены', 'success');
    renderMetrics(result.metrics);
  } else {
    setStatus('❌ Ошибка: ' + result.error, 'error');
  }
});

btnCommand.addEventListener('click', async () => {
  const command = document.getElementById('commmand').value.trim();

  if (!command) {
    setStatus('❌ Введите команду', 'error');
    return;
  }

  btnCommand.disabled = true;
  setStatus('⏳ Выполняю...', 'loading');

  const result = await window.api.exec(command);

  btnCommand.disabled = false;

  if (result.success) {
    setStatus('✅ Команда выполнена', 'success');


    const outputEl = document.getElementById('output');
    outputEl.textContent = `$ ${command}\n\n${result.output}`;
  } else {
    setStatus('❌ Ошибка: ' + result.error, 'error');
  }
});


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

