const db = require('./connection');

// Função para verificar e atualizar a estrutura da tabela cart_items
async function fixCartItemsTable() {
    try {
        console.log('🔄 Verificando estrutura da tabela cart_items...');

        // Verificar se a coluna 'category' existe
        const columns = await db.all("PRAGMA table_info(cart_items)");
        const hasCategory = columns.some(col => col.name === 'category');

        if (!hasCategory) {
            console.log('⚠️ Coluna "category" não encontrada. Adicionando...');
            await db.run('ALTER TABLE cart_items ADD COLUMN category TEXT');
            console.log('✅ Coluna "category" adicionada com sucesso!');
        }

        // Verificar se a coluna 'original_item_id' existe
        const hasOriginalItemId = columns.some(col => col.name === 'original_item_id');

        if (!hasOriginalItemId) {
            console.log('⚠️ Coluna "original_item_id" não encontrada. Adicionando...');
            await db.run('ALTER TABLE cart_items ADD COLUMN original_item_id INTEGER');
            console.log('✅ Coluna "original_item_id" adicionada com sucesso!');
        }

        console.log('✅ Estrutura da tabela cart_items verificada e corrigida!');
    } catch (error) {
        console.error('❌ Erro ao corrigir tabela cart_items:', error);
        throw error;
    }
}

// Função para criar tabela de logs de amizade
async function createFriendshipLogsTable() {
    try {
        console.log('🔄 Criando tabela de logs de amizade...');

        await db.run(`
            CREATE TABLE IF NOT EXISTS friendship_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                account_id INTEGER NOT NULL,
                lol_nickname TEXT NOT NULL,
                lol_tag TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                admin_id TEXT,
                admin_response TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed_at DATETIME,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            )
        `);

        console.log('✅ Tabela friendship_logs criada com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao criar tabela friendship_logs:', error);
        throw error;
    }
}

// Função para criar tabela de logs de pedidos
async function createOrderLogsTable() {
    try {
        console.log('🔄 Criando tabela de logs de pedidos...');

        await db.run(`
            CREATE TABLE IF NOT EXISTS order_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                cart_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                account_id INTEGER,
                action TEXT NOT NULL,
                admin_id TEXT,
                rp_debited INTEGER DEFAULT 0,
                old_rp_amount INTEGER,
                new_rp_amount INTEGER,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (cart_id) REFERENCES carts(id),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (account_id) REFERENCES accounts(id)
            )
        `);

        console.log('✅ Tabela order_logs criada com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao criar tabela order_logs:', error);
        throw error;
    }
}

// Função principal para aplicar todas as correções
async function applyDatabaseFixes() {
    try {
        console.log('🔄 Aplicando correções no banco de dados...');
        
        await fixCartItemsTable();
        await createFriendshipLogsTable();
        await createOrderLogsTable();
        
        console.log('✅ Todas as correções aplicadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao aplicar correções:', error);
        throw error;
    }
}

module.exports = {
    fixCartItemsTable,
    createFriendshipLogsTable,
    createOrderLogsTable,
    applyDatabaseFixes
};