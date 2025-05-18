const fs = require('fs');
const path = require('path');

class PriceManager {
    constructor() {
        this.priceConfigPath = './price-config.json';
        this.customPricesPath = './custom-prices.json';
        
        // Carregar configurações
        this.loadPriceConfig();
        this.loadCustomPrices();
        
        // Mapeamento baseado na análise
        this.categoryMapping = {
            // Skins por raridade (baseado no preço original da API)
            'ULTIMATE_SKIN': { defaultPrice: 3250, category: 'skin', rarity: 'Ultimate' },
            'LEGENDARY_SKIN': { defaultPrice: 1820, category: 'skin', rarity: 'Legendary' },
            'EPIC_SKIN': { defaultPrice: 1350, category: 'skin', rarity: 'Epic' },
            'RARE_SKIN': { defaultPrice: 975, category: 'skin', rarity: 'Rare' },
            'COMMON_SKIN': { defaultPrice: 520, category: 'skin', rarity: 'Common' },
            'BUDGET_SKIN': { defaultPrice: 290, category: 'skin', rarity: 'Budget' },
            'CHROMA': { defaultPrice: 290, category: 'chroma', rarity: 'Chroma' },
            
            // Outros itens
            'CHAMPION': { defaultPrice: 790, category: 'champion', rarity: 'Standard' },
            'SUMMONER_ICON': { defaultPrice: 250, category: 'icon', rarity: 'Standard' },
            'WARD_SKIN': { defaultPrice: 640, category: 'ward', rarity: 'Standard' },
            'EMOTE': { defaultPrice: 350, category: 'emote', rarity: 'Standard' },
            
            // Bundles (calculado dinamicamente)
            'REGULAR_BUNDLE': { defaultPrice: 0, category: 'bundle', rarity: 'Bundle' },
            
            // TFT
            'TFT_DAMAGE_SKIN': { defaultPrice: 490, category: 'tft', rarity: 'Standard' },
            'TFT_MAP_SKIN': { defaultPrice: 1380, category: 'tft', rarity: 'Premium' },
            
            // Companions
            'COMPANION': { defaultPrice: 750, category: 'companion', rarity: 'Standard' }
        };
    }

    loadPriceConfig() {
        try {
            if (fs.existsSync(this.priceConfigPath)) {
                this.priceConfig = JSON.parse(fs.readFileSync(this.priceConfigPath, 'utf8'));
            } else {
                this.priceConfig = this.getDefaultPriceConfig();
                this.savePriceConfig();
            }
        } catch (error) {
            console.error('Erro ao carregar configuração de preços:', error);
            this.priceConfig = this.getDefaultPriceConfig();
        }
    }

    loadCustomPrices() {
        try {
            if (fs.existsSync(this.customPricesPath)) {
                this.customPrices = JSON.parse(fs.readFileSync(this.customPricesPath, 'utf8'));
            } else {
                this.customPrices = {};
                this.saveCustomPrices();
            }
        } catch (error) {
            console.error('Erro ao carregar preços customizados:', error);
            this.customPrices = {};
        }
    }

    getDefaultPriceConfig() {
        return {
            // Preços por categoria/raridade
            categories: {
                skin: {
                    Ultimate: 3250,
                    Legendary: 1820,
                    Epic: 1350,
                    Rare: 975,
                    Common: 520,
                    Budget: 290
                },
                chroma: {
                    Chroma: 290,
                    Bundle: 590,    // Para bundle de chromas
                    Ruby: 0,        // Apenas em bundles
                    Event: 300      // Chromas de evento
                },
                champion: {
                    Expensive: 6300,    // Convertido de BE
                    Standard: 4800,     // Convertido de BE  
                    Moderate: 3150,     // Convertido de BE
                    Cheap: 1350,        // Convertido de BE
                    Budget: 450         // Convertido de BE
                },
                bundle: {
                    Skin: 0,        // Calculado dinamicamente
                    Champion: 0,    // Calculado dinamicamente
                    Chroma: 590,    // Fixo
                    Event: 0,       // Calculado dinamicamente
                    Starter: 650    // Packs iniciantes
                },
                icon: {
                    Standard: 250,
                    Premium: 975,
                    Event: 0,       // Grátis em eventos
                    Legacy: 350
                },
                ward: {
                    Standard: 640,
                    Premium: 975,
                    Legacy: 520
                },
                emote: {
                    Standard: 350,
                    Premium: 675,
                    Event: 0        // Grátis em eventos
                },
                tft: {
                    Damage: 490,
                    Map: 1380,
                    Little_Legend: 750
                },
                companion: {
                    Standard: 750,
                    Premium: 975,
                    Rare: 1380
                }
            },
            
            // Multiplicadores especiais
            modifiers: {
                prestige: 2.0,      // Skins Prestige custam 2x mais
                mythic: 1.5,        // Itens míticos custam 1.5x mais
                limited: 1.3,       // Itens limitados custam 1.3x mais
                legacy: 1.1,        // Itens legacy custam 1.1x mais
                bundle_discount: 0.85,  // Bundles têm 15% de desconto
                event_discount: 0.9     // Itens de evento têm 10% de desconto
            },

            // Preços especiais
            special: {
                prestige_points: 2000,  // Preço em pontos de prestígio (convertido)
                gemstone: 10,           // Preço em gemas (convertido para 2500 RP)
                mythic_essence: 125     // Preço em essência mítica (convertido)
            }
        };
    }

