// ===== 全局状态 =====
let currentUser = null;
let html5QrCode = null;
let scanning = false;

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  showMainPage();
});

function showMainPage() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('main-page').style.display = 'block';
  document.getElementById('user-info').textContent = currentUser.name;
  loadStats();
}

// ===== Tab 切换 =====
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  // 停止扫码
  if (tab !== 'scan' && scanning) {
    stopScan();
  }

  // 自动加载数据
  if (tab === 'locations') loadLocations();
  if (tab === 'history') loadHistory();
}

// ===== 扫码功能 =====
function startScan() {
  const el = document.getElementById('qr-reader');
  if (scanning) {
    stopScan();
    return;
  }

  html5QrCode = new Html5Qrcode('qr-reader');
  scanning = true;

  html5QrCode.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1.0
    },
    onScanSuccess,
    () => {} // 忽略扫描失败
  ).catch(err => {
    console.error('Camera error:', err);
    showToast('📷 无法访问摄像头，请手动输入编号');
    scanning = false;
  });
}

function stopScan() {
  if (html5QrCode && scanning) {
    html5QrCode.stop().then(() => {
      html5QrCode.clear();
      scanning = false;
    }).catch(() => {
      scanning = false;
    });
  }
}

function onScanSuccess(decodedText) {
  stopScan();
  doScan(decodedText);
}

function manualSubmit() {
  const input = document.getElementById('manual-qr');
  const val = input.value.trim();
  if (!val) {
    showToast('请输入工装编号');
    return;
  }
  doScan(val);
  input.value = '';
}

// Enter 键提交
document.getElementById('manual-qr')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') manualSubmit();
});

async function doScan(qrId) {
  const resultEl = document.getElementById('scan-result');
  resultEl.style.display = 'block';
  resultEl.className = 'result-card';
  resultEl.textContent = '⏳ 处理中...';

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qr_id: qrId })
    });
    const data = await res.json();

    if (data.success) {
      resultEl.className = 'result-card success';
      resultEl.textContent = data.message;
      loadStats(); // 刷新统计
    } else {
      resultEl.className = 'result-card error';
      resultEl.textContent = data.message;
    }
  } catch (err) {
    resultEl.className = 'result-card error';
    resultEl.textContent = '❌ 网络错误，请重试';
  }
}

// ===== 库位统计 =====
async function loadStats() {
  try {
    const res = await fetch('/api/scan/stats');
    const data = await res.json();
    document.getElementById('stat-total').textContent = data.total;
    document.getElementById('stat-occupied').textContent = data.occupied;
    document.getElementById('stat-vacant').textContent = data.vacant;
    document.getElementById('stat-pct').textContent = data.pct + '%';
  } catch {}
}

// ===== 查询 =====
async function doQuery() {
  const input = document.getElementById('query-input').value.trim();
  if (!input) {
    showToast('请输入查询内容');
    return;
  }

  const container = document.getElementById('query-results');
  container.innerHTML = '<div class="loading">查询中...</div>';

  try {
    const params = new URLSearchParams();
    // 智能判断：纯数字或带前缀 → qr_id，否则 → name
    if (/^[A-Za-z0-9_-]+$/.test(input) && input.length <= 20) {
      params.set('qr_id', input);
    } else {
      params.set('name', input);
    }

    const res = await fetch(`/api/query?${params}`);
    const data = await res.json();

    if (data.results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <p>未找到匹配的工装</p>
        </div>`;
      return;
    }

    container.innerHTML = data.results.map(r => {
      const badgeClass = r.status === 'occupied' ? 'badge-occupied'
        : r.status === 'vacant' ? 'badge-vacant' : 'badge-out';
      const statusText = r.status === 'occupied' ? '在库'
        : r.status === 'vacant' ? '空闲' : '不在库';

      return `
        <div class="list-item">
          <div class="list-item-header">
            <span class="list-item-name">🔧 ${r.name}</span>
            <span class="list-item-badge ${badgeClass}">${statusText}</span>
          </div>
          <div class="list-item-detail">
            编号: ${r.qr_id}<br>
            ${r.location ? `📍 ${r.location}` : '📍 不在库'}<br>
            ${r.responsible_person ? `👤 ${r.responsible_person}` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">❌ 查询失败</div>';
  }
}

// Enter 键查询
document.getElementById('query-input')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') doQuery();
});

// ===== 历史流水 =====
async function loadHistory() {
  const container = document.getElementById('history-list');
  container.innerHTML = '<div class="loading">加载中...</div>';

  const qrId = document.getElementById('history-qr')?.value?.trim() || '';
  const start = document.getElementById('history-start')?.value || '';
  const end = document.getElementById('history-end')?.value || '';

  const params = new URLSearchParams();
  if (qrId) params.set('qr_id', qrId);
  if (start) params.set('start_time', start);
  if (end) params.set('end_time', end + ' 23:59:59');

  try {
    const res = await fetch(`/api/history?${params}`);
    const data = await res.json();

    if (data.logs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <p>暂无流水记录</p>
        </div>`;
      return;
    }

    container.innerHTML = data.logs.map(log => {
      const isIn = log.action === 'in';
      return `
        <div class="list-item history-item">
          <div class="history-icon ${isIn ? 'in' : 'out'}">
            ${isIn ? '⬆️' : '⬇️'}
          </div>
          <div class="history-info">
            <div class="history-action">
              ${isIn ? '入库' : '出库'} · ${log.qr_id}
            </div>
            <div class="history-detail">
              📍 ${log.location_code} · ${log.operator_name} · ${log.timestamp}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state">❌ 加载失败</div>';
  }
}

// ===== 库位管理 =====
async function loadLocations() {
  const container = document.getElementById('location-list');
  container.innerHTML = '<div class="loading">加载中...</div>';

  const zone = document.getElementById('loc-zone')?.value || '';
  const status = document.getElementById('loc-status')?.value || '';

  const params = new URLSearchParams();
  if (zone) params.set('zone', zone);
  if (status) params.set('status', status);

  try {
    const res = await fetch(`/api/locations?${params}`);
    const data = await res.json();

    if (data.details.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📍</div>
          <p>暂无库位数据</p>
          <p style="font-size:13px;margin-top:8px;color:#999">请联系管理员添加库位</p>
        </div>`;
      return;
    }

    // 更新区筛选选项
    const zones = [...new Set(data.details.map(d => d.zone))].sort();
    const zoneSelect = document.getElementById('loc-zone');
    if (zoneSelect && zoneSelect.options.length <= 1) {
      zones.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z;
        opt.textContent = z + '区';
        zoneSelect.appendChild(opt);
      });
    }

    container.innerHTML = `
      <div style="font-size:13px;color:#666;margin-bottom:8px">
        共 ${data.total} 个库位 · 已用 ${data.occupied} · 空闲 ${data.vacant} (${data.occupancy_pct}%)
      </div>
      ${data.details.map(d => `
        <div class="list-item">
          <div class="list-item-header">
            <span class="list-item-name">📍 ${d.location_code}</span>
            <span class="list-item-badge ${d.status === 'occupied' ? 'badge-occupied' : 'badge-vacant'}">
              ${d.status === 'occupied' ? '已占用' : '空闲'}
            </span>
          </div>
          ${d.occupied_tool_id ? `<div class="list-item-detail">🔧 ${d.occupied_tool_id}</div>` : ''}
        </div>
      `).join('')}`;
  } catch (err) {
    container.innerHTML = '<div class="empty-state">❌ 加载失败</div>';
  }
}

// ===== Toast 提示 =====
function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}
