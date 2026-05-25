const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sunucu')
        .setDescription('Sunucu bilgilerini gösterir'),

    async execute(interaction) {

        const guild = interaction.guild;

        const owner = await guild.fetchOwner();

        const embed = new EmbedBuilder()
            .setColor('Blue')
            .setTitle(`${guild.name} | Sunucu Bilgileri`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                {
                    name: '👑 Sunucu Sahibi',
                    value: `${owner.user}`,
                    inline: false
                },
                {
                    name: '🆔 Sunucu ID',
                    value: `${guild.id}`,
                    inline: false
                },
                {
                    name: '📅 Oluşturulma Tarihi',
                    value: `<t:${parseInt(guild.createdTimestamp / 1000)}:D>`,
                    inline: false
                },
                {
                    name: '📝 Kanal Sayısı',
                    value: `${guild.channels.cache.size}`,
                    inline: false
                },
                {
                    name: '👥 Üye Sayısı',
                    value: `${guild.memberCount}`,
                    inline: false
                },
                {
                    name: '🎉 Rol Sayısı',
                    value: `${guild.roles.cache.size}`,
                    inline: false
                },
                {
                    name: '💎 Boost Sayısı',
                    value: `${guild.premiumSubscriptionCount}`,
                    inline: false
                }
            )
            .setFooter({
                text: `${interaction.user.username} tarafından istendi`
            })
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};