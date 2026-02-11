const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const db = new sqlite3.Database(DB_PATH);

// 初始化数据库表
async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // 司机表
            db.run(`
                CREATE TABLE IF NOT EXISTS drivers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    phone TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL,
                    name TEXT NOT NULL,
                    plate TEXT,
                    rating REAL DEFAULT 5.0,
                    balance REAL DEFAULT 0,
                    share_code TEXT UNIQUE,
                    settings TEXT DEFAULT '{
                        "xcToLz": 50,
                        "lzToXc": 50,
                        "xcToLb": 40,
                        "gpToXc": 20,
                        "extraPerKm": 0.8
                    }',
                    role TEXT DEFAULT 'driver',
                    is_online INTEGER DEFAULT 0,
                    last_login DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 订单表
            db.run(`
                CREATE TABLE IF NOT EXISTS orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_id TEXT UNIQUE NOT NULL,
                    driver_id INTEGER NOT NULL,
                    driver_code TEXT NOT NULL,
                    passenger_name TEXT NOT NULL,
                    passenger_phone TEXT,
                    from_location TEXT NOT NULL,
                    to_location TEXT NOT NULL,
                    amount REAL NOT NULL,
                    location_note TEXT,
                    status TEXT DEFAULT 'pending',
                    route TEXT,
                    payment_method TEXT DEFAULT 'cash',
                    payment_status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME,
                    canceled_at DATETIME,
                    FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
                )
            `);

            // 交易记录表
            db.run(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    driver_id INTEGER NOT NULL,
                    order_id TEXT,
                    type TEXT NOT NULL,
                    amount REAL NOT NULL,
                    description TEXT,
                    balance_before REAL,
                    balance_after REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (driver_id) REFERENCES drivers (id) ON DELETE CASCADE
                )
            `);

            // 系统日志表
            db.run(`
                CREATE TABLE IF NOT EXISTS system_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    level TEXT NOT NULL,
                    message TEXT NOT NULL,
                    source TEXT,
                    ip_address TEXT,
                    user_agent TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // 创建索引
            db.run(`CREATE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_drivers_share_code ON drivers(share_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_driver_id ON orders(driver_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_driver_id ON transactions(driver_id)`);

            // 添加触发器 - 更新订单时自动更新updated_at
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_orders_timestamp 
                AFTER UPDATE ON orders
                BEGIN
                    UPDATE orders SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            `);

            // 添加触发器 - 更新司机时自动更新updated_at
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_drivers_timestamp 
                AFTER UPDATE ON drivers
                BEGIN
                    UPDATE drivers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
                END
            `);

            console.log('✅ 数据库初始化完成');
            resolve();
        });
    });
}

// 关闭数据库连接
function closeDatabase() {
    db.close((err) => {
        if (err) {
            console.error('关闭数据库失败:', err.message);
        } else {
            console.log('✅ 数据库连接已关闭');
        }
    });
}

// 数据库备份
function backupDatabase() {
    const backupDir = process.env.DB_BACKUP_DIR || './backups';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `backup-${timestamp}.sqlite`);
    
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(DB_PATH);
        const writeStream = fs.createWriteStream(backupFile);
        
        readStream.pipe(writeStream);
        
        writeStream.on('finish', () => {
            console.log(`✅ 数据库已备份到: ${backupFile}`);
            
            // 清理旧备份，保留最近7天
            fs.readdir(backupDir, (err, files) => {
                if (err) return;
                
                const now = Date.now();
                const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
                
                files.forEach(file => {
                    if (file.startsWith('backup-') && file.endsWith('.sqlite')) {
                        const filePath = path.join(backupDir, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.mtimeMs < sevenDaysAgo) {
                            fs.unlinkSync(filePath);
                            console.log(`🗑️ 删除旧备份: ${file}`);
                        }
                    }
                });
            });
            
            resolve(backupFile);
        });
        
        writeStream.on('error', reject);
    });
}

module.exports = {
    db,
    initializeDatabase,
    closeDatabase,
    backupDatabase
};