const fs = require('fs');
const path = require('path');
const PriceManager = require('./PriceManager'); // Assuming PriceManager.js is in the same directory

// Paths for data files - adjust if they are elsewhere
const RAW_CATALOG_PATH_DEFAULT = './catalog.json'; // Your input catalog from the API/previous step
const INVENTORY_ANALYSIS_PATH = path.resolve(__dirname, './inventory-analysis-1747600948977.json');
const OUTPUT_CATALOG_PATH_DEFAULT = './lol-catalog-converted.json';

class LolCatalogConverter {
    constructor() {
        this.championNames = this.loadChampionNames(); // Example, if you have a separate champion name mapping
        this.inventoryAnalysis = this.loadInventoryAnalysis();
    }

    loadChampionNames() {
        // Placeholder: Load your champion ID to Name mapping if you have one.
        // Example from your original file:
        // return { 1: "Annie", 2: "Olaf", ... };
        // For simplicity, we'll try to get champion name from item data if possible,
        // or you might need to adapt this based on your 'catalog.json' structure.
        // If skins in catalog.json have parent championId, this can be used.
        // The provided catalog.json items like AUGMENT have parent: { inventoryType: "CHAMPION", itemId: 115 }
        // This structure needs to be consistently available or handled.
        console.warn("Champion name mapping may need to be implemented or loaded if not present in catalog items directly.");
        return {};
    }

    loadInventoryAnalysis() {
        try {
            if (fs.existsSync(INVENTORY_ANALYSIS_PATH)) {
                const rawData = fs.readFileSync(INVENTORY_ANALYSIS_PATH, 'utf8');
                return JSON.parse(rawData);
            } else {
                console.error(`Inventory analysis file not found at ${INVENTORY_ANALYSIS_PATH}. Classification might be incomplete.`);
                return { inventoryTypes: {}, itemCategories: {}, subInventoryTypes: {} }; // Empty fallback
            }
        } catch (error) {
            console.error('Error loading inventory analysis:', error);
            return { inventoryTypes: {}, itemCategories: {}, subInventoryTypes: {} };
        }
    }

    // Helper to map raw catalog item to classes defined in inventory-analysis.json
    // This is a simplified example; you'll need to adapt it based on how your
    // raw catalog items relate to the categories in inventory-analysis.json.
    // This might involve looking at item.tags, item.prices (original RP), or other properties.
    determineItemClasses(rawItem) {
        const classes = {
            inventoryType: rawItem.inventoryType, // This is the raw type from catalog.json
            itemCategory: null,
            subInventoryType: rawItem.subInventoryType || null, // If present in rawItem
        };

        // Attempt to map to itemCategory (e.g., EPIC_SKIN)
        // This is highly dependent on your data and analysis logic.
        // Example: If inventory-analysis.json lists item IDs under specific categories,
        // you could use that. Or, if price tiers in catalog.json map to itemCategories.
        // For now, this is a placeholder for your specific mapping logic.
        if (rawItem.inventoryType === "CHAMPION_SKIN") {
            // Simplified: Try to guess category from original price if available
            // This is a very basic example. A more robust solution would involve
            // looking up against priceRanges in inventory-analysis.json or specific tags.
            if (rawItem.prices && rawItem.prices.length > 0) {
                const rpPrice = rawItem.prices.find(p => p.currency === "RP");
                if (rpPrice) {
                    const cost = rpPrice.cost;
                    if (cost >= 3000) classes.itemCategory = "ULTIMATE_SKIN";
                    else if (cost >= 1820) classes.itemCategory = "LEGENDARY_SKIN";
                    else if (cost >= 1350) classes.itemCategory = "EPIC_SKIN";
                    else if (cost >= 975) classes.itemCategory = "RARE_SKIN"; // Or whatever your analysis defines
                    else if (cost >= 520) classes.itemCategory = "COMMON_SKIN";
                    else classes.itemCategory = "BUDGET_SKIN";
                }
            }
             // Fallback or more specific logic might be needed here
            if (!classes.itemCategory && this.inventoryAnalysis.itemCategories) {
                 // Check if any of the rawItem.tags match a known itemCategory.
                 // This requires your analysis file to list categories and the user to provide tags.
                 // For now, we'll default to the inventoryType if no better category found.
                 // classes.itemCategory = rawItem.inventoryType; // Default to raw type if no mapping
            }
        } else if (this.inventoryAnalysis.itemCategories && this.inventoryAnalysis.itemCategories[rawItem.inventoryType]) {
            // If the rawInventoryType itself is an itemCategory in the analysis (e.g. "CHAMPION")
            classes.itemCategory = rawItem.inventoryType;
        }


        // Attempt to map to subInventoryType
        // Example: if rawItem.subInventoryType exists, use it.
        // Otherwise, logic might be needed based on rawItem.inventoryType or tags.
        if (rawItem.subInventoryType && this.inventoryAnalysis.subInventoryTypes && this.inventoryAnalysis.subInventoryTypes[rawItem.subInventoryType]) {
            classes.subInventoryType = rawItem.subInventoryType;
        }
        // If the item is a RECOLOR (Chroma), explicitly set itemCategory to CHROMA if not already set.
        if (rawItem.subInventoryType === 'RECOLOR' && !classes.itemCategory) {
            classes.itemCategory = 'CHROMA';
        }


        return classes;
    }


