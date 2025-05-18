const fs = require('fs');
const fetch = require('node-fetch');

class LoLCatalogConverter {
    constructor() {
        // Todos os campeões do LoL com IDs e nomes (atualizado até 2024)
        this.championNames = {
            1: "Annie",
            2: "Olaf", 
            3: "Galio",
            4: "Twisted Fate",
            5: "Xin Zhao",
            6: "Urgot",
            7: "LeBlanc",
            8: "Vladimir",
            9: "Fiddlesticks",
            10: "Kayle",
            11: "Master Yi",
            12: "Alistar",
            13: "Ryze",
            14: "Sion",
            15: "Sivir",
            16: "Soraka",
            17: "Teemo",
            18: "Tristana",
            19: "Warwick",
            20: "Nunu & Willump",
            21: "Miss Fortune",
            22: "Ashe",
            23: "Tryndamere",
            24: "Jax",
            25: "Morgana",
            26: "Zilean",
            27: "Singed",
            28: "Evelynn",
            29: "Twitch",
            30: "Karthus",
            31: "Cho'Gath",
            32: "Amumu",
            33: "Rammus",
            34: "Anivia",
            35: "Shaco",
            36: "Dr. Mundo",
            37: "Sona",
            38: "Kassadin",
            39: "Irelia",
            40: "Janna",
            41: "Gangplank",
            42: "Corki",
            43: "Karma",
            44: "Taric",
            45: "Veigar",
            48: "Trundle",
            50: "Swain",
            51: "Caitlyn",
            53: "Blitzcrank",
            54: "Malphite",
            55: "Katarina",
            56: "Nocturne",
            57: "Maokai",
            58: "Renekton",
            59: "Jarvan IV",
            60: "Elise",
            61: "Orianna",
            62: "Wukong",
            63: "Brand",
            64: "Lee Sin",
            67: "Vayne",
            68: "Rumble",
            69: "Cassiopeia",
            72: "Skarner",
            74: "Heimerdinger",
            75: "Nasus",
            76: "Nidalee",
            77: "Udyr",
            78: "Poppy",
            79: "Gragas",
            80: "Pantheon",
            81: "Ezreal",
            82: "Mordekaiser",
            83: "Yorick",
            84: "Akali",
            85: "Kennen",
            86: "Garen",
            89: "Leona",
            90: "Malzahar",
            91: "Talon",
            92: "Riven",
            96: "Kog'Maw",
            98: "Shen",
            99: "Lux",
            101: "Xerath",
            102: "Shyvana",
            103: "Ahri",
            104: "Graves",
            105: "Fizz",
            106: "Volibear",
            107: "Rengar",
            110: "Varus",
            111: "Nautilus",
            112: "Viktor",
            113: "Sejuani",
            114: "Fiora",
            115: "Ziggs",
            117: "Lulu",
            119: "Draven",
            120: "Hecarim",
            121: "Kha'Zix",
            122: "Darius",
            126: "Jayce",
            127: "Lissandra",
            131: "Diana",
            133: "Quinn",
            134: "Syndra",
            136: "Aurelion Sol",
            141: "Kayn",
            142: "Zoe",
            143: "Zyra",
            145: "Kai'Sa",
            147: "Seraphine",
            150: "Gnar",
            154: "Zac",
            157: "Yasuo",
            161: "Vel'Koz",
            163: "Taliyah",
            164: "Camille",
            166: "Akshan",
            200: "Bel'Veth",
            201: "Braum",
            202: "Jhin",
            203: "Kindred",
            221: "Zeri",
            222: "Jinx",
            223: "Tahm Kench",
            234: "Viego",
            235: "Senna",
            236: "Lucian",
            238: "Zed",
            240: "Kled",
            245: "Ekko",
            246: "Qiyana",
            254: "Vi",
            266: "Aatrox",
            267: "Nami",
            268: "Azir",
            350: "Yuumi",
            360: "Samira",
            412: "Thresh",
            420: "Illaoi",
            421: "Rek'Sai",
            427: "Ivern",
            429: "Kalista",
            432: "Bard",
            516: "Ornn",
            517: "Sylas",
            518: "Neeko",
            523: "Aphelios",
            526: "Rell",
            555: "Pyke",
            711: "Vex",
            777: "Yone",
            875: "Sett",
            876: "Lillia",
            887: "Gwen",
            888: "Renata Glasc",
            895: "Nilah",
            897: "K'Sante",
            901: "Smolder",
            910: "Hwei",
            950: "Naafiri",
            902: "Milio"
        };

        // Sistema de preços por categoria e raridade
        this.priceConfig = {
            // Preços base para diferentes tipos de itens
            categories: {
                CHAMPION_SKIN: {
                    Ultimate: 3250,
                    Legendary: 1820,
                    Epic: 1350,
                    Rare: 975,
                    Common: 520,
                    Chroma: 290
                },
                CHAMPION: {
                    price: 790  // Preço fixo para campeões
                },
                BUNDLES: {
                    multiplier: 0.85  // 15% desconto em bundles
                },
                HEXTECH: {
                    multiplier: 1.2   // 20% mais caro para itens hextech
                },
                PRESTIGE: {
                    price: 2000       // Preço fixo para Prestige
                },
                MYTHIC: {
                    price: 10        // 10 gemas míticas
                }
            },
            // Multiplicadores especiais
            modifiers: {
                prestige: 1.5,
                mythic: 2.0,
                limited: 1.3,
                legacy: 1.1
            }
        };
    }

