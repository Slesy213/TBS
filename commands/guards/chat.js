const { PermissionFlagsBits } = require("discord.js");
const {
    isFeatureEnabled,
    increaseThreat,
    isWhitelisted
} = require("../guard.js");

module.exports = (client) => {
    // Sohbet Filtreleri ve İletiler
    client.on("messageCreate", async message => {
        if (!message.guild) return;
        const guildId = message.guild.id;
        if (!global.guardDurums.get(guildId)) return;
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
};