    convertItem(rawItem) {
        const nameInfo = rawItem.localizations && rawItem.localizations.pt_BR
            ? rawItem.localizations.pt_BR
            : (rawItem.localizations && rawItem.localizations.en_US ? rawItem.localizations.en_US : { name: `Item ${rawItem.itemId}`, description: '' });

        const determinedClasses = this.determineItemClasses(rawItem);

        // The item object to be passed to PriceManager
        const itemForPricing = {
            itemKey: String(rawItem.itemId), // Using itemId as the unique key for overrides
            inventoryType: determinedClasses.inventoryType, // This is crucial
            itemCategory: determinedClasses.itemCategory,   // This is crucial
            subInventoryType: determinedClasses.subInventoryType, // This is crucial
            // You might need to add other properties if your PriceManager logic depends on them
        };

        const price = PriceManager.getItemPrice(itemForPricing);
        
        let originalRpCost = 0;
        if (rawItem.prices) {
            const rp = rawItem.prices.find(p => p.currency === "RP");
            if (rp) originalRpCost = rp.cost;
        }

        const convertedItem = {
            id: rawItem.itemId, // Keep original itemId as id for consistency
            name: nameInfo.name,
            description: nameInfo.description || '',
            inventoryType: rawItem.inventoryType, // Keep the original inventoryType for reference
            subInventoryType: rawItem.subInventoryType || null,
            itemCategory: determinedClasses.itemCategory, // The determined category
            price: price, // Price from new PriceManager
            currency: PriceManager.currency,
            originalRpPrice: originalRpCost, // Original RP price from catalog if available
            iconUrl: rawItem.iconUrl,
            releaseDate: rawItem.releaseDate,
            active: rawItem.active,
            tags: rawItem.tags || [],
        };
        
        // Add champion info if relevant (e.g., for skins)
        if (rawItem.parent && rawItem.parent.inventoryType === 'CHAMPION') {
            convertedItem.championId = rawItem.parent.itemId;
            convertedItem.championName = this.championNames[rawItem.parent.itemId] || `Champion ${rawItem.parent.itemId}`;
        } else if (rawItem.inventoryType === 'CHAMPION') {
             convertedItem.championId = rawItem.itemId;
             convertedItem.championName = nameInfo.name; // Champion's name is the item name
        }


        return convertedItem;
    }

