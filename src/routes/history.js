const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

// GET /api/history → 流水记录
router.get('/', requireAuth, (req, res) => {
  const { qr_id, operator_id, start_time, end_time, page = 1, page_size = 20 } = req.query;
  const limit = Math.min(parseInt(page_size) || 20, 100);
  const offset = ((parseInt(page) || 1) - 1) * limit;

  let sql = 'SELECT * FROM transaction_log WHERE 1=1';
  let countSql = 'SELECT COUNT(*) as total FROM transaction_log WHERE 1=1';
  const params = [];
  const countParams = [];

  if (qr_id) {
    sql += ' AND qr_id LIKE ?';
    countSql += ' AND qr_id LIKE ?';
    params.push(`%${qr_id}%`);
    countParams.push(`%${qr_id}%`);
  }
  if (operator_id) {
    sql += ' AND operator_id = ?';
    countSql += ' AND operator_id = ?';
    params.push(operator_id);
    countParams.push(operator_id);
  }
  if (start_time) {
    sql += ' AND timestamp >= ?';
    countSql += ' AND timestamp >= ?';
    params.push(start_time);
    countParams.push(start_time);
  }
  if (end_time) {
    sql += ' AND timestamp <= ?';
    countSql += ' AND timestamp <= ?';
    params.push(end_time);
    countParams.push(end_time);
  }

  const total = db.prepare(countSql).get(countParams).total;

  sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const logs = db.prepare(sql).all(params);

  res.json({ logs, total, page: parseInt(page) || 1, page_size: limit });
});

module.exports = router;
