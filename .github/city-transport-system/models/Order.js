const { db } = require('../config/database');

class Order {
    // 创建订单
    static async create(data) {
        const {
            driverCode,
            passengerName = '乘客',
            passengerPhone = '',
            from,
            to,
            amount,
            locationNote = '',
            route = 'xcToLz',
            paymentMethod = 'cash'
        } = data;
        
        // 通过分享码获取司机ID
        const driver = await require('./Driver').findByShareCode(driverCode);
        if (!driver) throw new Error('司机不存在或分享码无效');
        
        // 生成订单号
        const orderId = `ORD${Date.now().toString().slice(-6)}${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
        
        return new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO orders (
                    order_id, driver_id, driver_code, passenger_name, passenger_phone,
                    from_location, to_location, amount, location_note, route, payment_method
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                orderId, driver.id, driverCode, passengerName, passengerPhone,
                from, to, amount, locationNote, route, paymentMethod
            ], function(err) {
                if (err) {
                    console.error('创建订单错误:', err);
                    return reject(err);
                }
                
                const orderData = {
                    id: this.lastID,
                    orderId,
                    driverId: driver.id,
                    driverCode,
                    passengerName,
                    passengerPhone,
                    from,
                    to,
                    amount,
                    locationNote,
                    route,
                    status: 'pending',
                    paymentMethod,
                    paymentStatus: 'pending',
                    createdAt: new Date().toISOString()
                };
                
                resolve(orderData);
            });
        });
    }
    
    // 获取订单详情
    static async findById(orderId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (err, order) => {
                if (err) return reject(err);
                if (!order) return resolve(null);
                
                resolve(this.formatOrder(order));
            });
        });
    }
    
    // 获取司机待处理订单
    static async getDriverPendingOrders(driverId) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM orders 
                WHERE driver_id = ? AND status = 'pending'
                ORDER BY created_at DESC
            `, [driverId], (err, orders) => {
                if (err) return reject(err);
                resolve(orders.map(order => this.formatOrder(order)));
            });
        });
    }
    
    // 获取司机所有订单
    static async getDriverOrders(driverId, limit = 50) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM orders 
                WHERE driver_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `, [driverId, limit], (err, orders) => {
                if (err) return reject(err);
                resolve(orders.map(order => this.formatOrder(order)));
            });
        });
    }
    
    // 获取乘客订单
    static async getPassengerOrders(driverCode) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM orders 
                WHERE driver_code = ?
                ORDER BY created_at DESC
                LIMIT 50
            `, [driverCode], (err, orders) => {
                if (err) return reject(err);
                resolve(orders.map(order => this.formatOrder(order)));
            });
        });
    }
    
    // 更新订单状态
    static async updateStatus(orderId, status, driverId = null) {
        return new Promise((resolve, reject) => {
            let query = 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP';
            const params = [status];
            
            if (status === 'completed') {
                query += ', completed_at = CURRENT_TIMESTAMP';
            } else if (status === 'canceled') {
                query += ', canceled_at = CURRENT_TIMESTAMP';
            }
            
            query += ' WHERE order_id = ?';
            params.push(orderId);
            
            if (driverId) {
                query += ' AND driver_id = ?';
                params.push(driverId);
            }
            
            db.run(query, params, async (err) => {
                if (err) return reject(err);
                
                // 如果订单完成，更新司机余额
                if (status === 'completed') {
                    const order = await this.findById(orderId);
                    if (order) {
                        await require('./Driver').addBalance(order.driverId, order.amount, `订单收入: ${orderId}`);
                    }
                }
                
                resolve(true);
            });
        });
    }
    
    // 司机接单
    static async acceptOrder(orderId, driverId) {
        return this.updateStatus(orderId, 'confirmed', driverId);
    }
    
    // 司机拒单
    static async rejectOrder(orderId, driverId) {
        return this.updateStatus(orderId, 'canceled', driverId);
    }
    
    // 获取今日统计
    static async getTodayStats(driverId = null) {
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];
            
            let query = `
                SELECT 
                    COUNT(CASE WHEN status = 'completed' AND DATE(created_at) = ? THEN 1 END) as completedOrders,
                    COUNT(CASE WHEN status = 'pending' AND DATE(created_at) = ? THEN 1 END) as pendingOrders,
                    COUNT(CASE WHEN status = 'confirmed' AND DATE(created_at) = ? THEN 1 END) as confirmedOrders,
                    COALESCE(SUM(CASE WHEN status = 'completed' AND DATE(created_at) = ? THEN amount END), 0) as todayIncome
                FROM orders
                WHERE DATE(created_at) = ?
            `;
            
            const params = [today, today, today, today, today];
            
            if (driverId) {
                query += ' AND driver_id = ?';
                params.push(driverId);
            }
            
            db.get(query, params, (err, stats) => {
                if (err) return reject(err);
                resolve(stats);
            });
        });
    }
    
    // 获取所有订单（管理员用）
    static async getAllOrders(limit = 100, offset = 0) {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT o.*, d.name as driver_name, d.phone as driver_phone
                FROM orders o
                LEFT JOIN drivers d ON o.driver_id = d.id
                ORDER BY o.created_at DESC
                LIMIT ? OFFSET ?
            `, [limit, offset], (err, orders) => {
                if (err) return reject(err);
                
                const formattedOrders = orders.map(order => {
                    const formatted = this.formatOrder(order);
                    formatted.driverName = order.driver_name;
                    formatted.driverPhone = order.driver_phone;
                    return formatted;
                });
                
                resolve(formattedOrders);
            });
        });
    }
    
    // 格式化订单数据
    static formatOrder(order) {
        return {
            id: order.id,
            orderId: order.order_id,
            driverId: order.driver_id,
            driverCode: order.driver_code,
            passengerName: order.passenger_name,
            passengerPhone: order.passenger_phone,
            from: order.from_location,
            to: order.to_location,
            amount: order.amount,
            locationNote: order.location_note,
            route: order.route,
            status: order.status,
            paymentMethod: order.payment_method,
            paymentStatus: order.payment_status,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
            completedAt: order.completed_at,
            canceledAt: order.canceled_at
        };
    }
    
    // 获取订单统计
    static async getStats(startDate = null, endDate = null, driverId = null) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    COUNT(*) as totalOrders,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedOrders,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pendingOrders,
                    COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceledOrders,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN amount END), 0) as totalIncome,
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN amount END), 0) as avgAmount
                FROM orders
                WHERE 1=1
            `;
            
            const params = [];
            
            if (startDate) {
                query += ' AND DATE(created_at) >= ?';
                params.push(startDate);
            }
            
            if (endDate) {
                query += ' AND DATE(created_at) <= ?';
                params.push(endDate);
            }
            
            if (driverId) {
                query += ' AND driver_id = ?';
                params.push(driverId);
            }
            
            db.get(query, params, (err, stats) => {
                if (err) return reject(err);
                resolve(stats);
            });
        });
    }
    
    // 删除订单（仅管理员）
    static async deleteOrder(orderId) {
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM orders WHERE order_id = ?', [orderId], function(err) {
                if (err) return reject(err);
                resolve(this.changes > 0);
            });
        });
    }
}

module.exports = Order;