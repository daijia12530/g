const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const { authenticateToken, authenticateAdmin } = require('../middleware/auth');

// 司机注册
router.post('/driver/register', async (req, res) => {
    try {
        const { phone, password, name, plate } = req.body;
        
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: '手机号和密码为必填项'
            });
        }
        
        // 手机号格式验证
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(phone)) {
            return res.status(400).json({
                success: false,
                message: '手机号格式不正确'
            });
        }
        
        // 密码长度验证
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: '密码长度至少6位'
            });
        }
        
        const driver = await Driver.create({ phone, password, name, plate });
        
        res.json({
            success: true,
            message: '注册成功',
            driver
        });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '注册失败'
        });
    }
});

// 司机登录
router.post('/driver/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        
        if (!phone || !password) {
            return res.status(400).json({
                success: false,
                message: '手机号和密码为必填项'
            });
        }
        
        const result = await Driver.login(phone, password);
        
        if (!result) {
            return res.status(401).json({
                success: false,
                message: '手机号或密码错误'
            });
        }
        
        res.json({
            success: true,
            message: '登录成功',
            ...result
        });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '登录失败'
        });
    }
});

// 修改密码
router.post('/driver/change-password', authenticateToken, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const driverId = req.user.id;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: '原密码和新密码为必填项'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: '新密码长度至少6位'
            });
        }
        
        await Driver.changePassword(driverId, oldPassword, newPassword);
        
        res.json({
            success: true,
            message: '密码修改成功'
        });
    } catch (error) {
        console.error('修改密码失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '修改密码失败'
        });
    }
});

// 管理员登录
router.post('/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: '用户名和密码为必填项'
            });
        }
        
        // 验证管理员账号
        const adminPhone = process.env.ADMIN_PHONE || '13307464001';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        
        if (username !== adminPhone || password !== adminPassword) {
            return res.status(401).json({
                success: false,
                message: '管理员账号或密码错误'
            });
        }
        
        // 生成管理员令牌
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { 
                id: 'admin',
                phone: adminPhone,
                role: 'admin'
            },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '1d' }
        );
        
        res.json({
            success: true,
            message: '管理员登录成功',
            token,
            user: {
                role: 'admin',
                phone: adminPhone,
                name: '系统管理员'
            }
        });
    } catch (error) {
        console.error('管理员登录失败:', error);
        res.status(500).json({
            success: false,
            message: error.message || '登录失败'
        });
    }
});

module.exports = router;