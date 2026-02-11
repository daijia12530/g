require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

// 导入路由
const authRoutes = require('./routes/auth');
const driverRoutes = require('./routes/drivers');
const orderRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

// 导入数据库
const { initializeDatabase } = require('./config/database');

// 导入中间件
const { errorHandler, notFound } = require('./middleware/error');
const { requestLogger } = require('./middleware/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// 创建必要的目录
const dirs = ['./backups', './logs'];
dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// 中间件配置
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'", "http://localhost:*", "ws://localhost:*"]
        }
    }
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS配置
const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
    origin: function(origin, callback) {
        // 允许没有origin的请求（如移动应用）
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = '该来源不被允许访问';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    credentials: true,
    optionsSuccessStatus: 200
}));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 请求日志
app.use(requestLogger);

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: '城际出行系统',
        version: '1.0.0'
    });
});

// 前端路由回退
app.get('*', (req, res) => {
    if (req.url.startsWith('/api')) {
        return notFound(req, res);
    }
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// 错误处理
app.use(notFound);
app.use(errorHandler);

// 启动服务器
async function startServer() {
    try {
        // 初始化数据库
        await initializeDatabase();
        
        // 创建默认管理员账户
        await createDefaultAdmin();
        
        app.listen(PORT, () => {
            console.log(`
🚗 城际出行系统 启动成功!
════════════════════════════════════════

📡 服务器地址: http://localhost:${PORT}
📱 司机端: http://localhost:${PORT}
👤 乘客端: http://localhost:${PORT}/passenger.html
📊 健康检查: http://localhost:${PORT}/health

🔐 默认管理员账号:
   手机: 13307464001
   密码: admin123

⚠️  请将 .env.example 复制为 .env 并修改配置
💾 数据文件: ./database.sqlite
📦 备份目录: ./backups/

════════════════════════════════════════
`);
        });
    } catch (error) {
        console.error('启动服务器失败:', error);
        process.exit(1);
    }
}

async function createDefaultAdmin() {
    const { createDriver } = require('./models/Driver');
    
    try {
        const adminExists = await require('./config/database').db.get(
            'SELECT id FROM drivers WHERE phone = ?', 
            [process.env.ADMIN_PHONE || '13307464001']
        );
        
        if (!adminExists) {
            const adminData = {
                phone: process.env.ADMIN_PHONE || '13307464001',
                password: process.env.ADMIN_PASSWORD || 'admin123',
                name: '系统管理员',
                plate: '桂A00001',
                role: 'admin'
            };
            
            await createDriver(adminData);
            console.log('✅ 默认管理员账户已创建');
        }
    } catch (error) {
        console.error('创建默认管理员失败:', error);
    }
}

startServer();

// 优雅关闭
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
    console.log('🛑 收到关闭信号，正在优雅关闭服务器...');
    
    // 关闭数据库连接
    const { closeDatabase } = require('./config/database');
    closeDatabase();
    
    // 执行数据库备份
    require('./utils/backup').backupDatabase();
    
    setTimeout(() => {
        console.log('👋 服务器已关闭');
        process.exit(0);
    }, 1000);
}

module.exports = app;