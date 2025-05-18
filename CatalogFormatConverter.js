const fs = require('fs');

class CatalogFormatConverter {
    constructor() {
        // Lista completa de campeões para mapear IDs
        this.championNames = {
            1: "Annie", 2: "Olaf", 3: "Galio", 4: "Twisted Fate", 5: "Xin Zhao",
            6: "Urgot", 7: "LeBlanc", 8: "Vladimir", 9: "Fiddlesticks", 10: "Kayle",
            11: "Master Yi", 12: "Alistar", 13: "Ryze", 14: "Sion", 15: "Sivir",
            16: "Soraka", 17: "Teemo", 18: "Tristana", 19: "Warwick", 20: "Nunu & Willump",
            21: "Miss Fortune", 22: "Ashe", 23: "Tryndamere", 24: "Jax", 25: "Morgana",
            26: "Zilean", 27: "Singed", 28: "Evelynn", 29: "Twitch", 30: "Karthus",
            31: "Cho'Gath", 32: "Amumu", 33: "Rammus", 34: "Anivia", 35: "Shaco",
            36: "Dr. Mundo", 37: "Sona", 38: "Kassadin", 39: "Irelia", 40: "Janna",
            41: "Gangplank", 42: "Corki", 43: "Karma", 44: "Taric", 45: "Veigar",
            48: "Trundle", 50: "Swain", 51: "Caitlyn", 53: "Blitzcrank", 54: "Malphite",
            55: "Katarina", 56: "Nocturne", 57: "Maokai", 58: "Renekton", 59: "Jarvan IV",
            60: "Elise", 61: "Orianna", 62: "Wukong", 63: "Brand", 64: "Lee Sin",
            67: "Vayne", 68: "Rumble", 69: "Cassiopeia", 72: "Skarner", 74: "Heimerdinger",
            75: "Nasus", 76: "Nidalee", 77: "Udyr", 78: "Poppy", 79: "Gragas",
            80: "Pantheon", 81: "Ezreal", 82: "Mordekaiser", 83: "Yorick", 84: "Akali",
            85: "Kennen", 86: "Garen", 89: "Leona", 90: "Malzahar", 91: "Talon",
            92: "Riven", 96: "Kog'Maw", 98: "Shen", 99: "Lux", 101: "Xerath",
            102: "Shyvana", 103: "Ahri", 104: "Graves", 105: "Fizz", 106: "Volibear",
            107: "Rengar", 110: "Varus", 111: "Nautilus", 112: "Viktor", 113: "Sejuani",
            114: "Fiora", 115: "Ziggs", 117: "Lulu", 119: "Draven", 120: "Hecarim",
            121: "Kha'Zix", 122: "Darius", 126: "Jayce", 127: "Lissandra", 131: "Diana",
            133: "Quinn", 134: "Syndra", 136: "Aurelion Sol", 141: "Kayn", 142: "Zoe",
            143: "Zyra", 145: "Kai'Sa", 147: "Seraphine", 150: "Gnar", 154: "Zac",
            157: "Yasuo", 161: "Vel'Koz", 163: "Taliyah", 164: "Camille", 166: "Akshan",
            200: "Bel'Veth", 201: "Braum", 202: "Jhin", 203: "Kindred", 221: "Zeri",
            222: "Jinx", 223: "Tahm Kench", 234: "Viego", 235: "Senna", 236: "Lucian",
            238: "Zed", 240: "Kled", 245: "Ekko", 246: "Qiyana", 254: "Vi",
            266: "Aatrox", 267: "Nami", 268: "Azir", 350: "Yuumi", 360: "Samira",
            412: "Thresh", 420: "Illaoi", 421: "Rek'Sai", 427: "Ivern", 429: "Kalista",
            432: "Bard", 516: "Ornn", 517: "Sylas", 518: "Neeko", 523: "Aphelios",
            526: "Rell", 555: "Pyke", 711: "Vex", 777: "Yone", 875: "Sett",
            876: "Lillia", 887: "Gwen", 888: "Renata Glasc", 895: "Nilah", 897: "K'Sante",
            901: "Smolder", 910: "Hwei", 950: "Naafiri", 902: "Milio"
        };
    }