    savePriceConfig() {
        try {
            fs.writeFileSync(this.priceConfigPath, JSON.stringify(this.priceConfig, null, 2));
        } catch (error) {
            console.error('Erro ao salvar configuração de preços:', error);
        }
    }

    saveCustomPrices() {
        try {
            fs.writeFileSync(this.customPricesPath, JSON.stringify(this.customPrices, null, 2));
        } catch (error) {
            console.error('Erro ao salvar preços customizados:', error);
        }
    }

    // Obter preço de um item específico
    getItemPrice(itemId, category, rarity, originalPrice = null) {
        // 1. Verificar se tem preço customizado para o item específico
        if (this.customPrices[itemId]) {
            return this.customPrices[itemId];
        }

        // 2. Verificar se tem preço configurado para a categoria/raridade
        if (this.priceConfig.categories[category] && this.priceConfig.categories[category][rarity]) {
            let price = this.priceConfig.categories[category][rarity];
            
            // Se o preço configurado é 0, usar preço original ou padrão
            if (price === 0) {
                price = originalPrice || this.categoryMapping[`${category.toUpperCase()}_${rarity.toUpperCase()}`]?.defaultPrice || 975;
            }

            return price;
        }

        // 3. Fallback para preço original ou padrão da categoria
        if (originalPrice) {
            return originalPrice;
        }

        // 4. Fallback final baseado no mapeamento de categoria
        const categoryKey = Object.keys(this.categoryMapping).find(key => 
            this.categoryMapping[key].category === category && 
            this.categoryMapping[key].rarity === rarity
        );

        return categoryKey ? this.categoryMapping[categoryKey].defaultPrice : 975;
    }

    // Definir preço customizado para um item específico
    setCustomItemPrice(itemId, price) {
        this.customPrices[itemId] = price;
        this.saveCustomPrices();
        console.log(`✅ Preço customizado definido para item ${itemId}: ${price} RP`);
    }

    // Remover preço customizado de um item
    removeCustomItemPrice(itemId) {
        if (this.customPrices[itemId]) {
            delete this.customPrices[itemId];
            this.saveCustomPrices();
            console.log(`✅ Preço customizado removido para item ${itemId}`);
            return true;
        }
        return false;
    }

    // Definir preço para uma categoria/raridade
    setCategoryPrice(category, rarity, price) {
        if (!this.priceConfig.categories[category]) {
            this.priceConfig.categories[category] = {};
        }
        
        this.priceConfig.categories[category][rarity] = price;
        this.savePriceConfig();
        console.log(`✅ Preço definido para ${category}/${rarity}: ${price} RP`);
    }

    // Aplicar modificadores especiais
    applyModifiers(price, modifiers = []) {
        let finalPrice = price;

        modifiers.forEach(modifier => {
            if (this.priceConfig.modifiers[modifier]) {
                finalPrice *= this.priceConfig.modifiers[modifier];
            }
        });

        return Math.round(finalPrice);
    }

    // Calcular preço de bundle dinamicamente
    calculateBundlePrice(bundleItems, discountPercent = 15) {
        let totalPrice = 0;

        bundleItems.forEach(item => {
            totalPrice += this.getItemPrice(item.itemId, item.category, item.rarity, item.originalPrice);
        });

        // Aplicar desconto
        const discount = 1 - (discountPercent / 100);
        return Math.round(totalPrice * discount);
    }

    // Listar todos os preços customizados
    listCustomPrices() {
        return Object.entries(this.customPrices).map(([itemId, price]) => ({
            itemId: parseInt(itemId),
            customPrice: price
        }));
    }

    // Listar preços por categoria
    listCategoryPrices() {
        return this.priceConfig.categories;
    }

