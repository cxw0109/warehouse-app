const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// 防重复扫缓存（内存，5秒窗口）
const scanCache = new Map();
const DEDUP_INTERVAL = parseInt(process.env.DUPLICATE_INTERVAL_MS || '5000');

// GET /api/scan/stats → 库位占用统计
router.get('/stats', requireAuth, (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
      SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant
    FROM location_table
  `).get();

  const total = stats.total || 0;
  const occupied = stats.occupied || 0;
  const vacant = stats.vacant || 0;
  const pct = total > 0 ? Math.round(occupied / total * 100) : 0;

  res.json({ total, occupied, vacant, pct });
});

// POST /api/scan → 扫码出入库
router.post('/', requireAuth, (req, res) => {
  const { qr_id } = req.body;
  const operator_id = req.user.open_id;
  const operator_name = req.user.name;

  if (!qr_id || !qr_id.trim()) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: '请提供工装二维码' });
  }

  const trimmedQr = qr_id.trim();

  // Step 1: 防重复扫
  const cacheKey = `${operator_id}:${trimmedQr}`;
  const lastScan = scanCache.get(cacheKey);
  if (lastScan && (Date.now() - lastScan) < DEDUP_INTERVAL) {
    return res.json({ code: 'DUPLICATE', message: '⏳ 5秒内重复扫码，已自动忽略' });
  }
  scanCache.set(cacheKey, Date.now());

  // 定期清理过期缓存
  if (scanCache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of scanCache) {
      if (now - v > DEDUP_INTERVAL) scanCache.delete(k);
    }
  }

  // Step 2: 校验工装存在
  const tool = db.prepare('SELECT * FROM tool_archive WHERE qr_id = ?').get(trimmedQr);
  if (!tool) {
    return res.json({ code: 'TOOL_NOT_FOUND', message: '❌ 未找到该工装，请检查二维码或联系管理员' });
  }

  // Step 3: 查库位状态
  const location = db.prepare(
    'SELECT * FROM location_table WHERE occupied_tool_id = ?'
  ).get(trimmedQr);

  // Step 4: 执行出入库
  if (location) {
    // === 出库 ===
    const update = db.prepare(`
      UPDATE location_table
      SET occupied_tool_id = NULL, status = 'vacant'
      WHERE location_code = ? AND occupied_tool_id = ?
    `).run(location.location_code, trimmedQr);

    if (update.changes === 0) {
      return res.json({ code: 'CONCURRENT_CONFLICT', message: '⚠️ 该工装正在被其他人操作，请稍后重试' });
    }

    // 写流水
    db.prepare(`
      INSERT INTO transaction_log (qr_id, action, location_code, operator_id, operator_name)
      VALUES (?, 'out', ?, ?, ?)
    `).run(trimmedQr, location.location_code, operator_id, operator_name);

    // 查最新统计
    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant
      FROM location_table
    `).get();
    const total = stats.total || 0;
    const occupied = stats.occupied || 0;
    const pct = total > 0 ? Math.round(occupied / total * 100) : 0;

    return res.json({
      success: true,
      action: 'out',
      tool_name: tool.name,
      location: location.location_code,
      status: '已释放',
      message: `🔧 ${tool.name}\n⬇️ 出库成功\n📍 库位：${location.location_code}\n🟢 该库位已释放\n📊 库位占用: ${occupied}/${total} (${pct}%)`
    });

  } else {
    // === 入库 ===
    // 找空库位（按编码升序）
    const vacant = db.prepare(
      "SELECT location_code FROM location_table WHERE status = 'vacant' ORDER BY location_code ASC LIMIT 1"
    ).get();

    if (!vacant) {
      // 查总数用于提示
      const stats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
          SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant
        FROM location_table
      `).get();
      const total = stats.total || 0;
      const occupied = stats.occupied || 0;
      const vacantCount = stats.vacant || 0;

      return res.json({
        code: 'LOCATION_FULL',
        message: `🚨 库位已满！\n总库位：${total} | 已用：${occupied} | 空闲：${vacantCount}\n请释放部分库位后再入库`
      });
    }

    // 占用库位（带条件，防并发）
    const update = db.prepare(`
      UPDATE location_table
      SET occupied_tool_id = ?, status = 'occupied'
      WHERE location_code = ? AND status = 'vacant'
    `).run(trimmedQr, vacant.location_code);

    if (update.changes === 0) {
      // 被别人抢了，重试一次
      const retry = db.prepare(
        "SELECT location_code FROM location_table WHERE status = 'vacant' ORDER BY location_code ASC LIMIT 1"
      ).get();
      if (!retry) {
        return res.json({ code: 'LOCATION_FULL', message: '🚨 库位已满！' });
      }
      db.prepare(`
        UPDATE location_table SET occupied_tool_id = ?, status = 'occupied'
        WHERE location_code = ? AND status = 'vacant'
      `).run(trimmedQr, retry.location_code);

      db.prepare(`
        INSERT INTO transaction_log (qr_id, action, location_code, operator_id, operator_name)
        VALUES (?, 'in', ?, ?, ?)
      `).run(trimmedQr, retry.location_code, operator_id, operator_name);

      const stats = db.prepare(`
        SELECT COUNT(*) as total,
          SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
          SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant
        FROM location_table
      `).get();
      const total = stats.total || 0;
      const occupied = stats.occupied || 0;
      const pct = total > 0 ? Math.round(occupied / total * 100) : 0;

      return res.json({
        success: true,
        action: 'in',
        tool_name: tool.name,
        location: retry.location_code,
        status: '已占用',
        message: `🔧 ${tool.name}\n⬆️ 入库成功\n📍 分配库位：${retry.location_code}\n🔴 该库位已被占用\n📊 库位占用: ${occupied}/${total} (${pct}%)`
      });
    }

    // 写流水
    db.prepare(`
      INSERT INTO transaction_log (qr_id, action, location_code, operator_id, operator_name)
      VALUES (?, 'in', ?, ?, ?)
    `).run(trimmedQr, vacant.location_code, operator_id, operator_name);

    const stats = db.prepare(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'vacant' THEN 1 ELSE 0 END) as vacant
      FROM location_table
    `).get();
    const total = stats.total || 0;
    const occupied = stats.occupied || 0;
    const pct = total > 0 ? Math.round(occupied / total * 100) : 0;

    return res.json({
      success: true,
      action: 'in',
      tool_name: tool.name,
      location: vacant.location_code,
      status: '已占用',
      message: `🔧 ${tool.name}\n⬆️ 入库成功\n📍 分配库位：${vacent.location_code}\n🔴 该库位已被占用\n📊 库位占用: ${occupied}/${total} (${pct}%)`
    });
  }
});

module.exports = router;
