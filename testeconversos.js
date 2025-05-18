const fs = require('fs');

class InventoryAnalyzer {
    constructor() {
        this.inventoryTypes = new Map();
        this.subInventoryTypes = new Map();
        this.itemCategories = new Map();
        this.priceRanges = new Map();
        this.currencies = new Set();
    }

    // Analisar arquivo de catálogo da API
    analyzeApiCatalog(filePath) {
        try {
            console.log(`📂 Analisando arquivo: ${filePath}`);
            
            const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            if (!Array.isArray(rawData)) {
                console.error('❌ Arquivo não contém array de itens');
                return;
            }

            console.log(`📊 Total de itens: ${rawData.length}`);
            
            // Analisar cada item
            rawData.forEach((item, index) => {
                this.analyzeItem(item, index);
            });

            // Gerar relatório
            this.generateReport();
            this.saveReport();

        } catch (error) {
            console.error('❌ Erro ao analisar catálogo:', error);
        }
    }

    analyzeItem(item, index) {
        try {
            // Analisar inventory type
            const inventoryType = item.inventoryType || 'UNKNOWN';
            this.incrementCounter(this.inventoryTypes, inventoryType);

            // Analisar sub inventory type
            const subInventoryType = item.subInventoryType || 'NONE';
            this.incrementCounter(this.subInventoryTypes, subInventoryType);

            // Analisar categorias de itens
            const category = this.categorizeItem(item);
            this.incrementCounter(this.itemCategories, category);

            // Analisar preços
            if (item.prices && Array.isArray(item.prices)) {
                item.prices.forEach(price => {
                    const currency = price.currency || 'UNKNOWN_CURRENCY';
                    this.currencies.add(currency);

                    if (price.cost && typeof price.cost === 'number') {
                        const priceRange = this.getPriceRange(price.cost);
                        const key = `${currency}_${priceRange}`;
                        this.incrementCounter(this.priceRanges, key);
                    }
                });
            }

            // Log para debug (apenas primeiros 10 itens)
            if (index < 10) {
                console.log(`Item ${index + 1}:`, {
                    id: item.itemId,
                    type: inventoryType,
                    subType: subInventoryType,
                    category: category,
                    prices: item.prices?.length || 0
                });
            }

        } catch (error) {
            console.warn(`⚠️ Erro ao analisar item ${index}: ${error.message}`);
        }
    }

    categorizeItem(item) {
        const inventoryType = item.inventoryType || '';
        const subInventoryType = item.subInventoryType || '';
        const itemId = item.itemId || 0;

        // Categorizar baseado no inventory type
        switch (inventoryType) {
            case 'CHAMPION_SKIN':
                return this.categorizeSkin(item);
            case 'CHAMPION':
                return 'CHAMPION';
            case 'BUNDLES':
                return this.categorizeBundle(item);
            case 'HEXTECH_CRAFTING':
                return this.categorizeHextech(item);
            case 'SUMMONER_ICON':
                return 'SUMMONER_ICON';
            case 'WARD_SKIN':
                return 'WARD_SKIN';
            case 'EMOTE':
                return 'EMOTE';
            case 'ETERNALS':
                return 'ETERNALS';
            case 'TFT_MAP_SKIN':
                return 'TFT_MAP_SKIN';
            case 'TFT_DAMAGE_SKIN':
                return 'TFT_DAMAGE_SKIN';
            case 'COMPANION':
                return 'COMPANION';
            default:
                return `OTHER_${inventoryType}`;
        }
    }

    categorizeSkin(item) {
        const itemId = item.itemId || 0;
        const skinNumber = itemId % 1000;
        
        // Detectar se é chroma baseado no número da skin
        if (skinNumber >= 100) {
            return 'CHROMA';
        }

        // Categorizar baseado no subtype ou preço
        const subType = item.subInventoryType || '';
        if (subType.includes('PRESTIGE')) return 'PRESTIGE_SKIN';
        if (subType.includes('MYTHIC')) return 'MYTHIC_SKIN';

        // Categorizar por preço
        if (item.prices && item.prices.length > 0) {
            const rpPrice = item.prices.find(p => p.currency === 'RP');
            if (rpPrice && rpPrice.cost) {
                if (rpPrice.cost >= 3250) return 'ULTIMATE_SKIN';
                if (rpPrice.cost >= 1820) return 'LEGENDARY_SKIN';
                if (rpPrice.cost >= 1350) return 'EPIC_SKIN';
                if (rpPrice.cost >= 975) return 'RARE_SKIN';
                if (rpPrice.cost >= 520) return 'COMMON_SKIN';
                if (rpPrice.cost < 520) return 'BUDGET_SKIN';
            }
        }

        return 'REGULAR_SKIN';
    }

    categorizeBundle(item) {
        const name = item.localizations?.en_US?.name || '';
        
        if (name.toLowerCase().includes('chroma')) return 'CHROMA_BUNDLE';
        if (name.toLowerCase().includes('prestige')) return 'PRESTIGE_BUNDLE';
        if (name.toLowerCase().includes('champion')) return 'CHAMPION_BUNDLE';
        if (name.toLowerCase().includes('skin')) return 'SKIN_BUNDLE';
        if (name.toLowerCase().includes('event')) return 'EVENT_BUNDLE';
        
        return 'REGULAR_BUNDLE';
    }

    categorizeHextech(item) {
        const subType = item.subInventoryType || '';
        
        if (subType.includes('CHEST')) return 'HEXTECH_CHEST';
        if (subType.includes('KEY')) return 'HEXTECH_KEY';
        if (subType.includes('GEMSTONE')) return 'GEMSTONE';
        if (subType.includes('ORBS')) return 'LOOT_ORBS';
        
        return 'HEXTECH_OTHER';
    }

