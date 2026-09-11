/* Informações locais: nada é enviado ao servidor. A web não expõe barras de sinal. */
(() => {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const networkEl = document.getElementById('connectionStatus');
  const batteryEl = document.getElementById('batteryStatus');
  function updateConnection() {
    const types = { wifi: 'Wi-Fi', cellular: 'Rede móvel', ethernet: 'Ethernet' };
    networkEl.textContent = navigator.onLine === false ? 'Offline' : (types[connection?.type] || 'Online');
    networkEl.title = 'Conexão informada pelo aparelho; intensidade do sinal indisponível na web. Não garante acesso ao servidor.';
  }
  updateConnection();
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  connection?.addEventListener('change', updateConnection);
  document.addEventListener('visibilitychange', updateConnection);
  if (typeof navigator.getBattery === 'function') {
    navigator.getBattery().then(battery => {
      function updateBattery() {
        const level = Math.round(battery.level * 100);
        batteryEl.textContent = `${battery.charging ? '⚡ ' : ''}${level}%`;
        batteryEl.title = `Bateria: ${level}%${battery.charging ? ' — carregando' : ''}`;
        batteryEl.setAttribute('aria-label', batteryEl.title);
      }
      updateBattery();
      battery.addEventListener('levelchange', updateBattery);
      battery.addEventListener('chargingchange', updateBattery);
      document.addEventListener('visibilitychange', updateBattery);
    }).catch(() => { /* Mantém “Bateria —” quando a API é bloqueada. */ });
  }
})();
