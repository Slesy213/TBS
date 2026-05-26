const {
    EmbedBuilder,
    PermissionsBitField,
    AuditLogEvent
} = require("discord.js");

let guardDurum = false;

module.exports = {
    name: "guard",

    async execute(message, args, client) {

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ Bu komutu kullanamazsın.");
        }

        const secim = args[0];

        if (!secim) {
            return message.reply("Kullanım: `.guard aç` veya `.guard kapat`");
        }

        // GUARD AÇ
        if (secim === "aç") {

            if (guardDurum) {
                return message.reply("⚠️ Guard zaten aktif.");
            }

            guardDurum = true;

            message.reply("🛡️ Guard sistemi aktif edildi.");

            // KANAL SİLME KORUMA
            client.on("channelDelete", async (channel) => {

                if (!guardDurum) return;

                const logs = await channel.guild.fetchAuditLogs({
                    type: AuditLogEvent.ChannelDelete,
                    limit: 1
                });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (executor.id === message.guild.ownerId) return;

                const member = await channel.guild.members.fetch(executor.id).catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason: "Guard | Kanal Silme"
                });

                channel.guild.systemChannel?.send({
                    content: `🚨 ${executor.tag} kanal sildiği için banlandı.`
                });

            });

            // ROL SİLME KORUMA
            client.on("roleDelete", async (role) => {

                if (!guardDurum) return;

                const logs = await role.guild.fetchAuditLogs({
                    type: AuditLogEvent.RoleDelete,
                    limit: 1
                });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (executor.id === message.guild.ownerId) return;

                const member = await role.guild.members.fetch(executor.id).catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason: "Guard | Rol Silme"
                });

                role.guild.systemChannel?.send({
                    content: `🚨 ${executor.tag} rol sildiği için banlandı.`
                });

            });

            // BOT EKLEME KORUMA
            client.on("guildMemberAdd", async (member) => {

                if (!guardDurum) return;

                if (!member.user.bot) return;

                const logs = await member.guild.fetchAuditLogs({
                    type: AuditLogEvent.BotAdd,
                    limit: 1
                });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (executor.id === message.guild.ownerId) return;

                await member.kick("Guard Sistemi");

                const yetkili = await member.guild.members.fetch(executor.id).catch(() => null);

                if (!yetkili) return;

                await yetkili.roles.set([]);

                await yetkili.ban({
                    reason: "Guard | İzinsiz Bot"
                });

                member.guild.systemChannel?.send({
                    content: `🚨 ${executor.tag} izinsiz bot eklediği için banlandı.`
                });

            });

        }

        // GUARD KAPAT
        else if (secim === "kapat") {

            guardDurum = false;

            message.reply("❌ Guard sistemi kapatıldı.");
        }

        else {
            message.reply("Kullanım: `.guard aç` veya `.guard kapat`");
        }
    }
};