    // Detectar formato atual do catálogo
    detectFormat(data) {
        if (!Array.isArray(data)) {
            return 'UNKNOWN';
        }

        if (data.length === 0) {
            return 'EMPTY';
        }

        const firstItem = data[0];

        // Verificar se já está no formato do bot
        if (firstItem.hasOwnProperty('id') && 
            firstItem.hasOwnProperty('name') && 
            firstItem.hasOwnProperty('champion') && 
            firstItem.hasOwnProperty('rarity') && 
            firstItem.hasOwnProperty('price')) {
            return 'BOT_FORMAT';
        }

        // Verificar se é formato da API do LoL
        if (firstItem.hasOwnProperty('itemId') && 
            firstItem.hasOwnProperty('inventoryType')) {
            return 'LOL_API';
        }

        // Verificar outros formatos possíveis
        if (firstItem.hasOwnProperty('skin_name') || firstItem.hasOwnProperty('skinName')) {
            return 'CUSTOM_FORMAT_1';
        }

        return 'UNKNOWN';
    }

    // Converter qualquer formato para formato do bot
    convertToBotFormat(data) {
        const format = this.detectFormat(data);
        console.log(`📋 Formato detectado: ${format}`);

        switch (format) {
            case 'BOT_FORMAT':
                console.log('✅ Já está no formato correto!');
                return data;

            case 'LOL_API':
                return this.convertFromLolApi(data);

            case 'CUSTOM_FORMAT_1':
                return this.convertFromCustomFormat(data);

            case 'EMPTY':
                console.log('⚠️ Catálogo vazio');
                return [];

            default:
                console.log('❌ Formato não reconhecido, tentando conversão genérica...');
                return this.convertFromGeneric(data);
        }
    }

