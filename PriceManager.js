const fs = require('fs');
const path = require('path');

// Assuming price-config.json is in the same directory as PriceManager.js or project root.
// Adjust if PriceManager.js is in a subdirectory like 'utils' or 'managers'.
// If PriceManager.js is in root, use './price-config.json'
// If in a subdir (e.g. utils/), use '../price-config.json'
const CONFIG_FILE_PATH = path.resolve(__dirname, './price-config.json'); // More robust path resolution

class PriceManager {
    constructor() {
        this.config = this.loadConfig();
        this.currency = this.config.currency || 'RP';
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE_PATH)) {
                const rawData = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
                const parsedConfig = JSON.parse(rawData);
                // Ensure all necessary structures exist
                parsedConfig.currency = parsedConfig.currency || 'RP';
                parsedConfig.defaultPrices = parsedConfig.defaultPrices || {};
                parsedConfig.defaultPrices.inventoryTypes = parsedConfig.defaultPrices.inventoryTypes || {};
                parsedConfig.defaultPrices.itemCategories = parsedConfig.defaultPrices.itemCategories || {};
                parsedConfig.defaultPrices.subInventoryTypes = parsedConfig.defaultPrices.subInventoryTypes || {};
                parsedConfig.itemOverrides = parsedConfig.itemOverrides || {};
                parsedConfig.fallbackPrice = parsedConfig.fallbackPrice !== undefined ? parsedConfig.fallbackPrice : 0;
                return parsedConfig;
            } else {
                console.warn(`Price config file not found at ${CONFIG_FILE_PATH}. Creating a default one.`);
                const defaultConfig = {
                    currency: "RP",
                    defaultPrices: {
                        inventoryTypes: {},
                        itemCategories: {},
                        subInventoryTypes: {}
                    },
                    itemOverrides: {},
                    fallbackPrice: 0
                };
                fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(defaultConfig, null, 2), 'utf8');
                return defaultConfig;
            }
        } catch (error) {
            console.error('Error loading price config:', error);
            return { // Fallback to a minimal default config on error
                currency: "RP",
                defaultPrices: { inventoryTypes: {}, itemCategories: {}, subInventoryTypes: {} },
                itemOverrides: {},
                fallbackPrice: 0
            };
        }
    }

    saveConfig() {
        try {
            fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(this.config, null, 2), 'utf8');
            console.log('Price config saved successfully.');
            // Reload config to ensure in-memory state is fresh if needed elsewhere
            this.config = this.loadConfig();
        } catch (error) {
            console.error('Error saving price config:', error);
        }
    }

    /**
     * Gets the price for an item.
     * The item object MUST contain relevant properties:
     * - itemKey (String): A unique key for item overrides (e.g., item.itemId).
     * - inventoryType (String): The main type from inventory-analysis (e.g., "CHAMPION_SKIN").
     * - itemCategory (String, Optional): The category from inventory-analysis (e.g., "EPIC_SKIN").
     * - subInventoryType (String, Optional): The sub-type from inventory-analysis (e.g., "RECOLOR").
     */
    getItemPrice(item) {
        if (!item) return this.config.fallbackPrice;

        const itemKey = String(item.itemKey || item.itemId || item.id); // Ensure itemKey is a string for object key lookup

        // 1. Check for specific item override
        if (this.config.itemOverrides && this.config.itemOverrides[itemKey] !== undefined) {
            return this.config.itemOverrides[itemKey];
        }

        const defaults = this.config.defaultPrices;

        // 2. Check for itemCategory price (e.g., "EPIC_SKIN")
        if (item.itemCategory && defaults.itemCategories && defaults.itemCategories[item.itemCategory] !== undefined) {
            return defaults.itemCategories[item.itemCategory];
        }

        // 3. Check for inventoryType price (e.g., "CHAMPION_SKIN")
        if (item.inventoryType && defaults.inventoryTypes && defaults.inventoryTypes[item.inventoryType] !== undefined) {
            return defaults.inventoryTypes[item.inventoryType];
        }

        // 4. Check for subInventoryType price (e.g., "RECOLOR")
        if (item.subInventoryType && defaults.subInventoryTypes && defaults.subInventoryTypes[item.subInventoryType] !== undefined) {
            return defaults.subInventoryTypes[item.subInventoryType];
        }

        return this.config.fallbackPrice;
    }

    /**
     * Sets a price for a specific item override.
     * itemKey: A unique identifier for the item (e.g., itemId).
     * price: The price in RP. Pass null or undefined to remove the override.
     */
    setItemPrice(itemKey, price) {
        if (!this.config.itemOverrides) {
            this.config.itemOverrides = {};
        }
        const keyStr = String(itemKey); // Ensure key is string

        if (price === null || price === undefined) {
            delete this.config.itemOverrides[keyStr];
            console.log(`Override price for item '${keyStr}' removed.`);
        } else {
            const numPrice = parseInt(price, 10);
            if (isNaN(numPrice) || numPrice < 0) {
                console.error(`Invalid price for setItemPrice: ${price}. Must be a non-negative number.`);
                return false;
            }
            this.config.itemOverrides[keyStr] = numPrice;
            console.log(`Override price for item '${keyStr}' set to ${numPrice} ${this.currency}.`);
        }
        this.saveConfig();
        return true;
    }

    /**
     * Sets a default price for an entire class of items.
     * classSystem: 'inventoryTypes', 'itemCategories', or 'subInventoryTypes'.
     * className: The name of the class (e.g., 'CHAMPION', 'EPIC_SKIN').
     * price: The price in RP. Pass null or undefined to remove the class price.
     */
    setClassPrice(classSystem, className, price) {
        if (!['inventoryTypes', 'itemCategories', 'subInventoryTypes'].includes(classSystem)) {
            console.error(`Invalid classSystem: ${classSystem}`);
            return false;
        }
        if (!this.config.defaultPrices[classSystem]) {
            this.config.defaultPrices[classSystem] = {};
        }

        if (price === null || price === undefined) {
            delete this.config.defaultPrices[classSystem][className];
            console.log(`Default price for class '${classSystem}.${className}' removed.`);
        } else {
            const numPrice = parseInt(price, 10);
            if (isNaN(numPrice) || numPrice < 0) {
                console.error(`Invalid price for setClassPrice: ${price}. Must be a non-negative number.`);
                return false;
            }
            this.config.defaultPrices[classSystem][className] = numPrice;
            console.log(`Default price for class '${classSystem}.${className}' set to ${numPrice} ${this.currency}.`);
        }
        this.saveConfig();
        return true;
    }

    getAllPriceConfigs() {
        return JSON.parse(JSON.stringify(this.config)); // Return a deep copy
    }

    getValidClassSystems() {
        return ['inventoryTypes', 'itemCategories', 'subInventoryTypes'];
    }

    // This could be enhanced to read from inventory-analysis.json
    getValidClassNamesForSystem(classSystem) {
        if (this.config.defaultPrices && this.config.defaultPrices[classSystem]) {
            return Object.keys(this.config.defaultPrices[classSystem]);
        }
        return [];
    }
}

// Export a singleton instance
module.exports = new PriceManager();