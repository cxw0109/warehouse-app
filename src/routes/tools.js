const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/tools → 工装列表
router.get('/', requireAuth, (req, res) => {
  const { name, qr_id } = req.query;
  let sql = `
    SELECT t.*,
      l.location_code,
      l.status as loc_status
    FROM tool_archive t
    LEFT JOIN location_table l ON l.occupied_tool_id = t.qr_id
    WHERE 1=1
  `;
  const params = [];

  if (name) {
    sql += ' AND t.name LIKE ?';
    params.push(`%${name}%`);
  }
  if (qr_id) {
    sql += ' AND t.qr_id LIKE ?';
    params.push(`%${qr_id}%`);
  }

  sql += ' ORDER BY t.name ASC';
  const tools = db.prepare(sql).all(params);

  res.json({
    results: tools.map(t => ({
      ...t,
      current_location: t.location_code || null,
      status: t.location_code ? t.loc_status : 'out_of_warehouse'
    }))
  });
});

// POST /api/tools → 新增工装（管理员）
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { qr_id, name, spec, responsible_person, image_url } = req.body;

  if (!qr_id || !name) {
    return res.status(400).json({ code: 'INVALID_INPUT', message: 'qr_id 和 name 必填' });
  }

  try {
    db.prepare(`
      INSERT INTO tool_archive (qr_id, name, spec, responsible_person, image_url)
      VALUES (?, ?, ?, ?, ?)
    `).run(qr_id.trim(), name, spec || '', responsible_person || '', image_url || '');

    res.json({ success: true, message: `工装 ${name} 已添加` });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ code: 'DUPLICATE', message: `工装 ${qr_id} 已存在` });
    }
    res.status(500).json({ code: 'DB_ERROR', message: err.message });
  }
});

// PUT /api/tools/:qr_id → 修改工装（管理员）
router.put('/:qr_id', requireAuth, requireAdmin, (req, res) => {
  const { qr_id } = req.params;
  const { name, spec, responsible_person, image_url } = req.body;

  const existing = db.prepare('SELECT * FROM tool_archive WHERE qr_id = ?').get(qr_id);
  if (!existing) {
    return res.status(404).json({ code: 'NOT_FOUND', message: '工装不存在' });
  }

  db.prepare(`
    UPDATE tool_archive
    SET name = ?, spec = ?, responsible_person = ?, image_url = ?
    WHERE qr_id = ?
  `).run(
    name || existing.name,
    spec ?? existing.spec,
    responsible_person ?? existing.responsible_person,
    image_url ?? existing.image_url,
    qr_id
  );

  res.json({ success: true, message: '已更新' });
});

// DELETE /api/tools/:qr_id → 删除工装（管理员，需先出库）
router.delete('/:qr_id', requireAuth, requireAdmin, (req, res) => {
  const { qr_id } = req.params;

  const location = db.prepare(
    'SELECT location_code FROM location_table WHERE occupied_tool_id = ?'
  ).get(qr_id);

  if (location) {
    return res.status(400).json({
      code: 'STILL_IN_WAREHOUSE',
      message: `该工装仍在库位 ${location.location_code}，请先出库`
    });
  }

  db.prepare('DELETE FROM tool_archive WHERE qr_id = ?').run(qr_id);
  res.json({ success: true, message: '已删除' });
});

module.exports = router;
