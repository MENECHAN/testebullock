const db = require('../database/connection');

class OrderLog {
    static async findById(id) {
        try {
            const query = 'SELECT * FROM order_logs WHERE id = ?';
            return await db.get(query, [id]);
        } catch (error) {
            console.error('Error finding order log by ID:', error);
            throw error;
        }
    }

    static async findByCartId(cartId) {
        try {
            const query = `
                SELECT ol.*, u.username, u.discord_id, a.nickname as account_nickname
                FROM order_logs ol
                LEFT JOIN users u ON ol.user_id = u.id
                LEFT JOIN accounts a ON ol.account_id = a.id
                WHERE ol.cart_id = ?
                ORDER BY ol.created_at DESC
            `;
            return await db.all(query, [cartId]);
        } catch (error) {
            console.error('Error finding order logs by cart ID:', error);
            throw error;
        }
    }

    static async findByUserId(userId) {
        try {
            const query = `
                SELECT ol.*, a.nickname as account_nickname
                FROM order_logs ol
                LEFT JOIN accounts a ON ol.account_id = a.id
                WHERE ol.user_id = ?
                ORDER BY ol.created_at DESC
            `;
            return await db.all(query, [userId]);
        } catch (error) {
            console.error('Error finding order logs by user ID:', error);
            throw error;
        }
    }

    static async findByAccountId(accountId) {
        try {
            const query = `
                SELECT ol.*, u.username, u.discord_id
                FROM order_logs ol
                LEFT JOIN users u ON ol.user_id = u.id
                WHERE ol.account_id = ?
                ORDER BY ol.created_at DESC
            `;
            return await db.all(query, [accountId]);
        } catch (error) {
            console.error('Error finding order logs by account ID:', error);
            throw error;
        }
    }

        static async findByCartIdAndStatus(cartId, statusArray) {
        if (!Array.isArray(statusArray) || statusArray.length === 0) {
            console.warn("findByCartIdAndStatus foi chamado com statusArray inválido.");
            return null;
        }
        // Cria uma string de placeholders (?, ?, ?) para a cláusula IN
        const placeholders = statusArray.map(() => '?').join(',');
        const query = `SELECT * FROM order_logs WHERE cart_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`;
        
        try {
            // Usar db.get() pois esperamos no máximo 1 linha devido ao LIMIT 1
            const row = await db.get(query, [cartId, ...statusArray]);
            if (row && row.items_data) {
                try {
                    row.items_data = JSON.parse(row.items_data);
                } catch (e) {
                    console.error(`Falha ao fazer parse de items_data para o pedido com cartId ${cartId} em findByCartIdAndStatus:`, e, "Dado bruto:", row.items_data);
                    row.items_data = []; // Fallback seguro
                }
            } else if (row) {
                row.items_data = []; // Caso items_data seja null/undefined
            }
            return row;
        } catch (error) {
            console.error('Erro ao buscar order log por cart ID e status:', error);
            throw error;
        }
    }

