const fs = require('fs');
const path = require('path');
const { backupDatabase } = require('../config/database');

// 定期备份配置
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24小时
const MAX_BACKUP_DAYS = 7; // 保留最近7天备份

// 执行定期备份
function startScheduledBackups() {
    console.log('🔄 数据库定期备份已启动');
    
    setInterval(async () => {
        try {
            await backupDatabase();
            console.log('✅ 定期备份完成');
        } catch (error) {
            console.error('定期备份失败:', error);
        }
    }, BACKUP_INTERVAL);
    
    // 立即执行一次备份
    setTimeout(async () => {
        try {
            await backupDatabase();
            console.log('✅ 初始备份完成');
        } catch (error) {
            console.error('初始备份失败:', error);
        }
    }, 5000);
}

// 手动备份
async function manualBackup() {
    try {
        const backupFile = await backupDatabase();
        console.log(`✅ 手动备份完成: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error('手动备份失败:', error);
        throw error;
    }
}

// 清理旧备份
function cleanupOldBackups() {
    const backupDir = process.env.DB_BACKUP_DIR || './backups';
    
    if (!fs.existsSync(backupDir)) {
        return;
    }
    
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const cutoffTime = now - (MAX_BACKUP_DAYS * 24 * 60 * 60 * 1000);
    
    files.forEach(file => {
        if (file.startsWith('backup-') && file.endsWith('.sqlite')) {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtimeMs < cutoffTime) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ 清理旧备份: ${file}`);
            }
        }
    });
}

// 导出备份文件
function exportBackup(backupFile) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(backupFile)) {
            return reject(new Error('备份文件不存在'));
        }
        
        const stats = fs.statSync(backupFile);
        const readStream = fs.createReadStream(backupFile);
        
        resolve({
            stream: readStream,
            size: stats.size,
            filename: path.basename(backupFile)
        });
    });
}

module.exports = {
    startScheduledBackups,
    manualBackup,
    cleanupOldBackups,
    exportBackup
};

// 启动时执行清理
if (require.main === module) {
    cleanupOldBackups();
}