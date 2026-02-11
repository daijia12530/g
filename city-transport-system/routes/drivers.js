const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { authenticateToken } = require('../middleware/auth');

// 获取司机资料（需要认证）
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const driver = await Driver.findById(driverId);
        
        if (!driver) {
            return res.status(404).json({
                success: false,
                message: '司机不存在'
            });
        }
        
        res.json({
            success: true,
            driver
        });
    } catch (error) {
        console.error('获取司机资料失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取资料失败'
        });
    }
});

// 通过分享码获取司机信息（公开）
router.get('/share/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        if (!code || code.length !== 6) {
            return res.status(400).json({
                success: false,
                message: '分享码格式不正确'
            });
        }
        
        const driver = await Driver.findByShareCode(code.toUpperCase());
        
        if (!driver) {
            return res.json({
                success: false,
                message: '分享码无效或司机不存在'
            });
        }
        
        res.json({
            success: true,
            driver
        });
    } catch (error) {
        console.error('获取司机信息失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取信息失败'
        });
    }
});

// 获取司机统计数据
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const stats = await Driver.getStats(driverId);
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取统计数据失败'
        });
    }
});

// 更新司机设置（价格等）
router.put('/settings', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { settings } = req.body;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({
                success: false,
                message: '设置数据无效'
            });
        }
        
        // 验证价格设置
        const validSettings = {
            xcToLz: Math.max(30, Math.min(200, parseInt(settings.xcToLz) || 50)),
            lzToXc: Math.max(30, Math.min(200, parseInt(settings.lzToXc) || 50)),
            xcToLb: Math.max(20, Math.min(100, parseInt(settings.xcToLb) || 40)),
            gpToXc: Math.max(10, Math.min(50, parseInt(settings.gpToXc) || 20)),
            extraPerKm: Math.max(0, Math.min(5, parseFloat(settings.extraPerKm) || 0.8))
        };
        
        await Driver.update(driverId, { settings: validSettings });
        
        res.json({
            success: true,
            message: '设置更新成功',
            settings: validSettings
        });
    } catch (error) {
        console.error('更新设置失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '更新设置失败'
        });
    }
});

// 更新司机状态（在线/离线）
router.put('/status', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { isOnline } = req.body;
        
        if (typeof isOnline !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: '状态参数无效'
            });
        }
        
        await Driver.updateStatus(driverId, isOnline);
        
        res.json({
            success: true,
            message: isOnline ? '已上线接单' : '已下线休息',
            isOnline
        });
    } catch (error) {
        console.error('更新状态失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '更新状态失败'
        });
    }
});

// 刷新分享码
router.post('/share-code/refresh', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const newCode = await Driver.refreshShareCode(driverId);
        
        res.json({
            success: true,
            message: '分享码刷新成功',
            newCode
        });
    } catch (error) {
        console.error('刷新分享码失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '刷新分享码失败'
        });
    }
});

// 更新司机资料
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { name, plate } = req.body;
        
        const updates = {};
        if (name) updates.name = name;
        if (plate) updates.plate = plate;
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: '没有提供要更新的信息'
            });
        }
        
        const driver = await Driver.update(driverId, updates);
        
        res.json({
            success: true,
            message: '资料更新成功',
            driver
        });
    } catch (error) {
        console.error('更新资料失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '更新资料失败'
        });
    }
});

// 获取在线司机列表（公开）
router.get('/online', async (req, res) => {
    try {
        const drivers = await Driver.getOnlineDrivers();
        
        res.json({
            success: true,
            drivers,
            count: drivers.length
        });
    } catch (error) {
        console.error('获取在线司机失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取在线司机失败'
        });
    }
});

// 获取交易记录
router.get('/transactions', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { limit = 20, offset = 0 } = req.query;
        
        const { db } = require('../config/database');
        
        db.all(`
            SELECT * FROM transactions 
            WHERE driver_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [driverId, parseInt(limit), parseInt(offset)], (err, transactions) => {
            if (err) {
                console.error('获取交易记录失败:', err);
                return res.status(500).json({
                    success: false,
                    message: '获取交易记录失败'
                });
            }
            
            res.json({
                success: true,
                transactions,
                count: transactions.length
            });
        });
    } catch (error) {
        console.error('获取交易记录失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取交易记录失败'
        });
    }
});

// 司机提现申请
router.post('/withdraw', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { amount, description = '提现申请' } = req.body;
        
        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: '提现金额无效'
            });
        }
        
        const newBalance = await Driver.deductBalance(driverId, amount, description);
        
        res.json({
            success: true,
            message: '提现申请已提交',
            amount,
            balance: newBalance
        });
    } catch (error) {
        console.error('提现失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '提现失败'
        });
    }
});

module.exports = router;