        static async create(userId, cartId, itemsData, totalRp, totalPrice, status = 'PENDING_CHECKOUT', paymentProofUrl = null, orderChannelId = null) {
        const query = `INSERT INTO order_logs (user_id, cart_id, items_data, total_rp, total_price, status, payment_proof_url, order_channel_id, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
        try {
            // Para INSERT com sqlite3, db.run retorna um objeto this que contém lastID
            const result = await new Promise((resolve, reject) => {
                db.run(query, [
                    userId,
                    cartId,
                    JSON.stringify(itemsData),
                    totalRp,
                    totalPrice,
                    status,
                    paymentProofUrl,
                    orderChannelId
                ], function(err) { // Não usar arrow function aqui para ter acesso ao `this` correto
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ insertId: this.lastID }); // this.lastID contém o ID do registro inserido
                    }
                });
            });
            return result.insertId;
        } catch (error) {
            console.error("Erro em OrderLog.create:", error);
            throw error;
        }
    }

    static async findActiveOrderByChannelId(channelId, status) {
        const query = 'SELECT * FROM order_logs WHERE order_channel_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1';
        try {
            const row = await db.get(query, [channelId, status]);
            if (row && row.items_data) {
                try {
                    row.items_data = JSON.parse(row.items_data);
                } catch (e) {
                    row.items_data = [];
                }
            } else if (row) {
                row.items_data = [];
            }
            return row;
        } catch (error) {
            console.error('Erro ao buscar pedido ativo por channel ID e status:', error);
            throw error;
        }
    }

    static async updateStatus(orderId, status, orderChannelId = null) {
        let query = 'UPDATE order_logs SET status = ?, updated_at = CURRENT_TIMESTAMP';
        const params = [status];
        if (orderChannelId !== null && orderChannelId !== undefined) { // Verifica se orderChannelId foi passado
            query += ', order_channel_id = ?';
            params.push(orderChannelId);
        }
        query += ' WHERE id = ?';
        params.push(orderId);
        
        try {
            const result = await new Promise((resolve, reject) => {
                db.run(query, params, function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                });
            });
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Erro ao atualizar status do pedido:', error);
            throw error;
        }
    }

    static async addPaymentProof(orderId, paymentProofUrl) {
        const query = 'UPDATE order_logs SET payment_proof_url = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        const params = [paymentProofUrl, 'PENDING_MANUAL_APPROVAL', orderId];
        try {
            const result = await new Promise((resolve, reject) => {
                db.run(query, params, function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                });
            });
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Erro ao adicionar comprovante de pagamento:', error);
            throw error;
        }
    }

    static async assignAdminAndAccount(orderId, adminUserId, debitedAccountId, newStatus = 'COMPLETED', adminNotes = null) {
        const query = `UPDATE order_logs SET processed_by_admin_id = ?, debited_from_account_id = ?, status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`;
        try {
            const result = await new Promise((resolve, reject) => {
                db.run(query, [adminUserId, debitedAccountId, newStatus, adminNotes, orderId], function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                });
            });
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Erro ao designar admin e conta ao pedido:', error);
            throw error;
        }
    }

    static async setRejected(orderId, adminUserId, adminNotes = null) {
        const query = `UPDATE order_logs SET status = 'REJECTED', processed_by_admin_id = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`;
        try {
            const result = await new Promise((resolve, reject) => {
                db.run(query, [adminUserId, adminNotes, orderId], function(err) {
                    if (err) reject(err);
                    else resolve({ affectedRows: this.changes });
                });
            });
            return result.affectedRows > 0;
        } catch (error) {
            console.error('Erro ao rejeitar pedido:', error);
            throw error;
        }
    }

    static async updateAction(id, action, adminId = null, notes = null, rpDebited = null, oldRpAmount = null, newRpAmount = null) {
        try {
            let query = 'UPDATE order_logs SET action = ?, admin_id = ?, notes = ?';
            let params = [action, adminId, notes];

            if (rpDebited !== null) {
                query += ', rp_debited = ?, old_rp_amount = ?, new_rp_amount = ?';
                params.push(rpDebited, oldRpAmount, newRpAmount);
            }

            query += ' WHERE id = ?';
            params.push(id);

            const result = await db.run(query, params);
            return result.changes > 0;
        } catch (error) {
            console.error('Error updating order log action:', error);
            throw error;
        }
    }

    static async findPendingOrders(limit = 50) {
        try {
            const query = `
                SELECT ol.*, u.username, u.discord_id, a.nickname as account_nickname, c.total_rp, c.total_price
                FROM order_logs ol
                LEFT JOIN users u ON ol.user_id = u.id
                LEFT JOIN accounts a ON ol.account_id = a.id
                LEFT JOIN carts c ON ol.cart_id = c.id
                WHERE ol.action = 'pending_approval'
                ORDER BY ol.created_at ASC
                LIMIT ?
            `;
            return await db.all(query, [limit]);
        } catch (error) {
            console.error('Error finding pending orders:', error);
            throw error;
        }
    }

    static async getStatistics() {
        try {
            const query = `
                SELECT 
                    COUNT(*) as total_orders,
                    COUNT(CASE WHEN action = 'pending_approval' THEN 1 END) as pending_orders,
                    COUNT(CASE WHEN action = 'approved' THEN 1 END) as approved_orders,
                    COUNT(CASE WHEN action = 'rejected' THEN 1 END) as rejected_orders,
                    SUM(CASE WHEN action = 'approved' THEN rp_debited ELSE 0 END) as total_rp_debited,
                    AVG(CASE WHEN action = 'approved' THEN rp_debited ELSE NULL END) as avg_rp_per_order
                FROM order_logs
            `;
            const result = await db.get(query);
            
            return {
                totalOrders: result.total_orders,
                pendingOrders: result.pending_orders || 0,
                approvedOrders: result.approved_orders || 0,
                rejectedOrders: result.rejected_orders || 0,
                totalRpDebited: result.total_rp_debited || 0,
                averageRpPerOrder: result.avg_rp_per_order || 0
            };
        } catch (error) {
            console.error('Error getting order log statistics:', error);
            throw error;
        }
    }

    static async getRecentOrders(limit = 10) {
        try {
            const query = `
                SELECT ol.*, u.username, u.discord_id, a.nickname as account_nickname
                FROM order_logs ol
                LEFT JOIN users u ON ol.user_id = u.id
                LEFT JOIN accounts a ON ol.account_id = a.id
                ORDER BY ol.created_at DESC
                LIMIT ?
            `;
            return await db.all(query, [limit]);
        } catch (error) {
            console.error('Error getting recent orders:', error);
            throw error;
        }
    }

    static async getOrdersByDateRange(startDate, endDate) {
        try {
            const query = `
                SELECT ol.*, u.username, u.discord_id, a.nickname as account_nickname
                FROM order_logs ol
                LEFT JOIN users u ON ol.user_id = u.id
                LEFT JOIN accounts a ON ol.account_id = a.id
                WHERE ol.created_at BETWEEN ? AND ?
                ORDER BY ol.created_at DESC
            `;
            return await db.all(query, [startDate, endDate]);
        } catch (error) {
            console.error('Error getting orders by date range:', error);
            throw error;
        }
    }

    static async getRpSpendingByAccount(accountId) {
        try {
            const query = `
                SELECT 
                    COUNT(*) as order_count,
                    SUM(rp_debited) as total_rp_spent,
                    AVG(rp_debited) as avg_rp_per_order,
                    MIN(rp_debited) as min_rp_order,
                    MAX(rp_debited) as max_rp_order
                FROM order_logs
                WHERE account_id = ? AND action = 'approved'
            `;
            const result = await db.get(query, [accountId]);
            
            return {
                orderCount: result.order_count || 0,
                totalRpSpent: result.total_rp_spent || 0,
                averageRpPerOrder: result.avg_rp_per_order || 0,
                minRpOrder: result.min_rp_order || 0,
                maxRpOrder: result.max_rp_order || 0
            };
        } catch (error) {
            console.error('Error getting RP spending by account:', error);
            throw error;
        }
    }

    static async getUserOrderHistory(userId, limit = 20) {
        try {
            const query = `
                SELECT ol.*, a.nickname as account_nickname, c.total_price
                FROM order_logs ol
                LEFT JOIN accounts a ON ol.account_id = a.id
                LEFT JOIN carts c ON ol.cart_id = c.id
                WHERE ol.user_id = ?
                ORDER BY ol.created_at DESC
                LIMIT ?
            `;
            return await db.all(query, [userId, limit]);
        } catch (error) {
            console.error('Error getting user order history:', error);
            throw error;
        }
    }

    static async deleteOldLogs(daysOld = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const query = `
                DELETE FROM order_logs 
                WHERE created_at < ? AND action != 'pending_approval'
            `;
            const result = await db.run(query, [cutoffDate.toISOString()]);
            return result.changes;
        } catch (error) {
            console.error('Error deleting old order logs:', error);
            throw error;
        }
    }
}

module.exports = OrderLog;