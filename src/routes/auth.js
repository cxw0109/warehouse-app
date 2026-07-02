const express = require('express');
const axios = require('axios');
const router = express.Router();

const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// 管理员 open_id 列表（逗号分隔）
const ADMIN_IDS = (process.env.ADMIN_OPEN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

// GET /auth/login → 重定向到飞书授权页
router.get('/login', (req, res) => {
  const redirectUri = `${BASE_URL}/auth/callback`;
  const state = Math.random().toString(36).substring(2);
  req.session.oauthState = state;

  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize` +
    `?app_id=${FEISHU_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}`;

  res.redirect(authUrl);
});

// GET /auth/callback → 飞书回调，换取 token
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (state !== req.session.oauthState) {
    return res.status(403).send('state 校验失败，请重新登录');
  }

  try {
    // 1. 获取 tenant_access_token
    const tokenRes = await axios.post(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      { app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }
    );
    const tenantToken = tokenRes.data.tenant_access_token;

    // 2. 用 code 换取 user_access_token
    const userTokenRes = await axios.post(
      'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token',
      { grant_type: 'authorization_code', code },
      { headers: { Authorization: `Bearer ${tenantToken}` } }
    );
    const { access_token, open_id, name } = userTokenRes.data.data;

    // 3. 存入 session
    req.session.user = {
      open_id,
      name: name || '未知用户',
      access_token,
      is_admin: ADMIN_IDS.includes(open_id)
    };

    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.status(500).send('登录失败，请重试');
  }
});

// GET /auth/me → 获取当前用户信息
router.get('/me', (req, res) => {
  if (!req.session?.user) {
    return res.json({ logged_in: false });
  }
  res.json({
    logged_in: true,
    name: req.session.user.name,
    open_id: req.session.user.open_id,
    is_admin: req.session.user.is_admin
  });
});

// GET /auth/logout → 退出登录
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

module.exports = router;
