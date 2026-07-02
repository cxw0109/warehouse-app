// 认证中间件：本模式下不强制登录，但记录操作人（如有）
function requireAuth(req, res, next) {
  // 无登录模式：从 query 或 header 取操作人，没有也放行
  req.user = {
    open_id: req.headers['x-operator-id'] || req.query.operator || 'anonymous',
    name: req.headers['x-operator-name'] || req.query.operator_name || '匿名用户',
    is_admin: true
  };
  next();
}

// 管理员中间件
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user || !req.session.user.is_admin) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: '需要管理员权限'
    });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
