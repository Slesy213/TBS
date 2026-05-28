const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const {
    isFeatureEnabled,
    increaseThreat,
    isWhitelisted,
    getSetting
} = require("../guard.js");

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

    // Sohbet Filtreleri ve İletiler
    client.on("messageCreate", async message => {
        if (!message.guild) return;
        const guildId = message.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        // Feature 7: webhookTokenLeakGuard (Scans all messages)
        const webhookTokenRegex = /https:\/\/discord(?:app)?\.com\/api\/webhooks\/(\d+)\/([A-Za-z0-9\-_]+)/gi;
        const match = webhookTokenRegex.exec(message.content);
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
            const threatVal = global.threatLevelTracker?.get(guildId) || 0;
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
                const badWords = ["kufur1", "amk", "oç", "piç", "siktir", "sik", "discord.gg", "http", "www."];
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

            // Feature 13: webhookKufurEngel
            const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookKufurEngel")) {
                const words = message.content.toLowerCase().split(/\s+/);
                if (words.some(w => kufurler.includes(w))) {
                    shouldDeleteWebhookMsg = true;
                    webhookReason = "Webhook Küfür Filtresi";
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
        if (linkViolation && (isFeatureEnabled(guildId, "linkEngel") || isFeatureEnabled(guildId, "linkBlockAll"))) {
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

        // Fallback to legacy invite checker if inviteEngel is enabled
        const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/gi;
        if (isFeatureEnabled(guildId, "inviteEngel") && inviteRegex.test(message.content)) {
            increaseThreat(guildId, 12, "Davet Linki Paylaşımı", message.guild);
            await message.delete().catch(() => {});
            await message.channel.send({ content: `🚫 ${message.author}, **Davet Linki Paylaşımı** nedeniyle iletiniz engellendi.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
            await message.member.timeout(30000, `Guard | Davet Linki`).catch(() => {});
            return;
        }

        // Küfür & Argo Filtreleri
        const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
        const argolar = ["lan", "gerizekalı", "aptal", "salak"];

        if (isFeatureEnabled(guildId, "kufurEngel")) {
            const words = message.content.toLowerCase().split(/\s+/);
            if (words.some(w => kufurler.includes(w))) {
                increaseThreat(guildId, 5, "Küfürlü İleti", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Küfürlü İleti** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Küfürlü İleti`).catch(() => {});
                return;
            }
        }

        if (isFeatureEnabled(guildId, "argoEngel")) {
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

        // Caps Lock Engeli (>70% uppercase)
        if (isFeatureEnabled(guildId, "capsEngel") && message.content.length > 5) {
            const upperCount = message.content.replace(/[^A-ZĞÜŞİÖÇ]/g, "").length;
            if ((upperCount / message.content.length) > 0.7) {
                increaseThreat(guildId, 3, "Aşırı Büyük Harf (Caps Lock)", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Aşırı Büyük Harf (Caps Lock)** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Caps Lock`).catch(() => {});
                return;
            }
        }

        // Etiket Spami
        if (isFeatureEnabled(guildId, "mentionSpamEngel")) {
            const mentions = message.mentions.users.size + message.mentions.roles.size;
            if (mentions > 4) {
                increaseThreat(guildId, 10, "Etiket Spami", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Etiket Spami** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Etiket Spami`).catch(() => {});
                return;
            }
        }

        // Emoji Spami
        if (isFeatureEnabled(guildId, "emojiSpamEngel")) {
            const emojiRegex = /<a?:.+?:\d+>|[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g;
            const emojis = message.content.match(emojiRegex);
            if (emojis && emojis.length > 5) {
                increaseThreat(guildId, 4, "Emoji Spami", message.guild);
                await message.delete().catch(() => {});
                await message.channel.send({ content: `🚫 ${message.author}, **Emoji Spami** nedeniyle iletiniz engellendi.` }).then(msg => {
                    setTimeout(() => msg.delete().catch(() => {}), 5000);
                });
                await message.member.timeout(30000, `Guard | Emoji Spami`).catch(() => {});
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

            let shouldDeleteEdited = false;
            let editReason = "";

            if (newMessage.content.includes("@everyone") || newMessage.content.includes("@here")) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Everyone/Here Etiketi";
            }

            const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
            const words = newMessage.content.toLowerCase().split(/\s+/);
            if (words.some(w => kufurler.includes(w))) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Küfürü";
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
        if (violation && (isFeatureEnabled(guildId, "linkEngel") || isFeatureEnabled(guildId, "linkBlockAll"))) {
            await newMessage.delete().catch(() => {});
            increaseThreat(guildId, 8, `Düzenlenmiş Link İhlali: ${violation.reason}`, newMessage.guild);
            await newMessage.channel.send({ content: `🚫 ${newMessage.author}, iletiniz düzenleme sonrasında **link koruması** nedeniyle engellendi.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
        }
    });
};
