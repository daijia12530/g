const winston = require('winston');
const path = require('path');

// 创建日志目录
const logDir = path.join(__dirname, '../logs');
require('fs').mkdirSync(logDir, { recursive: true });

// 创建日志记录器
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: 'city-transport-system' },
    transports: [
        // 错误日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error'
        }),
        // 所有日志文件
        new winston.transports.File({
            filename: path.join(logDir, 'combined.log')
        })
    ]
});

// 如果不是生产环境，也输出到控制台
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        )
    }));
}

// 请求日志中间件
function requestLogger(req, res, next) {
    const start = Date.now();
    
    // 记录请求开始
    logger.info({
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
    });
    
    // 响应完成后记录
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // 记录到数据库
        const { db } = require('../config/database');
        db.run(`
            INSERT INTO system_logs (level, message, source, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?)
        `, [
            'info',
            `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
            req.originalUrl,
            req.ip,
            req.headers['user-agent']
        ]);
        
        logger.info({
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip
        });
    });
    
    next();
}

module.exports = {
    logger,
    requestLogger
};