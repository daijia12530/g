// 404中间件
function notFound(req, res, next) {
    const error = new Error(`未找到 - ${req.originalUrl}`);
    res.status(404);
    next(error);
}

// 错误处理中间件
function errorHandler(err, req, res, next) {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    
    // 记录错误日志
    const { db } = require('../config/database');
    db.run(`
        INSERT INTO system_logs (level, message, source, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?)
    `, ['error', err.message, req.originalUrl, req.ip, req.headers['user-agent']]);
    
    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
}

module.exports = {
    notFound,
    errorHandler
};