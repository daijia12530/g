const jwt = require('jsonwebtoken');

// 验证JWT令牌
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: '访问令牌缺失'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'default-secret', (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: '访问令牌无效或已过期'
            });
        }
        
        req.user = user;
        next();
    });
}

// 验证管理员权限
function authenticateAdmin(req, res, next) {
    authenticateToken(req, res, () => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '需要管理员权限'
            });
        }
        next();
    });
}

// 速率限制中间件
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP最多100个请求
    message: {
        success: false,
        message: '请求过于频繁，请稍后再试'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// 登录速率限制
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 5, // 每个IP最多5次登录尝试
    message: {
        success: false,
        message: '登录尝试过多，请15分钟后再试'
    },
    skipSuccessfulRequests: true
});

// 订单创建速率限制
const orderLimiter = rateLimit({
    windowMs: 60 * 1000, // 1分钟
    max: 10, // 每个IP最多10个订单
    message: {
        success: false,
        message: '订单创建过于频繁，请稍后再试'
    }
});

module.exports = {
    authenticateToken,
    authenticateAdmin,
    apiLimiter,
    loginLimiter,
    orderLimiter
};