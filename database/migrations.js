// Migration to add indexes for better performance
async function createIndexes() {
    try {
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id)',
            'CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_carts_status ON carts(status)',
            'CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id)',
            'CREATE INDEX IF NOT EXISTS idx_cart_items_category ON cart_items(category)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_user_id ON friendships(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_friendships_account_id ON friendships(account_id)'
        ];

        for (const indexSql of indexes) {
            await db.run(indexSql);
        }
        
        console.log('✅ Database indexes created/verified');
    } catch (error) {
        console.error('Error creating indexes:', error);
    }
}

// Add this to the main runMigrations function if you want to create indexes
async function runMigrationsWithIndexes() {
    try {
        await runMigrations();
        await createIndexes();
    } catch (error) {
        console.error('❌ Error running migrations with indexes:', error);
        throw error;
    }
}

module.exports = {
    runMigrations,
    runMigrationsWithIndexes
};