    async convertFile(inputFile = RAW_CATALOG_PATH_DEFAULT, outputFile = OUTPUT_CATALOG_PATH_DEFAULT) {
        console.log(`Starting catalog conversion from ${inputFile}...`);
        try {
            if (!fs.existsSync(inputFile)) {
                console.error(`Input catalog file not found: ${inputFile}`);
                return null;
            }
            const rawCatalogData = fs.readFileSync(inputFile, 'utf8');
            const rawCatalog = JSON.parse(rawCatalogData);

            if (!Array.isArray(rawCatalog)) {
                console.error('Invalid catalog format: Expected an array of items.');
                return null;
            }

            const convertedCatalog = rawCatalog.map(rawItem => this.convertItem(rawItem)).filter(item => item !== null);

            fs.writeFileSync(outputFile, JSON.stringify(convertedCatalog, null, 2), 'utf8');
            console.log(`✅ Catalog converted successfully! Output: ${outputFile}`);
            console.log(`Processed ${convertedCatalog.length} items.`);
            
            // Generate and log basic stats
            const stats = this.generateStats(convertedCatalog);
            console.log('--- Conversion Stats ---');
            console.log(`Total Items in Output: ${stats.totalItems}`);
            console.log(`Average Price (RP): ${stats.averagePrice}`);
            console.log(`Price Fallbacks Used: ${stats.fallbacksUsed}`);
            console.log(`Items Priced by Override: ${stats.overridesUsed}`);
            console.log(`Items Priced by ItemCategory: ${stats.categoryPricesUsed}`);
            console.log(`Items Priced by InventoryType: ${stats.inventoryTypePricesUsed}`);
            console.log(`Items Priced by SubInventoryType: ${stats.subTypePricesUsed}`);
            console.log('-------------------------');

            return convertedCatalog;

        } catch (error) {
            console.error('❌ Error during catalog conversion:', error);
            return null;
        }
    }
    
    generateStats(catalog) {
        const stats = {
            totalItems: catalog.length,
            averagePrice: 0,
            fallbacksUsed: 0,
            overridesUsed: 0,
            categoryPricesUsed: 0,
            inventoryTypePricesUsed: 0,
            subTypePricesUsed: 0,
        };
        let totalRp = 0;
        let pricedItemsCount = 0;

        catalog.forEach(item => {
            if (item.price > 0) { // Only count items with a non-zero price for average calculation
                totalRp += item.price;
                pricedItemsCount++;
            }
            
            const itemKey = String(item.id);

            if (PriceManager.config.itemOverrides[itemKey] !== undefined && PriceManager.config.itemOverrides[itemKey] === item.price) {
                stats.overridesUsed++;
            } else if (item.itemCategory && PriceManager.config.defaultPrices.itemCategories[item.itemCategory] !== undefined && PriceManager.config.defaultPrices.itemCategories[item.itemCategory] === item.price) {
                stats.categoryPricesUsed++;
            } else if (item.inventoryType && PriceManager.config.defaultPrices.inventoryTypes[item.inventoryType] !== undefined && PriceManager.config.defaultPrices.inventoryTypes[item.inventoryType] === item.price) {
                stats.inventoryTypePricesUsed++;
            } else if (item.subInventoryType && PriceManager.config.defaultPrices.subInventoryTypes[item.subInventoryType] !== undefined && PriceManager.config.defaultPrices.subInventoryTypes[item.subInventoryType] === item.price) {
                stats.subTypePricesUsed++;
            } else if (item.price === PriceManager.config.fallbackPrice) {
                 stats.fallbacksUsed++;
            }
        });

        stats.averagePrice = pricedItemsCount > 0 ? Math.round(totalRp / pricedItemsCount) : 0;
        return stats;
    }

    // CLI interface (optional, can be removed if not needed)
    static async run() {
        const converter = new LolCatalogConverter();
        const args = process.argv.slice(2);
        const inputFile = args[0] || RAW_CATALOG_PATH_DEFAULT;
        const outputFile = args[1] || OUTPUT_CATALOG_PATH_DEFAULT;
        
        console.log("LolCatalogConverter CLI Mode");
        if (args[0] === 'create-default-price-config') {
            const priceConfigPath = args[1] || './price-config.json';
            // This will create a new price-config.json with default structure if it doesn't exist
            // by just instantiating PriceManager. The user should then populate it.
            new PriceManager(); // Instantiation handles creation if not exists.
            console.log(`Default price config structure ensured/created at ${priceConfigPath}. Please populate it with values.`);
            return;
        }

        await converter.convertFile(inputFile, outputFile);
    }
}

// If run directly from command line:
if (require.main === module) {
    LolCatalogConverter.run().catch(err => {
        console.error("CLI Error:", err);
        process.exit(1);
    });
}

module.exports = LolCatalogConverter;