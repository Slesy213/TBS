const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('liderlik')
        .setDescription('Sunucudaki puan liderlik tablosunu gösterir')
        .addIntegerOption(option =>
            option.setName('sayi')
                .setDescription('Kaç kişi gösterilsin? (1-20)')
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const limit = interaction.options.getInteger('sayi') || 10;
        const guildId = interaction.guild.id;

        const leaderboard = await db.getLeaderboard(guildId, limit);

        if (!leaderboard || leaderboard.length === 0) {
            return await interaction.editReply('📊 Henüz hiç puan verisi yok!');
        }

        let description = '';
        let rankEmojis = ['🥇', '🥈', '🥉'];

        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const rankEmoji = rankEmojis[i] || `${i + 1}.`;
            
            try {
                const user = await interaction.client.users.fetch(entry.user_id);
                const level = db.calculateLevel(entry.total_points || 0);
                const rank = db.getRank(entry.total_points || 0);
                
                description += `${rankEmoji} **${user.username}** — ${entry.total_points} ⭐ | Level ${level} ${rank.emoji}\n`;
            } catch {
                description += `${rankEmoji} **Bilinmeyen Kullanıcı** — ${entry.total_points} ⭐\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#FFB6C1') // Açık pembe
            .setTitle('🏆 Liderlik Tablosu')
            .setDescription(description)
            .setFooter({ 
                text: `${interaction.guild.name} • Toplam ${leaderboard.length} kullanıcı • ${new Date().toLocaleString('tr-TR')}` 
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
