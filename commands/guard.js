const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    AuditLogEvent
} = require("discord.js");

let guardDurum = false;

module.exports = {

    data: new SlashCommandBuilder()
        .setName("guard")
        .setDescription("Guard sistemini açar/kapatır")
        .addStringOption(option =>
            option
                .setName("durum")
                .setDescription("aç veya kapat")
                .setRequired(true)
                .addChoices(
                    { name: "Aç", value: "aç" },
                    { name: "Kapat", value: "kapat" }
                )
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction, client) {

        const secim =
            interaction.options.getString("durum");

        // GUARD AÇ

        if (secim === "aç") {

            if (guardDurum) {
                return interaction.reply({
                    content: "⚠️ Guard zaten aktif.",
                    ephemeral: true
                });
            }

            guardDurum = true;

            await interaction.reply({
                content: "🛡️ Guard sistemi aktif edildi."
            });

            // KANAL SİLME

            client.on("channelDelete", async (channel) => {

                if (!guardDurum) return;

                const logs =
                    await channel.guild.fetchAuditLogs({
                        type: AuditLogEvent.ChannelDelete,
                        limit: 1
                    });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (
                    executor.id ===
                    channel.guild.ownerId
                ) return;

                const member =
                    await channel.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason: "Guard | Kanal Silme"
                });

                channel.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} kanal sildiği için banlandı.`
                });

            });

            // ROL SİLME

            client.on("roleDelete", async (role) => {

                if (!guardDurum) return;

                const logs =
                    await role.guild.fetchAuditLogs({
                        type: AuditLogEvent.RoleDelete,
                        limit: 1
                    });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (
                    executor.id ===
                    role.guild.ownerId
                ) return;

                const member =
                    await role.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!member) return;

                await member.roles.set([]);

                await member.ban({
                    reason: "Guard | Rol Silme"
                });

                role.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} rol sildiği için banlandı.`
                });

            });

            // BOT EKLEME

            client.on("guildMemberAdd", async (member) => {

                if (!guardDurum) return;

                if (!member.user.bot) return;

                const logs =
                    await member.guild.fetchAuditLogs({
                        type: AuditLogEvent.BotAdd,
                        limit: 1
                    });

                const entry = logs.entries.first();

                if (!entry) return;

                const executor = entry.executor;

                if (
                    executor.id ===
                    member.guild.ownerId
                ) return;

                await member.kick("Guard Sistemi");

                const yetkili =
                    await member.guild.members
                        .fetch(executor.id)
                        .catch(() => null);

                if (!yetkili) return;

                await yetkili.roles.set([]);

                await yetkili.ban({
                    reason: "Guard | İzinsiz Bot"
                });

                member.guild.systemChannel?.send({
                    content:
                        `🚨 ${executor.tag} izinsiz bot eklediği için banlandı.`
                });

            });
        }

        // GUARD KAPAT

        else if (secim === "kapat") {

            guardDurum = false;

            await interaction.reply({
                content: "❌ Guard sistemi kapatıldı."
            });
        }
    }
};
