const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/query → 查询工装/库位
router.get('/', requireAuth, (req, res) => {
  const { qr_id, name, location, status } = req.query;

  let sql = `
    SELECT
      t.qr_id,
      t.name,
      t.spec,
      t.responsible_person,
      l.location_code,
      l.status
    FROM tool_archive t
    LEFT JOIN location_table l ON l.occupied_tool_id = t.qr_id
    WHERE 1=1
  `;
  const params = [];

  if (qr_id) {
    sql += ' AND t.qr_id LIKE ?';
    params.push(`%${qr_id}%`);
  }
  if (name) {
    sql += ' AND t.name LIKE ?';
    params.push(`%${name}%`);
  }
  if (location) {
    sql += ' AND l.location_code LIKE ?';
    params.push(`%${location}%`);
  }
  if (status === 'out_of_warehouse') {
    sql += ' AND l.location_code IS NULL';
  } else if (status === 'occupied') {
    sql += " AND l.status = 'occupied'";
  } else if (status === 'vacant') {
    sql += " AND l.status = 'vacant'";
  }

  sql += ' ORDER BY t.name ASC';

  const results = db.prepare(sql).all(params);

  // 转换状态
  const formatted = results.map(r => ({
    qr_id: r.qr_id,
    name: r.name,
    spec: r.spec,
    responsible_person: r.responsible_person,
    location: r.location_code,
    status: r.location_code ? r.status : 'out_of_warehouse'
  }));

  res.json({ results: formatted, total: formatted.length });
});

module.exports = router;
