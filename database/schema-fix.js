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

async function fixCartsTable() {
    try {
        console.log('🔄 Verificando estrutura da tabela carts...');

        // Verificar se a coluna 'updated_at' existe
        const columns = await db.all("PRAGMA table_info(carts)");
        const hasUpdatedAt = columns.some(col => col.name === 'updated_at');

        if (!hasUpdatedAt) {
            console.log('⚠️ Coluna "updated_at" não encontrada na tabela carts. Adicionando...');
            await db.run('ALTER TABLE carts ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP');
            console.log('✅ Coluna "updated_at" adicionada à tabela carts com sucesso!');
        } else {
            console.log('ℹ️ Coluna "updated_at" já existe na tabela carts.');
        }

        console.log('✅ Estrutura da tabela carts verificada e corrigida!');
    } catch (error) {
        console.error('❌ Erro ao corrigir tabela carts:', error);
        throw error;
    }
}

async function applyDatabaseFixes() {
    try {
        console.log('🔄 Aplicando correções no banco de dados...');

        await fixCartItemsTable();
        await createFriendshipLogsTable();
        await createOrderLogsTable();
        await fixCartsTable(); // ⭐ ADICIONAR ESTA LINHA

        console.log('✅ Todas as correções aplicadas com sucesso!');
    } catch (error) {
        console.error('❌ Erro ao aplicar correções:', error);
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

// Função para criar/corrigir tabela de logs de pedidos
async function createOrderLogsTable() {
    console.log('🔄 Verificando/adicionando colunas para order_logs...');

    try {
        // Verificar se a tabela já existe primeiro
        const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='order_logs'");
        
        if (tableExists) {
            // Tabela existe, verificar estrutura atual
            const columns = await db.all("PRAGMA table_info(order_logs)");
            const columnNames = columns.map(col => col.name);
            
            console.log('🔍 Colunas existentes:', columnNames);

            // Verificar se a coluna action tem NOT NULL constraint incorreto
            const actionColumn = columns.find(col => col.name === 'action');
            if (actionColumn && actionColumn.notnull === 1) {
                console.log('⚠️ Detectada constraint NOT NULL problemática na coluna action. Recriando tabela...');
                
                // Backup dos dados existentes
                const existingData = await db.all('SELECT * FROM order_logs');
                
                // Remover a tabela atual
                await db.run('DROP TABLE order_logs');
                await db.run('ALTER TABLE cart_items ADD COLUMN category TEXT');
                await db.run('ALTER TABLE cart_items ADD COLUMN original_item_id INTEGER');
                
                // Recriar tabela com estrutura correta
                await db.run(`
                    CREATE TABLE order_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id VARCHAR(255) NOT NULL,
                        cart_id VARCHAR(255) NOT NULL,
                        items_data TEXT,
                        total_rp INTEGER DEFAULT 0,
                        total_price REAL DEFAULT 0.0,
                        action VARCHAR(50) DEFAULT 'CREATE',
                        status VARCHAR(50) DEFAULT 'PENDING_CHECKOUT',
                        payment_proof_url TEXT,
                        order_channel_id VARCHAR(255),
                        processed_by_admin_id VARCHAR(255),
                        debited_from_account_id INT NULL,
                        admin_notes TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                `);
                
                // Restaurar dados existentes
                for (const row of existingData) {
                    const columns = Object.keys(row).join(', ');
                    const placeholders = Object.keys(row).map(() => '?').join(', ');
                    const values = Object.values(row);
                    
                    await db.run(
                        `INSERT INTO order_logs (${columns}) VALUES (${placeholders})`,
                        values
                    );
                }
                
                console.log('✅ Tabela order_logs recriada com estrutura corrigida!');
                
            } else {
                // Lista de colunas que devem existir (sem NOT NULL problemático)
                const columnsToAdd = [
                    { name: 'items_data', definition: 'ALTER TABLE order_logs ADD COLUMN items_data TEXT' },
                    { name: 'total_rp', definition: 'ALTER TABLE order_logs ADD COLUMN total_rp INTEGER DEFAULT 0' },
                    { name: 'total_price', definition: 'ALTER TABLE order_logs ADD COLUMN total_price REAL DEFAULT 0.0' },
                    { name: 'action', definition: "ALTER TABLE order_logs ADD COLUMN action VARCHAR(50) DEFAULT 'CREATE'" },
                    { name: 'status', definition: "ALTER TABLE order_logs ADD COLUMN status VARCHAR(50) DEFAULT 'PENDING_CHECKOUT'" },
                    { name: 'payment_proof_url', definition: 'ALTER TABLE order_logs ADD COLUMN payment_proof_url TEXT' },
                    { name: 'order_channel_id', definition: 'ALTER TABLE order_logs ADD COLUMN order_channel_id VARCHAR(255)' },
                    { name: 'processed_by_admin_id', definition: 'ALTER TABLE order_logs ADD COLUMN processed_by_admin_id VARCHAR(255)' },
                    { name: 'debited_from_account_id', definition: 'ALTER TABLE order_logs ADD COLUMN debited_from_account_id INT NULL' },
                    { name: 'admin_notes', definition: 'ALTER TABLE order_logs ADD COLUMN admin_notes TEXT' },
                    { name: 'updated_at', definition: 'ALTER TABLE order_logs ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
                ];

                for (const col of columnsToAdd) {
                    if (!columnNames.includes(col.name)) {
                        try {
                            await db.run(col.definition);
                            console.log(`  ✅ Coluna ${col.name} adicionada.`);
                        } catch (e) {
                            console.error(`  ❌ Erro ao adicionar coluna ${col.name}:`, e.message);
                        }
                    } else {
                        console.log(`  ℹ️ Coluna ${col.name} já existe.`);
                    }
                }

                // Verificar colunas básicas que sempre devem existir
                const basicColumns = ['user_id', 'cart_id', 'created_at'];
                for (const basicCol of basicColumns) {
                    if (!columnNames.includes(basicCol)) {
                        console.log(`⚠️ Coluna básica ${basicCol} não encontrada! Pode ser necessário recriar a tabela.`);
                    }
                }
            }

        } else {
            // Tabela não existe, criar do zero
            console.log('🔄 Criando tabela order_logs do zero...');
            
            await db.run(`
                CREATE TABLE order_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id VARCHAR(255) NOT NULL,
                    cart_id VARCHAR(255) NOT NULL,
                    items_data TEXT,
                    total_rp INTEGER DEFAULT 0,
                    total_price REAL DEFAULT 0.0,
                    action VARCHAR(50) DEFAULT 'CREATE',
                    status VARCHAR(50) DEFAULT 'PENDING_CHECKOUT',
                    payment_proof_url TEXT,
                    order_channel_id VARCHAR(255),
                    processed_by_admin_id VARCHAR(255),
                    debited_from_account_id INT NULL,
                    admin_notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ Tabela order_logs criada com sucesso!');
        }

        // Criar trigger para updated_at (separadamente)
        try {
            await db.run(`
                CREATE TRIGGER IF NOT EXISTS update_order_logs_updated_at
                AFTER UPDATE ON order_logs
                FOR EACH ROW
                BEGIN
                    UPDATE order_logs SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
                END;
            `);
            console.log('✅ Trigger para updated_at criado com sucesso!');
        } catch (e) {
            console.log('ℹ️ Trigger para updated_at já existe ou erro:', e.message);
        }

    } catch (error) {
        console.error('❌ Erro ao criar/verificar tabela order_logs:', error);
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
    fixCartsTable, // ⭐ EXPORTAR A NOVA FUNÇÃO
    applyDatabaseFixes};