    // Obter estatísticas de preços
    getPriceStatistics(catalog) {
        const stats = {
            totalItems: catalog.length,
            customPriceCount: Object.keys(this.customPrices).length,
            averagePrice: 0,
            priceDistribution: {},
            categoryBreakdown: {}
        };

        let totalPrice = 0;

        catalog.forEach(item => {
            const price = this.getItemPrice(item.originalItemId, item.category, item.rarity, item.originalPrice);
            totalPrice += price;

            // Distribuição de preços
            const range = this.getPriceRange(price);
            stats.priceDistribution[range] = (stats.priceDistribution[range] || 0) + 1;

            // Breakdown por categoria
            if (!stats.categoryBreakdown[item.category]) {
                stats.categoryBreakdown[item.category] = { count: 0, totalPrice: 0 };
            }
            stats.categoryBreakdown[item.category].count++;
            stats.categoryBreakdown[item.category].totalPrice += price;
        });

        stats.averagePrice = Math.round(totalPrice / catalog.length);

        // Calcular preço médio por categoria
        Object.keys(stats.categoryBreakdown).forEach(category => {
            const breakdown = stats.categoryBreakdown[category];
            breakdown.averagePrice = Math.round(breakdown.totalPrice / breakdown.count);
        });

        return stats;
    }

    getPriceRange(price) {
        if (price === 0) return 'Grátis';
        if (price < 500) return '1-499 RP';
        if (price < 1000) return '500-999 RP';
        if (price < 1500) return '1000-1499 RP';
        if (price < 2000) return '1500-1999 RP';
        if (price < 3000) return '2000-2999 RP';
        return '3000+ RP';
    }

    // Exportar configuração completa
    exportConfiguration() {
        return {
            priceConfig: this.priceConfig,
            customPrices: this.customPrices,
            categoryMapping: this.categoryMapping,
            exportedAt: new Date().toISOString()
        };
    }

    // Importar configuração
    importConfiguration(configData) {
        try {
            if (configData.priceConfig) {
                this.priceConfig = configData.priceConfig;
                this.savePriceConfig();
            }

            if (configData.customPrices) {
                this.customPrices = configData.customPrices;
                this.saveCustomPrices();
            }

            console.log('✅ Configuração importada com sucesso');
            return true;
        } catch (error) {
            console.error('❌ Erro ao importar configuração:', error);
            return false;
        }
    }

    // Resetar todos os preços para padrão
    resetToDefaults() {
        this.priceConfig = this.getDefaultPriceConfig();
        this.customPrices = {};
        this.savePriceConfig();
        this.saveCustomPrices();
        console.log('✅ Todos os preços foram resetados para o padrão');
    }

    // Método para uso via linha de comando
    static async run() {
        const args = process.argv.slice(2);
        const command = args[0];

        const priceManager = new PriceManager();

        switch (command) {
            case 'set-item':
                if (args.length < 3) {
                    console.log('Uso: node priceManager.js set-item <itemId> <price>');
                    return;
                }
                priceManager.setCustomItemPrice(parseInt(args[1]), parseInt(args[2]));
                break;

            case 'set-category':
                if (args.length < 4) {
                    console.log('Uso: node priceManager.js set-category <category> <rarity> <price>');
                    return;
                }
                priceManager.setCategoryPrice(args[1], args[2], parseInt(args[3]));
                break;

            case 'remove-item':
                if (args.length < 2) {
                    console.log('Uso: node priceManager.js remove-item <itemId>');
                    return;
                }
                priceManager.removeCustomItemPrice(parseInt(args[1]));
                break;

            case 'list-custom':
                const customPrices = priceManager.listCustomPrices();
                console.log('Preços customizados:');
                customPrices.forEach(item => {
                    console.log(`  Item ${item.itemId}: ${item.customPrice} RP`);
                });
                break;

            case 'list-categories':
                const categories = priceManager.listCategoryPrices();
                console.log('Preços por categoria:');
                console.log(JSON.stringify(categories, null, 2));
                break;

            case 'export':
                const config = priceManager.exportConfiguration();
                const exportPath = args[1] || 'price-export.json';
                fs.writeFileSync(exportPath, JSON.stringify(config, null, 2));
                console.log(`✅ Configuração exportada para: ${exportPath}`);
                break;

            case 'import':
                if (args.length < 2) {
                    console.log('Uso: node priceManager.js import <file>');
                    return;
                }
                const importData = JSON.parse(fs.readFileSync(args[1], 'utf8'));
                priceManager.importConfiguration(importData);
                break;

            case 'reset':
                priceManager.resetToDefaults();
                break;

            default:
                console.log(`
🎯 Gerenciador de Preços do LoL

Comandos disponíveis:
  set-item <itemId> <price>           - Definir preço customizado para item específico
  set-category <category> <rarity> <price> - Definir preço para categoria/raridade
  remove-item <itemId>                - Remover preço customizado de item
  list-custom                         - Listar todos os preços customizados
  list-categories                     - Listar preços por categoria
  export [file]                       - Exportar configuração completa
  import <file>                       - Importar configuração
  reset                               - Resetar todos os preços para padrão

Exemplos:
  node priceManager.js set-item 103001 2000
  node priceManager.js set-category skin Legendary 2500
  node priceManager.js export my-prices.json
  node priceManager.js import backup-prices.json
                `);
        }
    }
}

// Se executado diretamente
if (require.main === module) {
    PriceManager.run().catch(console.error);
}

module.exports = PriceManager;