    getPriceRange(cost) {
        if (cost === 0) return 'FREE';
        if (cost < 100) return '0-99';
        if (cost < 500) return '100-499';
        if (cost < 1000) return '500-999';
        if (cost < 1500) return '1000-1499';
        if (cost < 2000) return '1500-1999';
        if (cost < 3000) return '2000-2999';
        if (cost < 5000) return '3000-4999';
        return '5000+';
    }

    incrementCounter(map, key) {
        map.set(key, (map.get(key) || 0) + 1);
    }

    generateReport() {
        console.log('\n📋 RELATÓRIO DE ANÁLISE DO CATÁLOGO');
        console.log('=====================================\n');

        console.log('🎯 TIPOS DE INVENTORY:');
        this.printSortedMap(this.inventoryTypes);

        console.log('\n🎯 SUB-TIPOS DE INVENTORY:');
        this.printSortedMap(this.subInventoryTypes);

        console.log('\n🎯 CATEGORIAS DE ITENS:');
        this.printSortedMap(this.itemCategories);

        console.log('\n💰 MOEDAS DISPONÍVEIS:');
        Array.from(this.currencies).forEach(currency => {
            console.log(`  - ${currency}`);
        });

        console.log('\n💰 DISTRIBUIÇÃO DE PREÇOS:');
        this.printSortedMap(this.priceRanges);
    }

    printSortedMap(map) {
        const sorted = Array.from(map.entries())
            .sort((a, b) => b[1] - a[1]);
        
        sorted.forEach(([key, count]) => {
            const percentage = ((count / this.getTotalItems()) * 100).toFixed(1);
            console.log(`  ${key}: ${count} (${percentage}%)`);
        });
    }

    getTotalItems() {
        return Array.from(this.inventoryTypes.values()).reduce((a, b) => a + b, 0);
    }

    saveReport() {
        const report = {
            metadata: {
                analyzedAt: new Date().toISOString(),
                totalItems: this.getTotalItems()
            },
            inventoryTypes: Object.fromEntries(this.inventoryTypes),
            subInventoryTypes: Object.fromEntries(this.subInventoryTypes),
            itemCategories: Object.fromEntries(this.itemCategories),
            currencies: Array.from(this.currencies),
            priceRanges: Object.fromEntries(this.priceRanges)
        };

        const fileName = `inventory-analysis-${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(report, null, 2));
        console.log(`\n✅ Relatório salvo em: ${fileName}`);
    }

    // Gerar configuração para o conversor baseado na análise
    generateConverterConfig() {
        const config = {
            inventoryTypeMapping: {
                'CHAMPION_SKIN': {
                    handler: 'processSkin',
                    subcategories: ['CHROMA', 'PRESTIGE_SKIN', 'MYTHIC_SKIN', 'ULTIMATE_SKIN', 'LEGENDARY_SKIN', 'EPIC_SKIN', 'RARE_SKIN', 'COMMON_SKIN']
                },
                'CHAMPION': {
                    handler: 'processChampion',
                    subcategories: []
                },
                'BUNDLES': {
                    handler: 'processBundle',
                    subcategories: ['CHROMA_BUNDLE', 'PRESTIGE_BUNDLE', 'CHAMPION_BUNDLE', 'SKIN_BUNDLE', 'EVENT_BUNDLE']
                },
                'HEXTECH_CRAFTING': {
                    handler: 'processHextech',
                    subcategories: ['HEXTECH_CHEST', 'HEXTECH_KEY', 'GEMSTONE', 'LOOT_ORBS']
                },
                'SUMMONER_ICON': {
                    handler: 'processSummonerIcon',
                    subcategories: []
                },
                'WARD_SKIN': {
                    handler: 'processWardSkin',
                    subcategories: []
                },
                'EMOTE': {
                    handler: 'processEmote',
                    subcategories: []
                },
                'ETERNALS': {
                    handler: 'processEternals',
                    subcategories: []
                }
            },
            priceCategories: {
                'RP': {
                    'Ultimate': 3250,
                    'Legendary': 1820,
                    'Epic': 1350,
                    'Rare': 975,
                    'Common': 520,
                    'Budget': 290
                },
                'BE': {
                    'Expensive': 6300,
                    'Standard': 4800,
                    'Cheap': 3150,
                    'Budget': 1350
                }
            },
            filters: {
                enabledTypes: Array.from(this.inventoryTypes.keys()),
                priceRanges: Array.from(new Set(Array.from(this.priceRanges.keys()).map(key => key.split('_')[1]))),
                currencies: Array.from(this.currencies)
            }
        };

        const configFileName = 'converter-config.json';
        fs.writeFileSync(configFileName, JSON.stringify(config, null, 2));
        console.log(`\n✅ Configuração do conversor salva em: ${configFileName}`);

        return config;
    }

    // Método para uso via linha de comando
    static async run() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log(`
🔍 Analisador de Inventário do LoL

Uso: node inventoryAnalyzer.js [arquivo-catalogo.json]

Exemplos:
  node inventoryAnalyzer.js catalog-api.json
  node inventoryAnalyzer.js riot-catalog-data.json

O script irá:
1. Analisar todos os tipos de inventory
2. Categorizar os itens
3. Gerar estatísticas de preços
4. Criar configuração para o conversor
            `);
            return;
        }

        const inputFile = args[0];
        
        if (!fs.existsSync(inputFile)) {
            console.error(`❌ Arquivo não encontrado: ${inputFile}`);
            return;
        }

        const analyzer = new InventoryAnalyzer();
        analyzer.analyzeApiCatalog(inputFile);
        analyzer.generateConverterConfig();
    }
}

// Se executado diretamente
if (require.main === module) {
    InventoryAnalyzer.run().catch(console.error);
}

module.exports = InventoryAnalyzer;
