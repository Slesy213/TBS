const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const {
    isFeatureEnabled,
    increaseThreat,
    isWhitelisted,
    getSetting
} = require("../guard.js");

global.selfCorrectTimeouts = global.selfCorrectTimeouts || new Map();

module.exports = (client) => {
    // Unified Link Checker Function (40 Features)
    function evaluateLinkContent(message) {
        const guildId = message.guild.id;
        const content = message.content || "";
        
        // Match link pattern
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
        const urls = content.match(urlRegex) || [];

        // Feature 20: linkBlockRichEmbedUrls
        if (isFeatureEnabled(guildId, "linkBlockRichEmbedUrls") && message.embeds && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (embed.url) urls.push(embed.url);
                if (embed.description && embed.description.match(urlRegex)) {
                    urls.push(...embed.description.match(urlRegex));
                }
            }
        }

        if (urls.length === 0) return null;

        // Exemptions (Features 33-34)
        if (message.member) {
            if (isFeatureEnabled(guildId, "linkScanRoleWhitelist")) {
                if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return null;
                }
            }
        }

        if (isFeatureEnabled(guildId, "linkScanChannelWhitelist")) {
            const chName = message.channel.name.toLowerCase();
            const whitelistChannels = ["media", "galeri", "foto", "video", "log", "bot", "link", "paylaşım"];
            if (whitelistChannels.some(ch => chName.includes(ch))) {
                return null;
            }
        }

        for (let url of urls) {
            let domain = "";
            try {
                const urlObj = new URL(url.startsWith("http") ? url : "http://" + url);
                domain = urlObj.hostname.toLowerCase();
            } catch (e) {
                domain = url.replace(/(https?:\/\/)?(www\.)?/, "").split("/")[0].toLowerCase();
            }

            // 1. Allowlist / Whitelist Checks (Features 21 to 27)
            if (isFeatureEnabled(guildId, "linkAllowDiscordOfficial")) {
                if (domain === "discord.com" || domain === "discord.gg" || domain === "discordapp.com" || domain.endsWith(".discord.com") || domain === "discord.media" || domain === "discord.status") {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowYoutubeOfficial")) {
                if (domain === "youtube.com" || domain === "youtu.be" || domain.endsWith(".youtube.com")) {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowSpotifyOfficial")) {
                if (domain === "spotify.com" || domain.endsWith(".spotify.com")) {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowGithubOfficial")) {
                if (domain === "github.com" || domain.endsWith(".github.com") || domain === "github.io") {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowGoogleOfficial")) {
                if (domain === "google.com" || domain.endsWith(".google.com") || domain === "google.co.tr") {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowImagesOnly")) {
                const cleanUrl = url.split("?")[0].toLowerCase();
                if (cleanUrl.endsWith(".png") || cleanUrl.endsWith(".jpg") || cleanUrl.endsWith(".jpeg") || cleanUrl.endsWith(".gif") || cleanUrl.endsWith(".webp")) {
                    continue;
                }
            }
            if (isFeatureEnabled(guildId, "linkAllowCustomWhitelist")) {
                const whitelistedDomains = ["microsoft.com", "github.com", "gitlab.com", "stackoverflow.com", "wikipedia.org"];
                if (whitelistedDomains.some(d => domain === d || domain.endsWith("." + d))) {
                    continue;
                }
            }

            // 2. Blocklist & Category Checks (Features 1 to 19)
            if (isFeatureEnabled(guildId, "linkBlockAll")) {
                return { url, reason: "Genel Link Engeli", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "linkBlockInvites")) {
                if (url.match(/(discord\.gg|discord\.com\/invite|discordapp\.com\/invite)/gi)) {
                    return { url, reason: "Davet Kodu Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockHttpsOnly") && url.startsWith("https://")) {
                return { url, reason: "Https Bağlantı Engeli", severity: "low" };
            }
            if (isFeatureEnabled(guildId, "linkBlockHttpOnly") && (url.startsWith("http://") || !url.startsWith("https://"))) {
                return { url, reason: "Http Bağlantı Engeli", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "linkBlockIPLinks")) {
                const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
                if (ipRegex.test(domain)) {
                    return { url, reason: "IP Adresi Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockSubdomains")) {
                const parts = domain.split(".");
                if (parts.length > 2 && parts[0] !== "www") {
                    return { url, reason: "Alt Alan Adı Engeli", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockShorteners")) {
                const shorteners = ["bit.ly", "tinyurl.com", "t.co", "rebrand.ly", "is.gd", "buff.ly", "adf.ly"];
                if (shorteners.some(s => domain === s || domain.endsWith("." + s))) {
                    return { url, reason: "Kısaltıcı Servis Engeli", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockPhishing")) {
                const phishingKeywords = ["discord-gift", "free-nitro", "steamcommunity.ru", "gift-nitro", "steampromotion"];
                if (phishingKeywords.some(kw => domain.includes(kw))) {
                    return { url, reason: "Phishing (Oltalama) Engeli", severity: "critical" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockIpLoggers")) {
                if (domain.includes("grabify") || domain.includes("iplogger") || domain.includes("leaky") || domain.includes("leak")) {
                    return { url, reason: "IP Logger Koruması", severity: "critical" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockAdultContent")) {
                const adultKeywords = ["porn", "nsfw", "xvideo", "sex", "adult"];
                if (adultKeywords.some(kw => domain.includes(kw))) {
                    return { url, reason: "Yetişkin İçerik Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockDownloads")) {
                const cleanUrl = url.split("?")[0].toLowerCase();
                if (cleanUrl.endsWith(".exe") || cleanUrl.endsWith(".scr") || cleanUrl.endsWith(".bat") || cleanUrl.endsWith(".cmd") || cleanUrl.endsWith(".msi") || cleanUrl.endsWith(".apk") || cleanUrl.endsWith(".zip") || cleanUrl.endsWith(".rar")) {
                    return { url, reason: "Dosya İndirme Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockMalware")) {
                const malwareKeywords = ["malware", "virus", "exploit", "trojan"];
                if (malwareKeywords.some(kw => domain.includes(kw))) {
                    return { url, reason: "Zararlı Yazılım Engeli", severity: "critical" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockSocialMedia")) {
                const socialMedia = ["tiktok.com", "instagram.com", "twitter.com", "x.com", "facebook.com"];
                if (socialMedia.some(sm => domain === sm || domain.endsWith("." + sm))) {
                    return { url, reason: "Sosyal Medya Engeli", severity: "low" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockVideoSites")) {
                const videoSites = ["youtube.com", "youtu.be", "vimeo.com", "twitch.tv"];
                if (videoSites.some(vs => domain === vs || domain.endsWith("." + vs))) {
                    return { url, reason: "Video Siteleri Engeli", severity: "low" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockCryptocurrency")) {
                const cryptoKeywords = ["crypto", "bitcoin", "ethereum", "binance", "coinbase", "solana"];
                if (cryptoKeywords.some(kw => domain.includes(kw))) {
                    return { url, reason: "Kripto Siteleri Engeli", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockFileSharing")) {
                const fileSharing = ["mega.nz", "mediafire.com", "dropbox.com", "drive.google.com"];
                if (fileSharing.some(fs => domain === fs || domain.endsWith("." + fs))) {
                    return { url, reason: "Dosya Paylaşım Engeli", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockCustomBlacklist")) {
                const blacklistedDomains = ["zararli-site.com", "hacker-forum.org"];
                if (blacklistedDomains.some(d => domain === d || domain.endsWith("." + d))) {
                    return { url, reason: "Özel Blacklist Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockBypassPatterns")) {
                const spacedDomainRegex = /[a-z0-9]+\s+\.\s+[a-z]{2,}/i;
                const hasCyrillic = /[а-яА-Я]/.test(url);
                if (hasCyrillic || spacedDomainRegex.test(content)) {
                    return { url, reason: "Homoglif/Bypass Engeli", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkBlockNonStandardTLDs")) {
                const suspiciousTLDs = [".xyz", ".club", ".top", ".free", ".gq", ".tk", ".ml", ".cf", ".ga"];
                if (suspiciousTLDs.some(tld => domain.endsWith(tld))) {
                    return { url, reason: "Ucuz/Şüpheli TLD Engeli", severity: "medium" };
                }
            }

            // 3. Scan & Format Checks (Features 28 to 32)
            if (isFeatureEnabled(guildId, "linkScanLengthLimit") && url.length > 100) {
                return { url, reason: "Karakter Sınırı Engeli", severity: "low" };
            }
            if (isFeatureEnabled(guildId, "linkScanCapsRatio")) {
                const letters = url.replace(/[^A-Za-z]/g, "");
                const caps = url.replace(/[^A-Z]/g, "");
                if (letters.length > 10 && (caps.length / letters.length) > 0.5) {
                    return { url, reason: "Rastgelelik (Caps) Oranı", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkScanContentMinimizer")) {
                const shorteners = ["bit.ly", "tinyurl.com", "t.co"];
                if (shorteners.some(s => domain === s)) {
                    return { url, reason: "Kısaltılmış Link Analizi", severity: "medium" };
                }
            }
            if (isFeatureEnabled(guildId, "linkScanRedirectLimit")) {
                if (url.replace("://", "").includes("//")) {
                    return { url, reason: "Yönlendirme Sınırı", severity: "high" };
                }
            }
            if (isFeatureEnabled(guildId, "linkScanStatusChecks")) {
                if (domain.startsWith("fake-") || domain.includes("offline")) {
                    return { url, reason: "Link Durum Kontrolü", severity: "medium" };
                }
            }
        }
        return null;
    }

    // Unified Swear Checker Function (40 Features)
    function evaluateSwearContent(message) {
        const guildId = message.guild.id;
        let content = message.content || "";
        
        // Feature 20: kufurBlockRichEmbedTexts
        if (isFeatureEnabled(guildId, "kufurBlockRichEmbedTexts") && message.embeds && message.embeds.length > 0) {
            for (const embed of message.embeds) {
                if (embed.title) content += " " + embed.title;
                if (embed.description) content += " " + embed.description;
                if (embed.fields) {
                    for (const field of embed.fields) {
                        content += " " + field.name + " " + field.value;
                    }
                }
                if (embed.footer && embed.footer.text) content += " " + embed.footer.text;
                if (embed.author && embed.author.name) content += " " + embed.author.name;
            }
        }

        if (!content.trim() && message.attachments?.size === 0) return null;

        // Feature 33: kufurScanSpoilers
        if (!isFeatureEnabled(guildId, "kufurScanSpoilers")) {
            content = content.replace(/\|\|.*?\|\|/gs, "");
        } else {
            content = content.replace(/\|\|/g, " ");
        }

        // Feature 34: kufurScanAttachments
        if (isFeatureEnabled(guildId, "kufurScanAttachments") && message.attachments && message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
                if (attachment.name) {
                    content += " " + attachment.name;
                }
            }
        }

        // Exemptions: Staff and Roles
        if (message.member) {
            if (isFeatureEnabled(guildId, "kufurAllowStaff")) {
                if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) || message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return null;
                }
            }
            if (isFeatureEnabled(guildId, "kufurAllowRoleWhitelist")) {
                if (isWhitelisted(message.guild, message.author.id, "chat")) {
                    return null;
                }
            }
        }

        // Feature 21: kufurAllowWhitelistedChannels
        if (isFeatureEnabled(guildId, "kufurAllowWhitelistedChannels")) {
            const chName = message.channel.name.toLowerCase();
            const whitelistChannels = ["küfür", "kufur", "serbest", "chat-serbest", "gırgır", "nargile", "meyhane"];
            if (whitelistChannels.some(ch => chName.includes(ch))) {
                return null;
            }
        }

        // Feature 24: kufurAllowQuotes
        if (isFeatureEnabled(guildId, "kufurAllowQuotes")) {
            content = content.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, "");
            content = content.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "");
            content = content.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, "");
        }

        // Feature 31: kufurScanZalgo
        if (isFeatureEnabled(guildId, "kufurScanZalgo")) {
            content = content.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }

        // Feature 16: kufurBlockHomoglyphs
        if (isFeatureEnabled(guildId, "kufurBlockHomoglyphs") || isFeatureEnabled(guildId, "kufurBlockAll")) {
            const cyrillicMap = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ж': 'zh', 'з': 'z',
                'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
                'р': 'r', 'с': 'c', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch',
                'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
                'ѕ': 's', 'і': 'i', 'ј': 'j', 'һ': 'h', 'ҽ': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y'
            };
            content = content.split('').map(char => cyrillicMap[char] || char).join('');
        }

        const threatVal = global.guildThreatLevels.get(guildId) || 0;
        const autonomousBypass = isFeatureEnabled(guildId, "kufurAllowAutonomousBypass") && threatVal === 0;

        const sexualWords = ["sik", "sikik", "sikiş", "sikis", "sok", "amcık", "amcik", "göt", "got", "yarak", "yarrak", "taşşak", "tassak", "orospu", "fahişe", "fahise", "kaltak", "kavat", "gavat", "pipi", "meme", "daşşak", "dassak", "sokam", "sokayım", "sokayim", "sikeyim", "siktir", "siktirgit", "sokuk", "götveren", "gotveren", "götlek", "gotlek", "amına", "amina", "amk", "aq", "sg", "oç", "oc", "piç", "pic"];
        const familyWords = ["ananı", "anani", "avradını", "avradini", "sülaleni", "sulaleni", "babanı", "babani", "bacını", "bacini", "kardeşini", "kardesini", "valideni", "sülalesini", "sulalesini", "anasını", "anasini", "annesini", "babasını", "babasini", "teyzeni", "halanı", "halani", "orospuçocuğu", "orospucocugu", "orospuevladı", "orospuevladi", "piçkurusu", "pickurusu"];
        const religiousWords = ["allahını", "allahini", "kitabını", "kitabini", "dinini", "imanını", "imanini", "ilahını", "ilahini", "peygamberini", "peygamberini", "kuranını", "kuranini", "cennetini", "cehennemini", "allahsız", "allahsiz", "imansız", "imansiz", "dinsiz"];
        const racistWords = ["zenci", "nigga", "nigger", "kürdo", "kurdo", "çingene", "cingene", "yosma"];
        const politicalWords = ["aktroll", "oktroll", "liboş", "libos", "comar", "çomar", "vatanhaini", "terörist", "terorist", "yandaş", "yandas", "foncu"];
        const homophobicWords = ["ibne", "top", "gay", "lezbiyen", "travesti", "oğlancı", "oglanci", "godoş", "godos"];
        const argoWords = ["lan", "salak", "aptal", "gerizekalı", "gerizekali", "şerefsiz", "serefsiz", "pislik", "yavşak", "yavsak", "dangalak", "kerata", "hödük", "hoduk", "hırbo", "hirbo", "manyak", "enayi"];
        const abbreviationWords = ["amk", "aq", "oç", "oc", "piç", "pic", "sg", "yro"];
        const foreignWords = ["fuck", "bitch", "shit", "ass", "cunt", "motherfucker", "bastard", "dick", "pussy", "whore", "slut"];
        const threatWords = ["öl", "gebert", "öldür", "intihar", "kendinias", "seniöldürürüm", "senioldururum", "katil"];

        const customBlacklist = ["yasaklıkelime1", "yasakliword"];
        const customWhitelist = ["karpuz", "bacak", "sıkıcı", "sıkıntı", "sıkılmak", "kürdan", "durum", "ramazan", "samet", "kapı"];

        let matchedViolation = null;
        const cleanText = content.toLowerCase();
        const wordsArray = cleanText.split(/[\s.,\-_!?\/\\#@$%^&*()[\]{}|:;'"<>`~+=\u200b\u200c\u200d\xa0]+/);

        const filteredWords = wordsArray.filter(w => {
            if (isFeatureEnabled(guildId, "kufurAllowCustomWhitelist")) {
                return !customWhitelist.includes(w);
            }
            return true;
        });

        const noSpacesText = cleanText.replace(/\s+/g, "");
        const noPunctText = cleanText.replace(/[^a-z0-9ğüşıöç]/g, "");

        function checkWordViolation(w) {
            if (!w || w.length < 2) return null;

            if (isFeatureEnabled(guildId, "kufurBlockCustomBlacklist") && customBlacklist.includes(w)) {
                return { reason: "Özel Kara Liste", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockSexual") && sexualWords.includes(w)) {
                return { reason: "Cinsel İçerikli Küfür", severity: "high" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockFamily") && familyWords.some(fw => w.includes(fw) || fw.includes(w))) {
                return { reason: "Ailevi Hakaret", severity: "critical" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockReligious") && religiousWords.some(rw => w.includes(rw) || rw.includes(w))) {
                return { reason: "Dini Değerlere Hakaret", severity: "critical" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockRacist") && racistWords.includes(w)) {
                return { reason: "Irkçı Hakaret / Nefret Söylemi", severity: "critical" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockHomophobic") && homophobicWords.includes(w)) {
                return { reason: "Homofobik / Cinsiyetçi Hakaret", severity: "high" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockAbbreviations") && abbreviationWords.includes(w)) {
                return { reason: "Kısaltılmış Küfür", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockForeign") && foreignWords.includes(w)) {
                return { reason: "Yabancı Dil Küfür", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockThreats") && threatWords.some(tw => w.includes(tw))) {
                return { reason: "Şiddet / Tehdit / Kendine Zarar", severity: "high" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockPolitical") && !autonomousBypass && politicalWords.includes(w)) {
                return { reason: "Siyasi Taciz / Hakaret", severity: "medium" };
            }
            if (isFeatureEnabled(guildId, "kufurBlockArgo") && !autonomousBypass && argoWords.includes(w)) {
                return { reason: "Argo / Kaba Sözcük", severity: "low" };
            }
            return null;
        }

        function getLevenshteinDistance(a, b) {
            if (a.length === 0) return b.length;
            if (b.length === 0) return a.length;
            const matrix = [];
            for (let i = 0; i <= b.length; i++) matrix[i] = [i];
            for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= b.length; i++) {
                for (let j = 1; j <= a.length; j++) {
                    if (b.charAt(i - 1) === a.charAt(j - 1)) {
                        matrix[i][j] = matrix[i - 1][j - 1];
                    } else {
                        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                    }
                }
            }
            return matrix[b.length][a.length];
        }

        for (const w of filteredWords) {
            matchedViolation = checkWordViolation(w);
            if (matchedViolation) break;

            if (isFeatureEnabled(guildId, "kufurScanLevensthein") && w.length >= 4) {
                const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords];
                for (const swear of allSwears) {
                    if (swear.length >= 4 && Math.abs(w.length - swear.length) <= 1) {
                        const dist = getLevenshteinDistance(w, swear);
                        if (dist === 1) {
                            matchedViolation = { reason: `Yakın Karakter (Levenshtein: ${swear})`, severity: "medium" };
                            break;
                        }
                    }
                }
                if (matchedViolation) break;
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurBlockSpaced")) {
            const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords];
            for (const swear of allSwears) {
                if (noSpacesText.includes(swear) && !customWhitelist.includes(noSpacesText)) {
                    matchedViolation = { reason: "Boşluklu Küfür Yazımı", severity: "high" };
                    break;
                }
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurBlockPhonetic")) {
            const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords];
            for (const swear of allSwears) {
                if (noPunctText.includes(swear) && !customWhitelist.includes(noPunctText)) {
                    matchedViolation = { reason: "Fonetik / Noktalama Küfür Bypası", severity: "high" };
                    break;
                }
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurScanRegexBypass")) {
            const regexBypasses = [
                /\bs\s*[iı01]\s*[k]\b/i,
                /\ba\s*[m]\s*[k]\b/i,
                /\bo\s*[cç]\b/i,
                /\bp\s*[iı1]\s*[cç]\b/i,
                /\ba\s*[q]\b/i,
                /\bs\s*[g]\b/i,
                /\bs\s*i\s*k\s*t\s*i\s*r\b/i
            ];
            for (const reg of regexBypasses) {
                if (reg.test(content)) {
                    matchedViolation = { reason: "Regex Bypass Filtresi", severity: "high" };
                    break;
                }
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurScanCapsInsult")) {
            const upperCount = content.replace(/[^A-ZĞÜŞİÖÇ]/g, "").length;
            if (content.length > 3 && (upperCount / content.length) > 0.6) {
                for (const w of filteredWords) {
                    if (argoWords.includes(w) || abbreviationWords.includes(w)) {
                        matchedViolation = { reason: "Büyük Harfli Küfür / Bağırma", severity: "high" };
                        break;
                    }
                }
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurScanLengthRatio") && content.length > 5) {
            let swearChars = 0;
            const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords, ...argoWords];
            for (const w of filteredWords) {
                if (allSwears.includes(w)) {
                    swearChars += w.length;
                }
            }
            if ((swearChars / content.length) > 0.5) {
                matchedViolation = { reason: "Aşırı Küfür Yoğunluğu (Yoğunluk > %50)", severity: "high" };
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurBlockEmojis") && message.content) {
            const emojiNameRegex = /<a?:([a-zA-Z0-9_]+):\d+>/g;
            let match;
            const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords];
            while ((match = emojiNameRegex.exec(message.content)) !== null) {
                const emojiName = match[1].toLowerCase();
                if (allSwears.some(swear => emojiName.includes(swear))) {
                    matchedViolation = { reason: `Uygunsuz Emoji İsmi: ${match[1]}`, severity: "medium" };
                    break;
                }
            }
        }

        if (!matchedViolation && isFeatureEnabled(guildId, "kufurBlockAdmins")) {
            const hasStaffMention = message.mentions?.members && message.mentions.members.some(m => m.permissions.has(PermissionFlagsBits.ManageMessages) || m.permissions.has(PermissionFlagsBits.Administrator));
            if (hasStaffMention) {
                const allSwears = [...sexualWords, ...familyWords, ...religiousWords, ...racistWords, ...homophobicWords, ...abbreviationWords, ...foreignWords, ...argoWords];
                if (filteredWords.some(w => allSwears.includes(w))) {
                    matchedViolation = { reason: "Yetkiliye Yönelik Hakaret", severity: "high" };
                }
            }
        }

        if (matchedViolation && (isFeatureEnabled(guildId, "kufurBlockAll") || isFeatureEnabled(guildId, "kufurEngel"))) {
            return matchedViolation;
        }

        return null;
    }

    // Sohbet Filtreleri ve İletiler
    client.on("messageCreate", async message => {
        if (!message.guild) return;
        const guildId = message.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        // Feature 7: webhookTokenLeakGuard (Scans all messages)
        const webhookTokenRegex = /https:\/\/discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9\-_]+)/gi;
        const match = webhookTokenRegex.exec(message.content || "");
        if (match && isFeatureEnabled(guildId, "webhookTokenLeakGuard")) {
            const webhookId = match[1];
            const webhookToken = match[2];

            await message.delete().catch(() => {});

            const targetWebhook = await client.fetchWebhook(webhookId, webhookToken).catch(() => null);
            if (targetWebhook) {
                await targetWebhook.delete("Token Leak Protection").catch(() => {});
            }

            if (message.member && !isWhitelisted(message.guild, message.author.id, "limitBypass")) {
                increaseThreat(guildId, 30, `Webhook Token sızıntısı: ${message.author.tag}`, message.guild);
                await message.member.timeout(3600000, "Guard | Webhook Token Sızıntısı").catch(() => {});
                await message.channel.send({ content: `🚨 ${message.author}, **Webhook Token sızıntısı** tespit edildi! Webhook iptal edildi ve üyeye geçici susturma uygulandı.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 10000);
                });
            }
            return;
        }

        // Webhook Specific Protections
        if (message.webhookId) {
            // Feature 15: webhookAutonomousLock
            const threatVal = global.guildThreatLevels.get(guildId) || 0;
            if (isFeatureEnabled(guildId, "webhookAutonomousLock") && (threatVal > 50 || getSetting(guildId, "autonomousMode"))) {
                await message.delete().catch(() => {});
                const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                const targetWh = webhooks?.get(message.webhookId);
                if (targetWh) await targetWh.delete("Otonom Kilit Aktif").catch(() => {});
                return;
            }

            // Feature 10: webhookWhitelistOnly
            global.webhookWhitelistCache = global.webhookWhitelistCache || new Map();
            let isWlWebhook = global.webhookWhitelistCache.get(message.webhookId);
            if (isWlWebhook === undefined) {
                const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                const webhookObj = webhooks?.get(message.webhookId);
                if (webhookObj && webhookObj.owner) {
                    const ownerId = webhookObj.owner.id;
                    isWlWebhook = isWhitelisted(message.guild, ownerId, "channel");
                    global.webhookWhitelistCache.set(message.webhookId, isWlWebhook);
                } else {
                    isWlWebhook = false;
                }
            }

            if (isFeatureEnabled(guildId, "webhookWhitelistOnly") && isWlWebhook === false) {
                await message.delete().catch(() => {});
                const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                const targetWh = webhooks?.get(message.webhookId);
                if (targetWh) await targetWh.delete("Güvenli Liste Dışı Webhook").catch(() => {});
                return;
            }

            // Feature 6: webhookSpamEngel
            global.webhookMessageTracker = global.webhookMessageTracker || new Map();
            const trackerKey = `${guildId}:${message.webhookId}`;
            let timestamps = global.webhookMessageTracker.get(trackerKey) || [];
            const now = Date.now();
            timestamps = timestamps.filter(t => now - t < 3000);
            timestamps.push(now);
            global.webhookMessageTracker.set(trackerKey, timestamps);

            if (isFeatureEnabled(guildId, "webhookSpamEngel") && timestamps.length > 5) {
                await message.delete().catch(() => {});
                increaseThreat(guildId, 15, `Webhook spam engeli tetiklendi ID: ${message.webhookId}`, message.guild);
                if (timestamps.length > 8) {
                    const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                    const targetWh = webhooks?.get(message.webhookId);
                    if (targetWh) {
                        await targetWh.delete("Webhook spam engeli").catch(() => {});
                    }
                }
                return;
            }

            // Feature 11: webhookImpersonationGuard
            if (isFeatureEnabled(guildId, "webhookImpersonationGuard")) {
                const webName = message.author.username.toLowerCase();
                const impersonationPatterns = ["slesy", "guard", "admin", "owner", "mod", "kurucu", "bot", "tbs"];
                const admins = message.guild.members.cache.filter(m => m.permissions.has(PermissionFlagsBits.Administrator) && !m.user.bot);
                const matchesAdmin = admins.some(a => 
                    a.user.username.toLowerCase() === webName || 
                    (a.nickname && a.nickname.toLowerCase() === webName)
                );

                if (impersonationPatterns.some(p => webName.includes(p)) || matchesAdmin) {
                    await message.delete().catch(() => {});
                    const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                    const targetWh = webhooks?.get(message.webhookId);
                    if (targetWh) await targetWh.delete("İmmitasyon/Taklit Engeli").catch(() => {});
                    increaseThreat(guildId, 20, `Webhook Taklit Engeli: ${message.author.username}`, message.guild);
                    return;
                }
            }

            // Feature 8: webhookNameFilter
            if (isFeatureEnabled(guildId, "webhookNameFilter")) {
                const webName = message.author.username.toLowerCase();
                const badWords = ["amk", "oç", "oc", "piç", "pic", "siktir", "sik", "discord.gg", "http", "www."];
                if (badWords.some(w => webName.includes(w))) {
                    await message.delete().catch(() => {});
                    const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                    const targetWh = webhooks?.get(message.webhookId);
                    if (targetWh) await targetWh.delete("Zararlı Webhook İsmi").catch(() => {});
                    return;
                }
            }

            // Feature 21: webhookThreadPostGuard
            if (isFeatureEnabled(guildId, "webhookThreadPostGuard") && message.channel.isThread()) {
                await message.delete().catch(() => {});
                return;
            }

            // Webhook Link Protection utilizing the unified Link Protection Suite
            if (isFeatureEnabled(guildId, "webhookLinkEngel") || isFeatureEnabled(guildId, "linkBlockAll")) {
                const violation = evaluateLinkContent(message);
                if (violation) {
                    await message.delete().catch(() => {});
                    increaseThreat(guildId, 10, `Webhook Link İhlali: ${violation.reason}`, message.guild);
                    if (violation.severity === "critical") {
                        const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                        const targetWh = webhooks?.get(message.webhookId);
                        if (targetWh) await targetWh.delete(`Zararlı Webhook Linki: ${violation.reason}`).catch(() => {});
                    }
                    return;
                }
            }

            // Webhook Swear Protection utilizing the unified Swear Protection Suite
            if (isFeatureEnabled(guildId, "webhookKufurEngel") || isFeatureEnabled(guildId, "kufurBlockAll")) {
                const swearViolation = evaluateSwearContent(message);
                if (swearViolation) {
                    await message.delete().catch(() => {});
                    increaseThreat(guildId, swearViolation.severity === "critical" ? 25 : 8, `Webhook Küfür İhlali: ${swearViolation.reason}`, message.guild);
                    if (swearViolation.severity === "critical") {
                        const webhooks = await message.channel.fetchWebhooks().catch(() => null);
                        const targetWh = webhooks?.get(message.webhookId);
                        if (targetWh) await targetWh.delete(`Kritik Webhook Küfrü: ${swearViolation.reason}`).catch(() => {});
                    }
                    return;
                }
            }

            let shouldDeleteWebhookMsg = false;
            let webhookReason = "";

            // Feature 14: webhookEveryoneEngel
            if (isFeatureEnabled(guildId, "webhookEveryoneEngel") && (message.content.includes("@everyone") || message.content.includes("@here"))) {
                shouldDeleteWebhookMsg = true;
                webhookReason = "Webhook Everyone/Here Etiketi";
            }

            // Feature 22: webhookRoleMentionGuard
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookRoleMentionGuard") && message.mentions.roles.size > 0) {
                const hasAdminRolePing = message.mentions.roles.some(r => r.permissions.has(PermissionFlagsBits.Administrator) || r.permissions.has(PermissionFlagsBits.ManageGuild));
                if (hasAdminRolePing) {
                    shouldDeleteWebhookMsg = true;
                    webhookReason = "Yetkili Rol Etiketleme";
                }
            }

            // Feature 18: webhookAttachmentGuard
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookAttachmentGuard") && message.attachments.size > 0) {
                const dangerousExtensions = [".exe", ".scr", ".bat", ".cmd", ".jar", ".zip", ".rar", ".msi"];
                const hasDangerousFile = message.attachments.some(a => 
                    dangerousExtensions.some(ext => a.name.toLowerCase().endsWith(ext))
                );
                if (hasDangerousFile || message.attachments.size > 3) {
                    shouldDeleteWebhookMsg = true;
                    webhookReason = "Zararlı/Aşırı Ek Koruması";
                }
            }

            // Feature 19: webhookContentLengthLimit
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookContentLengthLimit")) {
                const newlineCount = (message.content.match(/\n/g) || []).length;
                if (message.content.length > 1500 || newlineCount > 10) {
                    shouldDeleteWebhookMsg = true;
                    webhookReason = "Karakter/Satır Sınırı";
                }
            }

            // Feature 20: webhookEmbedSpamGuard
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookEmbedSpamGuard") && message.embeds.length > 2) {
                shouldDeleteWebhookMsg = true;
                webhookReason = "Embed Spam Engeli";
            }

            if (shouldDeleteWebhookMsg) {
                await message.delete().catch(() => {});
                increaseThreat(guildId, 5, webhookReason, message.guild);
            }
            return;
        }

        // Original User-Chat Protections
        if (message.author.bot) return;
        if (isWhitelisted(message.guild, message.author.id, "chat")) return;

        // 40 Features Link Protection execution for normal messages
        const linkViolation = evaluateLinkContent(message);
        if (linkViolation) {
            let actionDelete = isFeatureEnabled(guildId, "linkActionDelete");
            let actionWarn = isFeatureEnabled(guildId, "linkActionWarn");
            let actionTimeout = isFeatureEnabled(guildId, "linkActionTimeout");
            let actionKick = isFeatureEnabled(guildId, "linkActionKick");
            let actionBan = isFeatureEnabled(guildId, "linkActionBan");
            let actionLog = isFeatureEnabled(guildId, "linkActionStaffLog");

            if (linkViolation.severity === "critical") {
                actionDelete = true;
                actionBan = true;
                actionLog = true;
            }

            if (actionDelete) {
                await message.delete().catch(() => {});
            }

            if (actionWarn) {
                await message.channel.send({ content: `⚠️ ${message.author}, gönderdiğiniz bağlantı engellendi! Sebep: **${linkViolation.reason}**` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
            }

            increaseThreat(guildId, linkViolation.severity === "critical" ? 30 : (linkViolation.severity === "high" ? 15 : 8), linkViolation.reason, message.guild);

            if (actionBan && message.member) {
                await message.member.ban({ reason: `Guard | ${linkViolation.reason}` }).catch(() => {});
            } else if (actionKick && message.member) {
                await message.member.kick(`Guard | ${linkViolation.reason}`).catch(() => {});
            } else if (actionTimeout && message.member) {
                await message.member.timeout(300000, `Guard | ${linkViolation.reason}`).catch(() => {});
            }

            if (actionLog) {
                const logChId = getSetting(guildId, "logChannelId");
                if (logChId) {
                    const logCh = message.guild.channels.cache.get(logChId);
                    if (logCh) {
                        const embed = new EmbedBuilder()
                            .setColor(0xFF0000)
                            .setTitle("🚨 Bağlantı Koruması İhlali")
                            .setDescription(`
**Kullanıcı**   :: ${message.author} (\`${message.author.id}\`)
**Kanal**       :: ${message.channel}
**Sebep**       :: \`${linkViolation.reason}\`
**Bağlantı**    :: \`${linkViolation.url}\`
**Tehdit Derecesi**:: \`${linkViolation.severity.toUpperCase()}\`
**Uygulanan Ceza**:: \`${actionBan ? "Yasaklama" : (actionKick ? "Atılma" : (actionTimeout ? "Mute (5 Dk)" : "Mesaj Silme"))}\`
                            `)
                            .setTimestamp();
                        await logCh.send({ embeds: [embed] }).catch(() => {});
                    }
                }
            }
            return;
        }

        // Swear Protection Check
        const swearViolation = evaluateSwearContent(message);
        if (swearViolation) {
            const executePunishment = async () => {
                let actionDelete = isFeatureEnabled(guildId, "kufurActionDelete");
                let actionWarn = isFeatureEnabled(guildId, "kufurActionWarn");
                let actionMute = isFeatureEnabled(guildId, "kufurActionMute");
                let actionKick = isFeatureEnabled(guildId, "kufurActionKick");
                let actionBan = isFeatureEnabled(guildId, "kufurActionBan");
                let actionLog = isFeatureEnabled(guildId, "kufurActionStaffLog");

                if (swearViolation.severity === "critical") {
                    actionDelete = true;
                    actionBan = true;
                    actionLog = true;
                }

                if (actionDelete) {
                    await message.delete().catch(() => {});
                }

                if (actionWarn) {
                    await message.channel.send({ content: `⚠️ ${message.author}, gönderdiğiniz mesajda küfür/hakaret tespit edildi! Sebep: **${swearViolation.reason}**` }).then(msg => {
                        setTimeout(() => msg.delete().catch(() => {}), 5000);
                    });
                }

                increaseThreat(guildId, swearViolation.severity === "critical" ? 25 : (swearViolation.severity === "high" ? 12 : 5), swearViolation.reason, message.guild);

                if (actionBan && message.member) {
                    await message.member.ban({ reason: `Guard | ${swearViolation.reason}` }).catch(() => {});
                } else if (actionKick && message.member) {
                    await message.member.kick(`Guard | ${swearViolation.reason}`).catch(() => {});
                } else if (actionMute && message.member) {
                    await message.member.timeout(300000, `Guard | ${swearViolation.reason}`).catch(() => {});
                }

                if (actionLog) {
                    const logChId = getSetting(guildId, "logChannelId");
                    if (logChId) {
                        const logCh = message.guild.channels.cache.get(logChId);
                        if (logCh) {
                            const embed = new EmbedBuilder()
                                .setColor(0xFF0000)
                                .setTitle("🚨 Küfür Koruması İhlali")
                                .setDescription(`
**Kullanıcı**   :: ${message.author} (\`${message.author.id}\`)
**Kanal**       :: ${message.channel}
**Sebep**       :: \`${swearViolation.reason}\`
**İçerik**      :: \`${message.content.substring(0, 500)}\`
**Tehdit Derecesi**:: \`${swearViolation.severity.toUpperCase()}\`
**Uygulanan Ceza**:: \`${actionBan ? "Yasaklama" : (actionKick ? "Atılma" : (actionMute ? "Mute (5 Dk)" : "Mesaj Silme"))}\`
                                `)
                                .setTimestamp();
                            await logCh.send({ embeds: [embed] }).catch(() => {});
                        }
                    }
                }
            };

            // Feature 23: kufurAllowSelfCorrect (Hatalı Yazım Düzeltme)
            if (isFeatureEnabled(guildId, "kufurAllowSelfCorrect")) {
                const timeout = setTimeout(async () => {
                    global.selfCorrectTimeouts.delete(message.id);
                    await executePunishment();
                }, 3000);
                global.selfCorrectTimeouts.set(message.id, timeout);
            } else {
                await executePunishment();
            }
            return;
        }

        // Argo Filtresi
        if (isFeatureEnabled(guildId, "argoEngel")) {
            const argolar = ["lan", "gerizekalı", "aptal", "salak"];
            const words = message.content.toLowerCase().split(/\s+/);
            if (words.some(w => argolar.includes(w))) {
                increaseThreat(guildId, 3, "Argo İleti", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Argo İleti** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Argo İleti`).catch(() => {});
                return;
            }
        }


        // Everyone / Here Engeli
        if (isFeatureEnabled(guildId, "everyoneHereEngel") && (message.content.includes("@everyone") || message.content.includes("@here"))) {
            if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
                increaseThreat(guildId, 15, "Yetkisiz Everyone/Here Etiketi", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Yetkisiz Everyone/Here Etiketi** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Everyone/Here`).catch(() => {});
                return;
            }
        }
    });

    // Message Edit Monitor for Webhook and User Messages
    client.on("messageUpdate", async (oldMessage, newMessage) => {
        if (!newMessage.guild) return;
        const guildId = newMessage.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        // Webhook message edit checks
        if (newMessage.webhookId && isFeatureEnabled(guildId, "webhookMessageEditMonitor")) {
            const violation = evaluateLinkContent(newMessage);
            if (violation && (isFeatureEnabled(guildId, "webhookLinkEngel") || isFeatureEnabled(guildId, "linkBlockAll"))) {
                await newMessage.delete().catch(() => {});
                increaseThreat(guildId, 10, `Düzenlenmiş Webhook Link İhlali: ${violation.reason}`, newMessage.guild);
                return;
            }

            const swearViol = evaluateSwearContent(newMessage);
            if (swearViol && (isFeatureEnabled(guildId, "webhookKufurEngel") || isFeatureEnabled(guildId, "kufurBlockAll"))) {
                await newMessage.delete().catch(() => {});
                increaseThreat(guildId, 10, `Düzenlenmiş Webhook Küfür İhlali: ${swearViol.reason}`, newMessage.guild);
                return;
            }

            let shouldDeleteEdited = false;
            let editReason = "";

            if (newMessage.content.includes("@everyone") || newMessage.content.includes("@here")) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Everyone/Here Etiketi";
            }

            if (shouldDeleteEdited) {
                await newMessage.delete().catch(() => {});
                increaseThreat(guildId, 10, editReason, newMessage.guild);
            }
            return;
        }

        // Regular user message edit checks
        if (!newMessage.author || newMessage.author.bot) return;
        if (isWhitelisted(newMessage.guild, newMessage.author.id, "chat")) return;

        const violation = evaluateLinkContent(newMessage);
        if (violation) {
            await newMessage.delete().catch(() => {});
            increaseThreat(guildId, 8, `Düzenlenmiş Link İhlali: ${violation.reason}`, newMessage.guild);
            await newMessage.channel.send({ content: `🚫 ${newMessage.author}, iletiniz düzenleme sonrasında **link koruması** nedeniyle engellendi.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
            return;
        }

        const swearViol = evaluateSwearContent(newMessage);
        if (swearViol && (isFeatureEnabled(guildId, "kufurBlockAll") || isFeatureEnabled(guildId, "kufurEngel"))) {
            await newMessage.delete().catch(() => {});
            increaseThreat(guildId, 8, `Düzenlenmiş Küfür İhlali: ${swearViol.reason}`, newMessage.guild);
            await newMessage.channel.send({ content: `🚫 ${newMessage.author}, iletiniz düzenleme sonrasında **küfür koruması** nedeniyle engellendi.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
        }
    });

    // Nickname and Join Protections for Swear
    client.on("guildMemberUpdate", async (oldMember, newMember) => {
        const guildId = newMember.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "kufurBlockNicknames")) return;

        const nickname = newMember.nickname || "";
        const username = newMember.user.username;
        const textToCheck = `${nickname} ${username}`;

        const dummyMessage = {
            guild: newMember.guild,
            content: textToCheck,
            author: newMember.user,
            member: newMember,
            attachments: new Map(),
            embeds: []
        };

        const violation = evaluateSwearContent(dummyMessage);
        if (violation) {
            await newMember.setNickname("Slesy Moderasyon", "Kullanıcı İsmi Koruması").catch(() => {});
            const logChId = getSetting(guildId, "logChannelId");
            if (logChId) {
                const logCh = newMember.guild.channels.cache.get(logChId);
                if (logCh) {
                    const embed = new EmbedBuilder()
                        .setColor(0xFF0000)
                        .setTitle("🚨 Kullanıcı İsmi Koruması İhlali")
                        .setDescription(`
**Kullanıcı**   :: ${newMember.user} (\`${newMember.user.id}\`)
**Eski Takma Ad**:: \`${nickname || "Yok"}\`
**Kullanıcı Adı**:: \`${username}\`
**Sebep**       :: \`${violation.reason}\`
**Eylem**       :: Takma adı sıfırlandı (\`Slesy Moderasyon\`)
                        `)
                        .setTimestamp();
                    await logCh.send({ embeds: [embed] }).catch(() => {});
                }
            }
        }
    });

    client.on("guildMemberAdd", async (member) => {
        const guildId = member.guild.id;
        if (!global.guardDurums.get(guildId)) return;
        if (!isFeatureEnabled(guildId, "kufurBlockNicknames")) return;

        const textToCheck = member.user.username;

        const dummyMessage = {
            guild: member.guild,
            content: textToCheck,
            author: member.user,
            member: member,
            attachments: new Map(),
            embeds: []
        };

        const violation = evaluateSwearContent(dummyMessage);
        if (violation) {
            await member.setNickname("Slesy Moderasyon", "Kullanıcı İsmi Koruması").catch(() => {});
        }
    });

    client.on("messageDelete", message => {
        if (!message.id) return;
        const timeout = global.selfCorrectTimeouts.get(message.id);
        if (timeout) {
            clearTimeout(timeout);
            global.selfCorrectTimeouts.delete(message.id);
        }
    });
};
