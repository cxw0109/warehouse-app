const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/locations → 库位总览
router.get('/', requireAuth, (req, res) => {
  const { zone, status } = req.query;

  let sql = 'SELECT * FROM location_table WHERE 1=1';
  const params = [];

  if (zone) {
    sql += ' AND zone = ?';
    params.push(zone);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY location_code ASC';
  const details = db.prepare(sql).all(params);

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

  res.json({ total, occupied, vacant, occupancy_pct: pct, details });
});

// POST /api/locations/manage → 库位管理（管理员）
router.post('/manage', requireAuth, requireAdmin, (req, res) => {
  const { action, location_codes, reason } = req.body;

  if (!action || !location_codes || !Array.isArray(location_codes) || location_codes.length === 0) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: '参数不完整' });
  }

  const LOCATION_REGEX = /^[A-Z]-\d{2}-\d{2}$/;
  const invalidCodes = location_codes.filter(c => !LOCATION_REGEX.test(c));
  if (invalidCodes.length > 0) {
    return res.status(400).json({
      code: 'INVALID_FORMAT',
      message: `库位编码格式错误: ${invalidCodes.join(', ')}（应为 X-NN-MM，如 A-01-01）`
    });
  }

  if ((action === 'remove' || action === 'disable') && !reason) {
    return res.status(400).json({ code: 'REASON_REQUIRED', message: '删除/停用必须填写原因' });
  }

  let affected = 0;
  const stmts = {
    add: db.prepare(`
      INSERT OR IGNORE INTO location_table (location_code, status) VALUES (?, 'vacant')
    `),
    remove: db.prepare('DELETE FROM location_table WHERE location_code = ? AND occupied_tool_id IS NULL'),
    disable: db.prepare("UPDATE location_table SET status = 'disabled' WHERE location_code = ? AND status = 'vacant'")
  };

  const tx = db.transaction(() => {
    for (const code of location_codes) {
      const result = stmts[action].run(code);
      affected += result.changes;
    }
  });

  try {
    tx();
    const actionText = { add: '添加', remove: '删除', disable: '停用' };
    res.json({
      success: true,
      affected,
      message: `成功${actionText[action] || action} ${affected} 个库位${reason ? `（原因: ${reason}）` : ''}`
    });
  } catch (err) {
    res.status(500).json({ code: 'DB_ERROR', message: err.message });
  }
});

module.exports = router;
