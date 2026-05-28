const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const {
    isFeatureEnabled,
    increaseThreat,
    isWhitelisted,
    getSetting,
    sendGuardLog,
    sendOwnerAlert
} = require("../guard.js");

// Per-guild per-user message tracking
global.spamTracker = global.spamTracker || new Map();

// Cleanup old tracking data every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [key, data] of global.spamTracker.entries()) {
        if (now - data.lastMessage > 60000) {
            global.spamTracker.delete(key);
        }
    }
}, 60000);

module.exports = (client) => {

    // ─── Helper: Get or create user tracker ───
    function getTracker(guildId, userId) {
        const key = `${guildId}-${userId}`;
        if (!global.spamTracker.has(key)) {
            global.spamTracker.set(key, {
                messages: [],
                warnings: 0,
                lastMessage: Date.now(),
                muted: false
            });
        }
        const tracker = global.spamTracker.get(key);
        tracker.lastMessage = Date.now();
        return tracker;
    }

    // ─── Helper: Clean old messages from tracker (sliding window of 30s) ───
    function cleanOldMessages(tracker) {
        const cutoff = Date.now() - 30000;
        tracker.messages = tracker.messages.filter(m => m.time > cutoff);
    }

    // ─── Feature 13: spamActionDelete ───
    async function actionDelete(message) {
        try {
            if (message.deletable) await message.delete();
        } catch (e) { /* ignore */ }
    }

    // ─── Feature 14: spamActionWarn ───
    async function actionWarn(message, reason) {
        try {
            const embed = new EmbedBuilder()
                .setColor(0xFFCC00)
                .setTitle("⚠️ Spam Uyarısı")
                .setDescription(`${message.author}, spam davranışı tespit edildi!\n**Sebep:** ${reason}`)
                .setTimestamp();
            const warnMsg = await message.channel.send({ embeds: [embed] });
            setTimeout(() => { try { warnMsg.delete(); } catch(e) {} }, 8000);
        } catch (e) { /* ignore */ }
    }

    // ─── Feature 15: spamActionMute ───
    async function actionMute(message, reason) {
        try {
            if (message.member && message.member.moderatable) {
                await message.member.timeout(10 * 60 * 1000, `Spam Koruma: ${reason}`);
            }
        } catch (e) { /* ignore */ }
    }

    // ─── Feature 16: spamActionKick ───
    async function actionKick(message, reason) {
        try {
            if (message.member && message.member.kickable) {
                await message.member.kick(`Spam Koruma: ${reason}`);
            }
        } catch (e) { /* ignore */ }
    }

    // ─── Feature 17: spamActionBan ───
    async function actionBan(message, reason) {
        try {
            if (message.member && message.member.bannable) {
                await message.member.ban({ reason: `Spam Koruma: ${reason}`, deleteMessageSeconds: 60 });
            }
        } catch (e) { /* ignore */ }
    }

    // ─── Feature 18: spamActionStaffLog ───
    async function actionStaffLog(message, reason, details) {
        const guildId = message.guild.id;
        if (!isFeatureEnabled(guildId, "spamActionStaffLog")) return;
        const embed = new EmbedBuilder()
            .setColor(0xFF4444)
            .setTitle("🛡️ Spam Tespit Edildi")
            .addFields(
                { name: "Kullanıcı", value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: "Kanal", value: `${message.channel}`, inline: true },
                { name: "Sebep", value: reason, inline: false },
                { name: "Detay", value: details || "Ek bilgi yok", inline: false }
            )
            .setTimestamp();
        sendGuardLog(message.guild, embed);
    }

    // ─── Execute actions based on enabled features ───
    async function executeActions(message, reason, details) {
        const guildId = message.guild.id;

        // Feature 13
        if (isFeatureEnabled(guildId, "spamActionDelete")) {
            await actionDelete(message);
        }
        // Feature 14
        if (isFeatureEnabled(guildId, "spamActionWarn")) {
            await actionWarn(message, reason);
        }
        // Feature 15
        if (isFeatureEnabled(guildId, "spamActionMute")) {
            await actionMute(message, reason);
        }
        // Feature 16
        if (isFeatureEnabled(guildId, "spamActionKick")) {
            await actionKick(message, reason);
        }
        // Feature 17
        if (isFeatureEnabled(guildId, "spamActionBan")) {
            await actionBan(message, reason);
        }
        // Feature 18
        await actionStaffLog(message, reason, details || "Otomatik tespit");

        // Increase threat
        increaseThreat(guildId, 15, reason, message.guild);
    }

    // ════════════════════════════════════════════
    // MAIN MESSAGE HANDLER
    // ════════════════════════════════════════════
    client.on("messageCreate", async (message) => {
        if (!message.guild) return;
        if (message.author.bot) return;
        if (!message.member) return;

        const guildId = message.guild.id;

        // ─── Feature 1: spamBlockAll (master switch) ───
        if (!isFeatureEnabled(guildId, "spamBlockAll")) return;

        // ─── Feature 19: spamAllowStaff ───
        if (isFeatureEnabled(guildId, "spamAllowStaff")) {
            if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return;
            }
        }

        // ─── Whitelist check ───
        if (isWhitelisted(message.guild, message.author.id)) return;

        // ─── Feature 20: spamBypassChannels ───
        if (isFeatureEnabled(guildId, "spamBypassChannels")) {
            const chName = message.channel.name.toLowerCase();
            const bypassNames = ["bot", "komut", "spam", "oyun", "müzik", "music", "game", "bot-komut", "serbest"];
            if (bypassNames.some(name => chName.includes(name))) return;
        }

        const tracker = getTracker(guildId, message.author.id);
        cleanOldMessages(tracker);

        // Record this message
        tracker.messages.push({
            time: Date.now(),
            content: message.content || "",
            channelId: message.channel.id
        });

        const content = message.content || "";
        let violated = false;
        let violationReason = "";
        let violationDetails = "";

        // ─── Feature 2: spamDuplicateLimit ───
        if (!violated && isFeatureEnabled(guildId, "spamDuplicateLimit")) {
            const recentContents = tracker.messages.map(m => m.content.toLowerCase().trim()).filter(c => c.length > 0);
            const contentCount = {};
            for (const c of recentContents) {
                contentCount[c] = (contentCount[c] || 0) + 1;
            }
            for (const [text, count] of Object.entries(contentCount)) {
                if (count >= 3) {
                    violated = true;
                    violationReason = "Tekrarlanan Mesaj";
                    violationDetails = `Aynı mesaj ${count} kez tekrarlandı (30sn içinde): "${text.substring(0, 50)}..."`;
                    break;
                }
            }
        }

        // ─── Feature 3: spamMaxMessages ───
        if (!violated && isFeatureEnabled(guildId, "spamMaxMessages")) {
            const maxMessages = 7; // 30 saniyede max 7 mesaj
            if (tracker.messages.length > maxMessages) {
                violated = true;
                violationReason = "Hızlı Mesaj Gönderimi";
                violationDetails = `30 saniye içinde ${tracker.messages.length} mesaj gönderildi (Limit: ${maxMessages})`;
            }
        }

        // ─── Feature 4: spamMinTimeBetweenMessages ───
        if (!violated && isFeatureEnabled(guildId, "spamMinTimeBetweenMessages")) {
            const msgs = tracker.messages;
            if (msgs.length >= 2) {
                const lastTwo = msgs.slice(-2);
                const timeDiff = lastTwo[1].time - lastTwo[0].time;
                if (timeDiff < 500) { // 500ms'den kısa aralıkla mesaj
                    violated = true;
                    violationReason = "Çok Hızlı Mesaj";
                    violationDetails = `Mesajlar arası süre: ${timeDiff}ms (Minimum: 500ms)`;
                }
            }
        }

        // ─── Feature 5: spamCapsPercentage ───
        if (!violated && isFeatureEnabled(guildId, "spamCapsPercentage")) {
            if (content.length > 8) {
                const letters = content.replace(/[^a-zA-ZğüşöçıİĞÜŞÖÇ]/g, "");
                if (letters.length > 5) {
                    const upperLetters = letters.replace(/[^A-ZİĞÜŞÖÇ]/g, "");
                    const capsPercent = (upperLetters.length / letters.length) * 100;
                    if (capsPercent > 70) {
                        violated = true;
                        violationReason = "Aşırı Büyük Harf";
                        violationDetails = `Büyük harf oranı: %${capsPercent.toFixed(0)} (Limit: %70)`;
                    }
                }
            }
        }

        // ─── Feature 6: spamMaxEmojis ───
        if (!violated && isFeatureEnabled(guildId, "spamMaxEmojis")) {
            const customEmojiRegex = /<a?:\w+:\d+>/g;
            const unicodeEmojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;
            const customCount = (content.match(customEmojiRegex) || []).length;
            const unicodeCount = (content.match(unicodeEmojiRegex) || []).length;
            const totalEmojis = customCount + unicodeCount;
            if (totalEmojis > 10) {
                violated = true;
                violationReason = "Aşırı Emoji Kullanımı";
                violationDetails = `Toplam emoji: ${totalEmojis} (Limit: 10)`;
            }
        }

        // ─── Feature 7: spamMaxMentions ───
        if (!violated && isFeatureEnabled(guildId, "spamMaxMentions")) {
            const userMentions = (content.match(/<@!?\d+>/g) || []).length;
            if (userMentions > 5) {
                violated = true;
                violationReason = "Aşırı Etiketleme";
                violationDetails = `Kullanıcı etiketi: ${userMentions} (Limit: 5)`;
            }
        }

        // ─── Feature 8: spamMaxLines ───
        if (!violated && isFeatureEnabled(guildId, "spamMaxLines")) {
            const lineCount = content.split("\n").length;
            if (lineCount > 15) {
                violated = true;
                violationReason = "Çok Fazla Satır";
                violationDetails = `Satır sayısı: ${lineCount} (Limit: 15)`;
            }
        }

        // ─── Feature 9: spamMaxLength ───
        if (!violated && isFeatureEnabled(guildId, "spamMaxLength")) {
            if (content.length > 1500) {
                violated = true;
                violationReason = "Çok Uzun Mesaj";
                violationDetails = `Mesaj uzunluğu: ${content.length} karakter (Limit: 1500)`;
            }
        }

        // ─── Feature 10: spamRoleMentions ───
        if (!violated && isFeatureEnabled(guildId, "spamRoleMentions")) {
            const roleMentions = (content.match(/<@&\d+>/g) || []).length;
            if (roleMentions > 0) {
                // Normal üyeler rol etiketlememeli
                if (!message.member.permissions.has(PermissionFlagsBits.MentionEveryone)) {
                    violated = true;
                    violationReason = "Yetkisiz Rol Etiketi";
                    violationDetails = `${roleMentions} adet rol etiketi tespit edildi`;
                }
            }
        }

        // ─── Feature 11: spamFastReact ───
        // (Handled in reaction listener below)

        // ─── Feature 12: spamLinkCount ───
        if (!violated && isFeatureEnabled(guildId, "spamLinkCount")) {
            const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
            const linkMatches = content.match(urlRegex) || [];
            if (linkMatches.length > 3) {
                violated = true;
                violationReason = "Çok Fazla Link";
                violationDetails = `Mesajda ${linkMatches.length} link tespit edildi (Limit: 3)`;
            }
        }

        // ─── Execute actions if violated ───
        if (violated) {
            await executeActions(message, violationReason, violationDetails);

            // Alert owner if threat is high
            const threat = global.guildThreatLevels.get(guildId) || 0;
            if (threat >= 50) {
                sendOwnerAlert(message.guild, `🚨 Yüksek spam tehdidi! Tehdit seviyesi: ${threat}\nSon ihlal: ${violationReason} — ${message.author.tag}`);
            }
        }
    });

    // ════════════════════════════════════════════
    // Feature 11: spamFastReact — Hızlı Reaksiyon Kontrolü
    // ════════════════════════════════════════════
    client.on("messageReactionAdd", async (reaction, user) => {
        try {
            if (!reaction.message.guild) return;
            if (user.bot) return;

            const guildId = reaction.message.guild.id;
            if (!isFeatureEnabled(guildId, "spamBlockAll")) return;
            if (!isFeatureEnabled(guildId, "spamFastReact")) return;

            // Staff bypass
            if (isFeatureEnabled(guildId, "spamAllowStaff")) {
                const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
                if (member && (member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator))) {
                    return;
                }
            }

            // Check if user reacted too fast (within 1 second of message being sent)
            const messageAge = Date.now() - reaction.message.createdTimestamp;
            if (messageAge < 1000) {
                // Too fast — likely a bot/macro
                try {
                    await reaction.remove();
                } catch(e) { /* ignore */ }

                const embed = new EmbedBuilder()
                    .setColor(0xFF4444)
                    .setTitle("🛡️ Hızlı Reaksiyon Tespit Edildi")
                    .addFields(
                        { name: "Kullanıcı", value: `${user.tag} (${user.id})`, inline: true },
                        { name: "Kanal", value: `${reaction.message.channel}`, inline: true },
                        { name: "Süre", value: `${messageAge}ms (Limit: 1000ms)`, inline: false }
                    )
                    .setTimestamp();

                if (isFeatureEnabled(guildId, "spamActionStaffLog")) {
    sendGuardLog(reaction.message.guild, embed);
}

increaseThreat(guildId, 5, "Hızlı Reaksiyon Spamı", reaction.message.guild);
            }
        } catch(e) { /* ignore */ }
    });

    // ════════════════════════════════════════════
    // Bulk message detection (cross-channel spam)
    // ════════════════════════════════════════════
    client.on("messageCreate", async (message) => {
        if (!message.guild) return;
        if (message.author.bot) return;
        if (!message.member) return;

        const guildId = message.guild.id;
        if (!isFeatureEnabled(guildId, "spamBlockAll")) return;
        if (!isFeatureEnabled(guildId, "spamDuplicateLimit")) return;

        // Staff bypass
        if (isFeatureEnabled(guildId, "spamAllowStaff")) {
            if (message.member.permissions.has(PermissionFlagsBits.ManageMessages) ||
                message.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return;
            }
        }

        if (isWhitelisted(message.guild, message.author.id)) return;

        const tracker = getTracker(guildId, message.author.id);
        cleanOldMessages(tracker);

        // Check cross-channel spam: same content in 3+ different channels
        const uniqueChannels = new Set();
        const content = (message.content || "").toLowerCase().trim();
        if (content.length > 5) {
            for (const msg of tracker.messages) {
                if (msg.content.toLowerCase().trim() === content) {
                    uniqueChannels.add(msg.channelId);
                }
            }
            if (uniqueChannels.size >= 3) {
                await executeActions(message, "Çapraz Kanal Spam", `Aynı mesaj ${uniqueChannels.size} farklı kanalda gönderildi`);
            }
        }
    });
};
