require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '..', 'public')));

// API 路由
app.use('/auth', require('./routes/auth'));
app.use('/api/scan', require('./routes/scan'));
app.use('/api/query', require('./routes/query'));
app.use('/api/history', require('./routes/history'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/tools', require('./routes/tools'));

// 所有其他路由返回前端页面
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ code: 'INTERNAL_ERROR', message: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`仓库管理系统启动: http://localhost:${PORT}`);
  console.log(`飞书回调地址: ${process.env.BASE_URL || `http://localhost:${PORT}`}/auth/callback`);
});
