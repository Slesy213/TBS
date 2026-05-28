const { PermissionFlagsBits } = require("discord.js");
const {
    isFeatureEnabled,
    increaseThreat,
    isWhitelisted,
    getSetting
} = require("../guard.js");

module.exports = (client) => {
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

            // 1. Delete message
            await message.delete().catch(() => {});

            // 2. Invalidate webhook token by deleting it from Discord
            const targetWebhook = await client.fetchWebhook(webhookId, webhookToken).catch(() => null);
            if (targetWebhook) {
                await targetWebhook.delete("Token Leak Protection").catch(() => {});
            }

            // 3. Punish sender
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

            // Feature 12: webhookLinkEngel
            const linkRegex = /(https?:\/\/|www\.)/gi;
            const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/gi;
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookLinkEngel") && linkRegex.test(message.content)) {
                shouldDeleteWebhookMsg = true;
                webhookReason = "Webhook Link Paylaşımı";
            }

            // Feature 17: webhookIpBanList
            const phishingRegex = /(grabify|iplogger|leak|steampromotion|gift-nitro|free-nitro|discord-gift)/gi;
            if (!shouldDeleteWebhookMsg && isFeatureEnabled(guildId, "webhookIpBanList") && phishingRegex.test(message.content)) {
                shouldDeleteWebhookMsg = true;
                webhookReason = "Zararlı IP/Phishing Link";
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

        // Link & Davet Engel
        const linkRegex = /(https?:\/\/|www\.)/gi;
        const inviteRegex = /(discord\.gg\/|discord\.com\/invite\/)/gi;

        let shouldDelete = false;
        let reason = "";
        let threatPoints = 0;

        if (isFeatureEnabled(guildId, "inviteEngel") && inviteRegex.test(message.content)) {
            shouldDelete = true;
            reason = "Davet Linki Paylaşımı";
            threatPoints = 12;
        } else if (isFeatureEnabled(guildId, "linkEngel") && linkRegex.test(message.content)) {
            shouldDelete = true;
            reason = "Link Paylaşımı";
            threatPoints = 8;
        }

        // Küfür & Argo Filtreleri
        const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
        const argolar = ["lan", "gerizekalı", "aptal", "salak"];

        if (!shouldDelete && isFeatureEnabled(guildId, "kufurEngel")) {
            const words = message.content.toLowerCase().split(/\s+/);
            if (words.some(w => kufurler.includes(w))) {
                shouldDelete = true;
                reason = "Küfürlü İleti";
                threatPoints = 5;
            }
        }

        if (!shouldDelete && isFeatureEnabled(guildId, "argoEngel")) {
            const words = message.content.toLowerCase().split(/\s+/);
            if (words.some(w => argolar.includes(w))) {
                shouldDelete = true;
                reason = "Argo İleti";
                threatPoints = 3;
            }
        }

        // Caps Lock Engeli (>70% uppercase)
        if (!shouldDelete && isFeatureEnabled(guildId, "capsEngel") && message.content.length > 5) {
            const upperCount = message.content.replace(/[^A-ZĞÜŞİÖÇ]/g, "").length;
            if ((upperCount / message.content.length) > 0.7) {
                shouldDelete = true;
                reason = "Aşırı Büyük Harf (Caps Lock)";
                threatPoints = 3;
            }
        }

        // Etiket Spami
        if (!shouldDelete && isFeatureEnabled(guildId, "mentionSpamEngel")) {
            const mentions = message.mentions.users.size + message.mentions.roles.size;
            if (mentions > 4) {
                shouldDelete = true;
                reason = "Etiket Spami";
                threatPoints = 10;
            }
        }

        // Emoji Spami
        if (!shouldDelete && isFeatureEnabled(guildId, "emojiSpamEngel")) {
            const emojiRegex = /<a?:.+?:\d+>|[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g;
            const emojis = message.content.match(emojiRegex);
            if (emojis && emojis.length > 5) {
                shouldDelete = true;
                reason = "Emoji Spami";
                threatPoints = 4;
            }
        }

        // Everyone / Here Engeli
        if (!shouldDelete && isFeatureEnabled(guildId, "everyoneHereEngel") && (message.content.includes("@everyone") || message.content.includes("@here"))) {
            if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
                shouldDelete = true;
                reason = "Yetkisiz Everyone/Here Etiketi";
                threatPoints = 15;
            }
        }

        if (shouldDelete) {
            increaseThreat(guildId, threatPoints, reason, message.guild);
            await message.delete().catch(() => {});
            await message.channel.send({ content: `🚫 ${message.author}, **${reason}** nedeniyle iletiniz engellendi.` }).then(msg => {
                setTimeout(() => msg.delete().catch(() => {}), 5000);
            });
            await message.member.timeout(30000, `Guard | ${reason}`).catch(() => {});
        }
    });

    // Webhook Message Edit Monitor (Feature 16)
    client.on("messageUpdate", async (oldMessage, newMessage) => {
        if (!newMessage.guild) return;
        const guildId = newMessage.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        if (newMessage.webhookId && isFeatureEnabled(guildId, "webhookMessageEditMonitor")) {
            let shouldDeleteEdited = false;
            let editReason = "";

            // Everyone / Here
            if (newMessage.content.includes("@everyone") || newMessage.content.includes("@here")) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Everyone/Here Etiketi";
            }

            // Swears
            const kufurler = ["kufur1", "amk", "oç", "piç", "siktir", "sik"];
            const words = newMessage.content.toLowerCase().split(/\s+/);
            if (words.some(w => kufurler.includes(w))) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Küfürü";
            }

            // Links / Phishing
            const linkRegex = /(https?:\/\/|www\.)/gi;
            const phishingRegex = /(grabify|iplogger|leak|steampromotion|gift-nitro|free-nitro|discord-gift)/gi;
            if (linkRegex.test(newMessage.content) || phishingRegex.test(newMessage.content)) {
                shouldDeleteEdited = true;
                editReason = "Düzenlenmiş Webhook Zararlı Bağlantısı";
            }

            if (shouldDeleteEdited) {
                await newMessage.delete().catch(() => {});
                increaseThreat(guildId, 10, editReason, newMessage.guild);
            }
        }
    });
};
