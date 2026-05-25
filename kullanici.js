const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kullanici')
        .setDescription('Kullanıcı bilgilerini gösterir')
        .addUserOption(option =>
            option
                .setName('kisi')
                .setDescription('Bilgisi gösterilecek kişi')
                .setRequired(false)
        ),

    async execute(interaction) {

        const member =
            interaction.options.getMember('kisi') ||
            interaction.member;

        const user = member.user;

        const embed = new EmbedBuilder()
            .setColor('Purple')
            .setTitle(`${user.username} Kullanıcı Bilgileri`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 Kullanıcı Adı',
                    value: `${user.tag}`,
                    inline: true
                },
                {
                    name: '🆔 Kullanıcı ID',
                    value: `${user.id}`,
                    inline: true
                },
                {
                    name: '🤖 Bot mu?',
                    value: user.bot ? 'Evet' : 'Hayır',
                    inline: true
                },
                {
                    name: '📅 Discord Hesap Oluşturma',
                    value: `<t:${parseInt(user.createdTimestamp / 1000)}:D>`,
                    inline: false
                },
                {
                    name: '📥 Sunucuya Katılma Tarihi',
                    value: `<t:${parseInt(member.joinedTimestamp / 1000)}:D>`,
                    inline: false
                },
                {
                    name: '🎭 En Yüksek Rol',
                    value: `${member.roles.highest}`,
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