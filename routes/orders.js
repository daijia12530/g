const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { authenticateToken } = require('../middleware/auth');

// 创建订单（乘客）
router.post('/create', async (req, res) => {
    try {
        const {
            driverCode,
            passengerName,
            passengerPhone,
            from,
            to,
            amount,
            locationNote,
            route
        } = req.body;
        
        if (!driverCode || !from || !to || !amount) {
            return res.status(400).json({
                success: false,
                message: '必填信息不完整'
            });
        }
        
        const order = await Order.create({
            driverCode,
            passengerName: passengerName || '乘客',
            passengerPhone: passengerPhone || '',
            from,
            to,
            amount: parseFloat(amount),
            locationNote: locationNote || '',
            route: route || 'xcToLz'
        });
        
        res.json({
            success: true,
            message: '订单创建成功',
            order
        });
    } catch (error) {
        console.error('创建订单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '创建订单失败'
        });
    }
});

// 获取司机待处理订单
router.get('/driver/pending', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const orders = await Order.getDriverPendingOrders(driverId);
        
        res.json({
            success: true,
            orders,
            count: orders.length
        });
    } catch (error) {
        console.error('获取待处理订单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取订单失败'
        });
    }
});

// 获取司机所有订单
router.get('/driver/all', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { limit = 50 } = req.query;
        const orders = await Order.getDriverOrders(driverId, parseInt(limit));
        
        res.json({
            success: true,
            orders,
            count: orders.length
        });
    } catch (error) {
        console.error('获取订单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取订单失败'
        });
    }
});

// 获取乘客订单
router.get('/passenger/:driverCode', async (req, res) => {
    try {
        const { driverCode } = req.params;
        
        if (!driverCode || driverCode.length !== 6) {
            return res.status(400).json({
                success: false,
                message: '司机代码无效'
            });
        }
        
        const orders = await Order.getPassengerOrders(driverCode.toUpperCase());
        
        res.json({
            success: true,
            orders,
            count: orders.length
        });
    } catch (error) {
        console.error('获取乘客订单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取订单失败'
        });
    }
});

// 司机接单
router.post('/:orderId/accept', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const driverId = req.user.id;
        
        const result = await Order.acceptOrder(orderId, driverId);
        
        res.json({
            success: true,
            message: '接单成功',
            orderId
        });
    } catch (error) {
        console.error('接单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '接单失败'
        });
    }
});

// 司机拒单
router.post('/:orderId/reject', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const driverId = req.user.id;
        
        const result = await Order.rejectOrder(orderId, driverId);
        
        res.json({
            success: true,
            message: '已拒绝订单',
            orderId
        });
    } catch (error) {
        console.error('拒单失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '拒单失败'
        });
    }
});

// 更新订单状态
router.put('/:orderId/status', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const driverId = req.user.id;
        const { status } = req.body;
        
        if (!['confirmed', 'picked', 'completed', 'canceled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: '状态值无效'
            });
        }
        
        const result = await Order.updateStatus(orderId, status, driverId);
        
        res.json({
            success: true,
            message: '订单状态更新成功',
            orderId,
            status
        });
    } catch (error) {
        console.error('更新订单状态失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '更新订单状态失败'
        });
    }
});

// 获取订单详情
router.get('/:orderId', authenticateToken, async (req, res) => {
    try {
        const { orderId } = req.params;
        const driverId = req.user.id;
        
        const order = await Order.findById(orderId);
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: '订单不存在'
            });
        }
        
        // 检查订单是否属于该司机
        if (order.driverId !== driverId && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: '无权访问此订单'
            });
        }
        
        res.json({
            success: true,
            order
        });
    } catch (error) {
        console.error('获取订单详情失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取订单详情失败'
        });
    }
});

// 获取今日统计
router.get('/stats/today', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const stats = await Order.getTodayStats(driverId);
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('获取今日统计失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取统计失败'
        });
    }
});

// 获取订单统计
router.get('/stats/overview', authenticateToken, async (req, res) => {
    try {
        const driverId = req.user.id;
        const { startDate, endDate } = req.query;
        
        const stats = await Order.getStats(startDate, endDate, driverId);
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('获取订单统计失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '获取统计失败'
        });
    }
});

module.exports = router;