    // Converter do formato da API do LoL
    convertFromLolApi(data) {
        const convertedSkins = [];
        let skinId = 1;

        data.forEach(item => {
            try {
                if (item.inventoryType === "CHAMPION_SKIN") {
                    const skinData = this.extractSkinFromApi(item, skinId);
                    if (skinData) {
                        convertedSkins.push(skinData);
                        skinId++;
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao processar item API ${item.itemId}: ${error.message}`);
            }
        });

        return convertedSkins;
    }

    // Converter de formato customizado
    convertFromCustomFormat(data) {
        const convertedSkins = [];

        data.forEach((item, index) => {
            try {
                const skinData = {
                    id: index + 1,
                    name: item.skin_name || item.skinName || item.name || "Unknown Skin",
                    champion: item.champion || item.champion_name || this.guessChampionFromName(item.skin_name || item.name),
                    rarity: item.rarity || this.guessRarityFromPrice(item.price || item.cost),
                    price: item.price || item.cost || 975,
                    splash_art: item.splash_art || item.image || item.icon || ""
                };

                convertedSkins.push(skinData);
            } catch (error) {
                console.warn(`⚠️ Erro ao processar item customizado ${index}: ${error.message}`);
            }
        });

        return convertedSkins;
    }

    // Conversão genérica (última tentativa)
    convertFromGeneric(data) {
        const convertedSkins = [];

        data.forEach((item, index) => {
            try {
                // Tentar extrair dados de qualquer estrutura
                const possibleNames = [
                    item.name, item.skin_name, item.skinName, 
                    item.title, item.display_name
                ].filter(Boolean);

                const possiblePrices = [
                    item.price, item.cost, item.rp, item.value
                ].filter(n => typeof n === 'number');

                const possibleChampions = [
                    item.champion, item.champion_name, item.character
                ].filter(Boolean);

                if (possibleNames.length > 0) {
                    const skinData = {
                        id: index + 1,
                        name: possibleNames[0],
                        champion: possibleChampions[0] || this.guessChampionFromName(possibleNames[0]),
                        rarity: item.rarity || this.guessRarityFromPrice(possiblePrices[0] || 975),
                        price: possiblePrices[0] || 975,
                        splash_art: item.splash_art || item.image || item.icon || ""
                    };

                    convertedSkins.push(skinData);
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao processar item genérico ${index}: ${error.message}`);
            }
        });

        return convertedSkins;
    }

    // Extrair skin da API do LoL
    extractSkinFromApi(item, skinId) {
        const championId = Math.floor(item.itemId / 1000);
        const championName = this.championNames[championId] || `Champion${championId}`;

        let price = 975; // Preço padrão
        if (item.prices && item.prices.length > 0) {
            const rpPrice = item.prices.find(p => p.currency === "RP");
            if (rpPrice) price = rpPrice.cost;
        }

        let skinName = "Unknown Skin";
        if (item.localizations && item.localizations.pt_BR) {
            skinName = item.localizations.pt_BR.name;
        }

        return {
            id: skinId,
            name: skinName,
            champion: championName,
            rarity: this.guessRarityFromPrice(price),
            price: price,
            splash_art: item.iconUrl || ""
        };
    }

    // Tentar adivinhar campeão pelo nome da skin
    guessChampionFromName(skinName) {
        if (!skinName) return "Unknown Champion";

        // Lista de nomes de campeões para busca
        const championList = Object.values(this.championNames);
        
        // Procurar nome do campeão na skin
        for (const champion of championList) {
            if (skinName.toLowerCase().includes(champion.toLowerCase())) {
                return champion;
            }
        }

        // Tentar extrair primeira palavra como campeão
        const firstWord = skinName.split(' ')[0];
        const matchedChampion = championList.find(champ => 
            champ.toLowerCase().includes(firstWord.toLowerCase()) ||
            firstWord.toLowerCase().includes(champ.toLowerCase())
        );

        return matchedChampion || "Unknown Champion";
    }

    // Adivinhar raridade pelo preço
    guessRarityFromPrice(price) {
        if (price >= 3250) return "Ultimate";
        if (price >= 1820) return "Legendary";
        if (price >= 1350) return "Epic";
        if (price >= 975) return "Rare";
        if (price >= 520) return "Common";
        return "Chroma";
    }

    // Validar formato do bot
    validateBotFormat(data) {
        if (!Array.isArray(data)) {
            return { valid: false, error: 'Deve ser um array' };
        }

        for (let i = 0; i < data.length; i++) {
            const skin = data[i];
            const required = ['id', 'name', 'champion', 'rarity', 'price'];

            for (const field of required) {
                if (!skin.hasOwnProperty(field)) {
                    return { valid: false, error: `Item ${i + 1}: Campo '${field}' faltando` };
                }
            }
        }

        return { valid: true };
    }

    // Método principal
    async convertFile(inputPath, outputPath) {
        try {
            console.log(`📂 Lendo arquivo: ${inputPath}`);

            // Ler arquivo atual
            const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
            
            // Converter para formato do bot
            const convertedData = this.convertToBotFormat(rawData);

            // Validar resultado
            const validation = this.validateBotFormat(convertedData);
            if (!validation.valid) {
                throw new Error(`Validação falhou: ${validation.error}`);
            }

            // Fazer backup do arquivo original
            const backupPath = `${inputPath}.backup.${Date.now()}.json`;
            fs.copyFileSync(inputPath, backupPath);
            console.log(`📋 Backup criado: ${backupPath}`);

            // Salvar arquivo convertido
            fs.writeFileSync(outputPath, JSON.stringify(convertedData, null, 2));

            // Mostrar estatísticas
            console.log(`✅ Conversão concluída!`);
            console.log(`📊 Estatísticas:`);
            console.log(`   - Total de skins: ${convertedData.length}`);
            console.log(`   - Arquivo salvo: ${outputPath}`);

            const rarities = {};
            convertedData.forEach(skin => {
                rarities[skin.rarity] = (rarities[skin.rarity] || 0) + 1;
            });

            console.log(`   - Por raridade:`);
            Object.entries(rarities).forEach(([rarity, count]) => {
                console.log(`     * ${rarity}: ${count}`);
            });

            return convertedData;

        } catch (error) {
            console.error(`❌ Erro na conversão: ${error.message}`);
            throw error;
        }
    }

    // Método para uso via linha de comando
    async processFromCommand() {
        const args = process.argv.slice(2);
        
        if (args.length === 0) {
            console.log(`
🎮 Conversor de Catálogo LoL para Formato do Bot

Uso: node CatalogFormatConverter.js [arquivo-entrada] [arquivo-saida]

Exemplos:
  node CatalogFormatConverter.js catalog.json catalog-convertido.json
  node CatalogFormatConverter.js meu-catalogo.json catalog.json

O script detecta automaticamente o formato e converte para o formato do bot.
            `);
            return;
        }

        const inputFile = args[0];
        const outputFile = args[1] || 'catalog-convertido.json';

        if (!fs.existsSync(inputFile)) {
            console.error(`❌ Arquivo não encontrado: ${inputFile}`);
            return;
        }

        await this.convertFile(inputFile, outputFile);
    }
}

// Se executado diretamente
if (require.main === module) {
    const converter = new CatalogFormatConverter();
    converter.processFromCommand().catch(console.error);
}

module.exports = CatalogFormatConverter;