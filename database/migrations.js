const db = require('./connection');

async function runMigrations() {
    try {
        // Create tables if they don't exist
        await createUsersTable();
        await createAccountsTable();
        await createFriendshipsTable();
        await createCartsTable();
        await createCartItemsTable();
        
        console.log('✅ All migrations completed successfully');
    } catch (error) {
        console.error('❌ Error running migrations:', error);
        throw error;
    }
}

async function createUsersTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.run(sql);
    console.log('✅ Users table created/verified');
}

async function createAccountsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT NOT NULL,
            rp_amount INTEGER NOT NULL,
            friends_count INTEGER DEFAULT 0,
            max_friends INTEGER DEFAULT 250,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    await db.run(sql);
    console.log('✅ Accounts table created/verified');
}

async function createFriendshipsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS friendships (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            account_id INTEGER,
            lol_nickname TEXT NOT NULL,
            lol_tag TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (account_id) REFERENCES accounts(id)
        )
    `;
    await db.run(sql);
    console.log('✅ Friendships table created/verified');
}

async function createCartsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS carts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            ticket_channel_id TEXT,
            status TEXT DEFAULT 'active',
            total_rp INTEGER DEFAULT 0,
            total_price REAL DEFAULT 0.00,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `;
    await db.run(sql);
    console.log('✅ Carts table created/verified');
}

async function createCartItemsTable() {
    const sql = `
        CREATE TABLE IF NOT EXISTS cart_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cart_id INTEGER,
            skin_name TEXT NOT NULL,
            skin_price INTEGER NOT NULL,
            skin_image_url TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cart_id) REFERENCES carts(id)
        )
    `;
    await db.run(sql);
    console.log('✅ Cart items table created/verified');
}

module.exports = {
    runMigrations
};