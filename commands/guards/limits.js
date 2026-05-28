const { AuditLogEvent } = require("discord.js");
const {
    getSetting,
    getAuditLogEntry,
    punishAdmin,
    increaseThreat,
    checkRateLimit,
    isWhitelisted
} = require("../guard.js");

module.exports = (client) => {
    // Audit Log Üye Yasaklama Limitleri
    client.on("guildBanAdd", async ban => {
        const guildId = ban.guild.id;
        if (!global.guardDurums.get(guildId)) return;

        const limitMax = getSetting(guildId, "banLimit");
        const limitMinutes = getSetting(guildId, "limitTime") || 5;

        (async () => {
            const entry = await getAuditLogEntry(ban.guild, AuditLogEvent.MemberBanAdd);
            if (!entry) return;
            const executor = entry.executor;
            if (isWhitelisted(ban.guild, executor.id, "limitBypass")) return;

            const exceeded = checkRateLimit(guildId, executor.id, "banLimit", limitMax, limitMinutes);
            if (exceeded) {
                increaseThreat(guildId, 40, `Yönetici ban limitini aştı: ${executor.tag}`, ban.guild);
                punishAdmin(ban.guild, executor, `Yönetici Ban Limitini Aşma (Limit: ${limitMax})`, guildId);
                await ban.guild.members.unban(ban.user.id, "Guard | Limit Aşımı Koruması").catch(() => {});
            }
        })();
    });
};