    // Carregar configuração de preços personalizada
    loadPriceConfig(configPath) {
        try {
            if (fs.existsSync(configPath)) {
                const customConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.priceConfig = { ...this.priceConfig, ...customConfig };
                console.log('✅ Configuração de preços personalizada carregada');
            }
        } catch (error) {
            console.log('⚠️ Erro ao carregar configuração de preços, usando padrão');
        }
    }

    // Salvar configuração de preços atual
    savePriceConfig(configPath) {
        try {
            fs.writeFileSync(configPath, JSON.stringify(this.priceConfig, null, 2));
            console.log('✅ Configuração de preços salva');
        } catch (error) {
            console.error('❌ Erro ao salvar configuração:', error);
        }
    }

    // Converter dados da API do LoL para o formato do bot
    convertApiToBotFormat(apiData) {
        const convertedSkins = [];
        let skinId = 1;

        // Processar cada item do catálogo da API
        apiData.forEach(item => {
            try {
                // Verificar se é um item de skin
                if (item.inventoryType === "CHAMPION_SKIN") {
                    const skinData = this.extractSkinData(item, skinId);
                    if (skinData && skinData.price > 0) {
                        convertedSkins.push(skinData);
                        skinId++;
                    }
                }
                // Processar bundles que contêm skins
                else if (item.inventoryType === "BUNDLES" && item.bundleItems) {
                    item.bundleItems.forEach(bundleItem => {
                        if (bundleItem.item && bundleItem.item.inventoryType === "CHAMPION_SKIN") {
                            const skinData = this.extractSkinFromBundle(bundleItem, item, skinId);
                            if (skinData && skinData.price > 0) {
                                convertedSkins.push(skinData);
                                skinId++;
                            }
                        }
                    });
                }
                // Processar hextech e outros tipos especiais
                else if (item.inventoryType === "HEXTECH_CRAFTING") {
                    const skinData = this.extractHextechSkin(item, skinId);
                    if (skinData && skinData.price > 0) {
                        convertedSkins.push(skinData);
                        skinId++;
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao processar item ${item.itemId}:`, error.message);
            }
        });

        return convertedSkins;
    }

    extractSkinData(item, skinId) {
        // Extrair ID do campeão do itemId da skin
        const championId = this.getChampionIdFromSkinId(item.itemId);
        const championName = this.championNames[championId] || `Champion${championId}`;
        
        // Obter preço
        let price = 0;
        let originalPrice = 0;
        
        if (item.prices && item.prices.length > 0) {
            const rpPrice = item.prices.find(p => p.currency === "RP");
            if (rpPrice) {
                originalPrice = rpPrice.cost;
                price = this.calculatePrice(rpPrice.cost, item);
            }
        }

        // Obter nome da skin
        let skinName = "Unknown Skin";
        if (item.localizations) {
            const ptBR = item.localizations.pt_BR || item.localizations.en_US;
            if (ptBR && ptBR.name) {
                skinName = ptBR.name;
            }
        }

        // Determinar raridade baseada no preço original
        const rarity = this.getRarityByPrice(originalPrice, item);

        // Verificar se é skin especial
        const isPrestige = skinName.toLowerCase().includes('prestige');
        const isMythic = item.subInventoryType === 'MYTHIC';
        const isHextech = skinName.toLowerCase().includes('hextech');

        return {
            id: skinId,
            name: skinName,
            champion: championName,
            rarity: rarity,
            price: price,
            originalPrice: originalPrice,
            splash_art: this.getSplashArtUrl(item),
            originalItemId: item.itemId,
            isPrestige: isPrestige,
            isMythic: isMythic,
            isHextech: isHextech,
            category: item.inventoryType
        };
    }

    extractSkinFromBundle(bundleItem, bundleInfo, skinId) {
        // Extrair ID do campeão
        const championId = this.getChampionIdFromSkinId(bundleItem.item.itemId);
        const championName = this.championNames[championId] || `Champion${championId}`;
        
        // Obter preço do bundle
        let price = 0;
        if (bundleItem.price && bundleItem.price.cost) {
            price = this.calculateBundlePrice(bundleItem.price.cost, bundleInfo);
        }

        // Obter nome (usar nome do bundle como base)
        let skinName = "Unknown Skin";
        if (bundleInfo.localizations) {
            const ptBR = bundleInfo.localizations.pt_BR || bundleInfo.localizations.en_US;
            if (ptBR && ptBR.name) {
                // Processar nome do bundle para extrair nome da skin
                skinName = this.processBundleName(ptBR.name, championName);
            }
        }

        const rarity = this.getRarityByPrice(price, bundleInfo);

        return {
            id: skinId,
            name: skinName,
            champion: championName,
            rarity: rarity,
            price: price,
            splash_art: this.getSplashArtUrl(bundleInfo),
            originalItemId: bundleItem.item.itemId,
            isBundle: true,
            category: "BUNDLE"
        };
    }

    extractHextechSkin(item, skinId) {
        const championId = this.getChampionIdFromSkinId(item.itemId);
        const championName = this.championNames[championId] || `Champion${championId}`;
        
        // Preço especial para hextech
        const price = this.priceConfig.categories.HEXTECH.multiplier * 1820;

        let skinName = "Hextech Skin";
        if (item.localizations) {
            const ptBR = item.localizations.pt_BR || item.localizations.en_US;
            if (ptBR && ptBR.name) {
                skinName = ptBR.name;
            }
        }

        return {
            id: skinId,
            name: skinName,
            champion: championName,
            rarity: "Hextech",
            price: Math.round(price),
            splash_art: this.getSplashArtUrl(item),
            originalItemId: item.itemId,
            isHextech: true,
            category: "HEXTECH"
        };
    }

    getChampionIdFromSkinId(skinId) {
        // A maioria das skins seguem o padrão: championId + skinNumber
        // Ex: 103001 = Ahri (103) skin 001
        if (skinId > 1000) {
            return Math.floor(skinId / 1000);
        }
        return skinId;
    }

    calculatePrice(originalPrice, item) {
        let finalPrice = originalPrice;

        // Aplicar preços customizados baseados na categoria
        if (item.inventoryType === "CHAMPION_SKIN") {
            const rarity = this.getRarityByPrice(originalPrice, item);
            if (this.priceConfig.categories.CHAMPION_SKIN[rarity]) {
                finalPrice = this.priceConfig.categories.CHAMPION_SKIN[rarity];
            }
        }

        // Aplicar modificadores especiais
        const skinName = this.getSkinName(item);
        if (skinName.toLowerCase().includes('prestige')) {
            finalPrice *= this.priceConfig.modifiers.prestige;
        }
        if (item.subInventoryType === 'MYTHIC') {
            finalPrice *= this.priceConfig.modifiers.mythic;
        }
        if (skinName.toLowerCase().includes('hextech')) {
            finalPrice *= this.priceConfig.categories.HEXTECH.multiplier;
        }

        return Math.round(finalPrice);
    }

    calculateBundlePrice(originalPrice, bundleInfo) {
        // Aplicar desconto de bundle
        let finalPrice = originalPrice * this.priceConfig.categories.BUNDLES.multiplier;
        return Math.round(finalPrice);
    }

    getRarityByPrice(price, item) {
        // Verificar tipos especiais primeiro
        const skinName = this.getSkinName(item);
        
        if (skinName.toLowerCase().includes('prestige')) return "Prestige";
        if (item.subInventoryType === 'MYTHIC') return "Mythic";
        if (skinName.toLowerCase().includes('hextech')) return "Hextech";

        // Raridade baseada no preço
        if (price >= 3250) return "Ultimate";
        if (price >= 1820) return "Legendary";
        if (price >= 1350) return "Epic";
        if (price >= 975) return "Rare";
        if (price >= 520) return "Common";
        if (price >= 290) return "Chroma";
        return "Special";
    }

    getSkinName(item) {
        if (item.localizations) {
            const ptBR = item.localizations.pt_BR || item.localizations.en_US;
            if (ptBR && ptBR.name) {
                return ptBR.name;
            }
        }
        return "";
    }

    processBundleName(bundleName, championName) {
        // Remover palavras comuns de bundle
        let processed = bundleName
            .replace(/Pacote\s+/gi, '')
            .replace(/Bundle\s+/gi, '')
            .replace(/Croma\s+/gi, '')
            .replace(/Chroma\s+/gi, '');

        // Se não contém o nome do campeão, adicionar
        if (!processed.includes(championName)) {
            processed = `${championName} ${processed}`;
        }

        return processed;
    }

    getSplashArtUrl(item) {
        // Priorizar URL do item
        if (item.iconUrl) {
            return item.iconUrl;
        }

        // Gerar URL baseada no ID
        const championId = this.getChampionIdFromSkinId(item.itemId);
        const skinNum = item.itemId - (championId * 1000);
        const championKey = this.getChampionKeyById(championId);
        
        return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinNum}.jpg`;
    }

    getChampionKeyById(championId) {
        // Mapear alguns IDs para keys (para URLs de splash art)
        const keyMap = {
            103: "Ahri",
            122: "Darius",
            157: "Yasuo",
            81: "Ezreal",
            99: "Lux",
            // Adicionar mais conforme necessário
        };
        return keyMap[championId] || `Champion${championId}`;
    }

    // Método principal para converter arquivo
    async convertFile(inputPath, outputPath, priceConfigPath = 'price-config.json') {
        try {
            // Carregar configuração de preços
            this.loadPriceConfig(priceConfigPath);

            // Ler arquivo da API
            const apiData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
            
            console.log(`📂 Processando ${apiData.length} itens...`);

            // Converter para formato do bot
            const convertedData = this.convertApiToBotFormat(apiData);
            
            // Estatísticas
            const stats = this.generateStats(convertedData);
            
            // Salvar arquivo convertido
            fs.writeFileSync(outputPath, JSON.stringify(convertedData, null, 2));
            
            console.log(`✅ Conversão concluída!`);
            console.log(`📊 Estatísticas:`);
            console.log(`   - Total de skins: ${convertedData.length}`);
            console.log(`   - Por raridade:`);
            Object.entries(stats.rarities).forEach(([rarity, count]) => {
                console.log(`     * ${rarity}: ${count}`);
            });
            console.log(`   - Preço médio: ${stats.averagePrice} RP`);
            console.log(`📁 Arquivo salvo em: ${outputPath}`);
            
            return convertedData;
        } catch (error) {
            console.error('❌ Erro na conversão:', error);
            throw error;
        }
    }

    generateStats(skins) {
        const rarities = {};
        let totalPrice = 0;

        skins.forEach(skin => {
            rarities[skin.rarity] = (rarities[skin.rarity] || 0) + 1;
            totalPrice += skin.price;
        });

        return {
            rarities,
            averagePrice: Math.round(totalPrice / skins.length) || 0,
            totalSkins: skins.length
        };
    }

    // Método para criar configuração de preços padrão
    createDefaultPriceConfig(outputPath = 'price-config.json') {
        this.savePriceConfig(outputPath);
        console.log(`✅ Configuração de preços padrão criada em: ${outputPath}`);
        console.log('💡 Edite este arquivo para personalizar os preços');
    }

    // Método para uso via linha de comando
    async processFromCommand() {
        const args = process.argv.slice(2);
        const command = args[0];

        switch (command) {
            case 'convert':
                const inputFile = args[1] || 'lol-api-catalog.json';
                const outputFile = args[2] || 'catalog.json';
                const priceConfig = args[3] || 'price-config.json';
                await this.convertFile(inputFile, outputFile, priceConfig);
                break;

            case 'create-config':
                const configPath = args[1] || 'price-config.json';
                this.createDefaultPriceConfig(configPath);
                break;

            default:
                console.log(`
Uso: node LoLCatalogConverter.js [comando] [argumentos]

Comandos:
  convert [input] [output] [config]  - Converte catálogo da API
  create-config [path]              - Cria arquivo de configuração de preços

Exemplos:
  node LoLCatalogConverter.js convert api-data.json catalog.json
  node LoLCatalogConverter.js create-config my-prices.json
                `);
        }
    }
}

// Se executado diretamente via linha de comando
if (require.main === module) {
    const converter = new LoLCatalogConverter();
    converter.processFromCommand().catch(console.error);
}

module.exports = LoLCatalogConverter;