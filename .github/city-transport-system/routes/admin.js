const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { authenticateAdmin } = require('../middleware/auth');

// 获取所有司机（管理员）
router.get('/drivers', authenticateAdmin, async (req, res) => {
    try {
        const drivers = await Driver.getAllDrivers();
        
        res.json({
            success: true,
            drivers,
            count: drivers.length
        });
    } catch (error) {
        console.error('获取司机列表失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取司机列表失败'
        });
    }
});

// 获取所有订单（管理员）
router.get('/orders', authenticateAdmin, async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const orders = await Order.getAllOrders(parseInt(limit), parseInt(offset));
        
        res.json({
            success: true,
            orders,
            count: orders.length
        });
    } catch (error) {
        console.error('获取订单列表失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取订单列表失败'
        });
    }
});

// 获取系统统计
router.get('/stats', authenticateAdmin, async (req, res) => {
    try {
        const { db } = require('../config/database');
        
        // 并行获取所有统计
        const [
            driversCount,
            ordersCount,
            completedOrders,
            totalIncome,
            todayOrders,
            onlineDrivers
        ] = await Promise.all([
            new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM drivers', (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            }),
            new Promise((resolve, reject) => {
                db.get('SELECT COUNT(*) as count FROM orders', (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            }),
            new Promise((resolve, reject) => {
                db.get("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            }),
            new Promise((resolve, reject) => {
                db.get("SELECT COALESCE(SUM(amount), 0) as total FROM orders WHERE status = 'completed'", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.total);
                });
            }),
            new Promise((resolve, reject) => {
                const today = new Date().toISOString().split('T')[0];
                db.get("SELECT COUNT(*) as count FROM orders WHERE DATE(created_at) = ?", [today], (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            }),
            new Promise((resolve, reject) => {
                db.get("SELECT COUNT(*) as count FROM drivers WHERE is_online = 1", (err, result) => {
                    if (err) reject(err);
                    else resolve(result.count);
                });
            })
        ]);
        
        // 获取最近7天订单趋势
        const weekTrends = await new Promise((resolve, reject) => {
            const trends = [];
            for (let i = 6; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                db.get(`
                    SELECT 
                        COUNT(*) as count,
                        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount END), 0) as income
                    FROM orders 
                    WHERE DATE(created_at) = ?
                `, [dateStr], (err, result) => {
                    if (err) reject(err);
                    
                    trends.push({
                        date: dateStr,
                        orders: result?.count || 0,
                        income: result?.income || 0
                    });
                    
                    if (trends.length === 7) {
                        resolve(trends);
                    }
                });
            }
        });
        
        res.json({
            success: true,
            stats: {
                driversCount,
                ordersCount,
                completedOrders,
                totalIncome,
                todayOrders,
                onlineDrivers,
                avgOrderValue: completedOrders > 0 ? totalIncome / completedOrders : 0,
                weekTrends
            }
        });
    } catch (error) {
        console.error('获取系统统计失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取系统统计失败'
        });
    }
});

// 获取系统日志
router.get('/logs', authenticateAdmin, async (req, res) => {
    try {
        const { limit = 100, level } = req.query;
        const { db } = require('../config/database');
        
        let query = 'SELECT * FROM system_logs';
        const params = [];
        
        if (level) {
            query += ' WHERE level = ?';
            params.push(level);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        
        db.all(query, params, (err, logs) => {
            if (err) {
                console.error('获取日志失败:', err);
                return res.status(500).json({
                    success: false,
                    message: '获取日志失败'
                });
            }
            
            res.json({
                success: true,
                logs,
                count: logs.length
            });
        });
    } catch (error) {
        console.error('获取系统日志失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取系统日志失败'
        });
    }
});

// 删除司机（管理员）
router.delete('/drivers/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { db } = require('../config/database');
        
        // 首先检查司机是否存在
        db.get('SELECT id FROM drivers WHERE id = ?', [id], async (err, driver) => {
            if (err || !driver) {
                return res.status(404).json({
                    success: false,
                    message: '司机不存在'
                });
            }
            
            // 删除司机的订单（如果有）
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM orders WHERE driver_id = ?', [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            // 删除司机
            await new Promise((resolve, reject) => {
                db.run('DELETE FROM drivers WHERE id = ?', [id], (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            res.json({
                success: true,
                message: '司机已删除'
            });
        });
    } catch (error) {
        console.error('删除司机失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '删除司机失败'
        });
    }
});

// 删除订单（管理员）
router.delete('/orders/:orderId', authenticateAdmin, async (req, res) => {
    try {
        const { orderId } = req.params;
        const deleted = await Order.deleteOrder(orderId);
        
        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: '订单不存在'
            });
        }
        
        res.json({
            success: true,
            message: '订单已删除'
        });
    } catch (error) {
        console.error('删除订单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '删除订单失败'
        });
    }
});

// 重置司机密码（管理员）
router.post('/drivers/:id/reset-password', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        
        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: '新密码长度至少6位'
            });
        }
        
        // 获取司机信息
        const driver = await Driver.findById(id);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: '司机不存在'
            });
        }
        
        // 更新密码
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        const { db } = require('../config/database');
        await new Promise((resolve, reject) => {
            db.run('UPDATE drivers SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', 
                [hashedPassword, id], 
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
        
        res.json({
            success: true,
            message: '密码重置成功',
            driver: {
                id: driver.id,
                phone: driver.phone,
                name: driver.name
            }
        });
    } catch (error) {
        console.error('重置密码失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '重置密码失败'
        });
    }
});

// 调整司机余额（管理员）
router.post('/drivers/:id/adjust-balance', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, description = '管理员调整' } = req.body;
        
        if (!amount || typeof amount !== 'number') {
            return res.status(400).json({
                success: false,
                message: '金额无效'
            });
        }
        
        const driver = await Driver.findById(id);
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: '司机不存在'
            });
        }
        
        if (amount > 0) {
            await Driver.addBalance(id, amount, description);
        } else {
            await Driver.deductBalance(id, -amount, description);
        }
        
        const updatedDriver = await Driver.findById(id);
        
        res.json({
            success: true,
            message: '余额调整成功',
            amount,
            balance: updatedDriver.balance
        });
    } catch (error) {
        console.error('调整余额失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '调整余额失败'
        });
    }
});

// 系统备份
router.post('/backup', authenticateAdmin, async (req, res) => {
    try {
        const { backupDatabase } = require('../config/database');
        const backupFile = await backupDatabase();
        
        res.json({
            success: true,
            message: '系统备份成功',
            backupFile
        });
    } catch (error) {
        console.error('系统备份失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '系统备份失败'
        });
    }
});

module.exports = router;