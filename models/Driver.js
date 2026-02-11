const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/database');

class Driver {
    // 创建司机账户
    static async create(data) {
        const {
            phone,
            password,
            name = `司机${phone.slice(-4)}`,
            plate = `桂B${Math.floor(Math.random() * 90000 + 10000)}`,
            role = 'driver'
        } = data;
        
        // 生成分享码
        const shareCode = this.generateShareCode();
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);
        
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO drivers (phone, password, name, plate, share_code, role)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [phone, hashedPassword, name, plate, shareCode, role], function(err) {
                if (err) {
                    if (err.code === 'SQLITE_CONSTRAINT') {
                        return reject(new Error('手机号已存在'));
                    }
                    return reject(err);
                }
                
                const driverId = this.lastID;
                resolve({
                    id: driverId,
                    phone,
                    name,
                    plate,
                    shareCode,
                    role,
                    balance: 0,
                    rating: 5.0,
                    isOnline: false,
                    settings: {
                        xcToLz: 50,
                        lzToXc: 50,
                        xcToLb: 40,
                        gpToXc: 20,
                        extraPerKm: 0.8
                    }
                });
            });
        });
    }
    
    // 司机登录
    static async login(phone, password) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM drivers WHERE phone = ?', [phone], async (err, driver) => {
                if (err) return reject(err);
                if (!driver) return resolve(null);
                
                // 验证密码
                const isValid = await bcrypt.compare(password, driver.password);
                if (!isValid) return resolve(null);
                
                // 更新最后登录时间
                db.run('UPDATE drivers SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [driver.id]);
                
                // 生成JWT令牌
                const token = jwt.sign(
                    { 
                        id: driver.id, 
                        phone: driver.phone,
                        role: driver.role 
                    },
                    process.env.JWT_SECRET || 'default-secret',
                    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
                );
                
                // 格式化返回数据
                const driverData = {
                    id: driver.id,
                    phone: driver.phone,
                    name: driver.name,
                    plate: driver.plate,
                    shareCode: driver.share_code,
                    rating: driver.rating,
                    balance: driver.balance,
                    isOnline: driver.is_online === 1,
                    settings: JSON.parse(driver.settings || '{}'),
                    role: driver.role,
                    lastLogin: driver.last_login,
                    createdAt: driver.created_at
                };
                
                resolve({ driver: driverData, token });
            });
        });
    }
    
    // 通过ID获取司机
    static async findById(id) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM drivers WHERE id = ?', [id], (err, driver) => {
                if (err) return reject(err);
                if (!driver) return resolve(null);
                
                resolve(this.formatDriver(driver));
            });
        });
    }
    
    // 通过分享码获取司机
    static async findByShareCode(code) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM drivers WHERE share_code = ?', [code], (err, driver) => {
                if (err) return reject(err);
                if (!driver) return resolve(null);
                
                resolve(this.formatDriver(driver));
            });
        });
    }
    
    // 通过手机号获取司机
    static async findByPhone(phone) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM drivers WHERE phone = ?', [phone], (err, driver) => {
                if (err) return reject(err);
                if (!driver) return resolve(null);
                
                resolve(this.formatDriver(driver));
            });
        });
    }
    
    // 更新司机信息
    static async update(id, data) {
        const updates = [];
        const values = [];
        
        if (data.name !== undefined) {
            updates.push('name = ?');
            values.push(data.name);
        }
        
        if (data.plate !== undefined) {
            updates.push('plate = ?');
            values.push(data.plate);
        }
        
        if (data.isOnline !== undefined) {
            updates.push('is_online = ?');
            values.push(data.isOnline ? 1 : 0);
        }
        
        if (data.settings !== undefined) {
            updates.push('settings = ?');
            values.push(JSON.stringify(data.settings));
        }
        
        if (data.balance !== undefined) {
            updates.push('balance = ?');
            values.push(data.balance);
        }
        
        if (updates.length === 0) return this.findById(id);
        
        values.push(id);
        
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE drivers SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                values,
                async (err) => {
                    if (err) return reject(err);
                    resolve(await this.findById(id));
                }
            );
        });
    }
    
    // 刷新分享码
    static async refreshShareCode(id) {
        const newCode = this.generateShareCode();
        
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE drivers SET share_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newCode, id],
                (err) => {
                    if (err) return reject(err);
                    resolve(newCode);
                }
            );
        });
    }
    
    // 更新司机状态
    static async updateStatus(id, isOnline) {
        return new Promise((resolve, reject) => {
            db.run(
                'UPDATE drivers SET is_online = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [isOnline ? 1 : 0, id],
                (err) => {
                    if (err) return reject(err);
                    resolve(isOnline);
                }
            );
        });
    }
    
    // 获取司机统计数据
    static async getStats(id) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            
            db.get(`
                SELECT 
                    COUNT(CASE WHEN status = 'completed' AND DATE(created_at) = ? THEN 1 END) as todayOrders,
                    COALESCE(SUM(CASE WHEN status = 'completed' AND DATE(created_at) = ? THEN amount END), 0) as todayIncome,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as totalOrders,
                    COALESCE(balance, 0) as balance
                FROM orders 
                LEFT JOIN drivers ON drivers.id = orders.driver_id
                WHERE driver_id = ?
                GROUP BY drivers.id
            `, [today, today, id], (err, stats) => {
                if (err) return reject(err);
                
                resolve({
                    todayOrders: stats?.todayOrders || 0,
                    todayIncome: stats?.todayIncome || 0,
                    totalOrders: stats?.totalOrders || 0,
                    balance: stats?.balance || 0
                });
            });
        });
    }
    
    // 生成分享码
    static generateShareCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }
    
    // 格式化司机数据
    static formatDriver(driver) {
        return {
            id: driver.id,
            phone: driver.phone,
            name: driver.name,
            plate: driver.plate,
            shareCode: driver.share_code,
            rating: driver.rating,
            balance: driver.balance,
            isOnline: driver.is_online === 1,
            settings: JSON.parse(driver.settings || '{}'),
            role: driver.role,
            lastLogin: driver.last_login,
            createdAt: driver.created_at,
            updatedAt: driver.updated_at
        };
    }
    
    // 获取所有在线司机
    static async getOnlineDrivers() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM drivers WHERE is_online = 1', (err, drivers) => {
                if (err) return reject(err);
                resolve(drivers.map(driver => this.formatDriver(driver)));
            });
        });
    }
    
    // 获取所有司机（管理员用）
    static async getAllDrivers() {
        return new Promise((resolve, reject) => {
            db.all('SELECT * FROM drivers ORDER BY created_at DESC', (err, drivers) => {
                if (err) return reject(err);
                resolve(drivers.map(driver => this.formatDriver(driver)));
            });
        });
    }
    
    // 修改密码
    static async changePassword(id, oldPassword, newPassword) {
        return new Promise((resolve, reject) => {
            // 首先获取司机信息
            db.get('SELECT password FROM drivers WHERE id = ?', [id], async (err, driver) => {
                if (err) return reject(err);
                if (!driver) return reject(new Error('司机不存在'));
                
                // 验证旧密码
                const isValid = await bcrypt.compare(oldPassword, driver.password);
                if (!isValid) return reject(new Error('原密码错误'));
                
                // 加密新密码
                const hashedPassword = await bcrypt.hash(newPassword, 10);
                
                // 更新密码
                db.run('UPDATE drivers SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                    [hashedPassword, id], 
                    (err) => {
                        if (err) return reject(err);
                        resolve(true);
                    }
                );
            });
        });
    }
    
    // 添加余额（收入入账）
    static async addBalance(id, amount, description = '订单收入') {
        return new Promise((resolve, reject) => {
            db.run('UPDATE drivers SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                [amount, id], 
                (err) => {
                    if (err) return reject(err);
                    
                    // 记录交易
                    db.get('SELECT balance FROM drivers WHERE id = ?', [id], (err, driver) => {
                        db.run(`
                            INSERT INTO transactions (driver_id, type, amount, description, balance_after)
                            VALUES (?, 'income', ?, ?, ?)
                        `, [id, amount, description, driver.balance]);
                        
                        resolve(driver.balance);
                    });
                }
            );
        });
    }
    
    // 扣除余额（提现）
    static async deductBalance(id, amount, description = '提现') {
        return new Promise((resolve, reject) => {
            // 检查余额是否足够
            db.get('SELECT balance FROM drivers WHERE id = ?', [id], (err, driver) => {
                if (err) return reject(err);
                if (driver.balance < amount) return reject(new Error('余额不足'));
                
                db.run('UPDATE drivers SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                    [amount, id], 
                    (err) => {
                        if (err) return reject(err);
                        
                        // 记录交易
                        db.get('SELECT balance FROM drivers WHERE id = ?', [id], (err, driver) => {
                            db.run(`
                                INSERT INTO transactions (driver_id, type, amount, description, balance_after)
                                VALUES (?, 'withdrawal', ?, ?, ?)
                            `, [id, amount, description, driver.balance]);
                            
                            resolve(driver.balance);
                        });
                    }
                );
            });
        });
    }
}

module.exports = Driver;