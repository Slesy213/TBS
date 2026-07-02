const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bilgi')
        .setDescription('Kullanıcı bilgilerini ve tüm istatistikleri gösterir')
        .addUserOption(option =>
            option.setName('kullanici')
                .setDescription('Bilgisini görmek istediğin kullanıcı')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('kullanici') || interaction.user;
        const guildId = interaction.guild.id;

        const member = await interaction.guild.members.fetch(targetUser.id);
        const points = await db.getUserPoints(targetUser.id, guildId);
        const levelData = await db.getUserLevel(targetUser.id, guildId);
        
        const totalPoints = points?.total_points || 0;
        const messagePoints = points?.message_points || 0;
        const voicePoints = points?.voice_points || 0;
        const currentLevel = levelData?.level || 0;
        
        const nextLevelPoints = db.getNextLevelPoints(totalPoints);
        const progressText = nextLevelPoints ? 
            `${totalPoints}/${nextLevelPoints} puan` : 
            'Maksimum seviye!';

        const progressPercent = nextLevelPoints ? 
            Math.floor((totalPoints / nextLevelPoints) * 100) : 100;

        const rank = db.getRank(totalPoints);

        const embed = new EmbedBuilder()
            .setColor('#FFB6C1')
            .setTitle(`📊 ${targetUser.username}#${targetUser.discriminator}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
            .setDescription([
                `> **${targetUser.username}** kullanıcısının istatistikleri`,
                `> ${rank.emoji} **Rütbe:** ${rank.name}`,
                `> 📅 **Katılım:** <t:${Math.floor(member.joinedAt / 1000)}:F>`
            ].join('\n'))
            .addFields(
                { 
                    name: '───────────────────', 
                    value: '```css\n[ TEMEL BİLGİLER ]\n```', 
                    inline: false 
                },
                { 
                    name: '🆔 Kullanıcı ID', 
                    value: `\`${targetUser.id}\``, 
                    inline: true 
                },
                { 
                    name: '📊 Seviye', 
                    value: `**${currentLevel}**`, 
                    inline: true 
                },
                { 
                    name: '⭐ Toplam Puan', 
                    value: `**${totalPoints}**`, 
                    inline: true 
                },
                { 
                    name: '───────────────────', 
                    value: '```css\n[ PUAN DAĞILIMI ]\n```', 
                    inline: false 
                },
                { 
                    name: '📝 Mesaj Puanı', 
                    value: `\`${messagePoints}\``, 
                    inline: true 
                },
                { 
                    name: '🎤 Ses Puanı', 
                    value: `\`${voicePoints}\``, 
                    inline: true 
                },
                { 
                    name: '🎯 Toplam Puan', 
                    value: `\`${totalPoints}\``, 
                    inline: true 
                },
                { 
                    name: '───────────────────', 
                    value: '```css\n[ LEVEL İLERLEME ]\n```', 
                    inline: false 
                },
                { 
                    name: '📈 İlerleme', 
                    value: progressText, 
                    inline: true 
                },
                { 
                    name: '📊 Yüzde', 
                    value: `${progressPercent}%`, 
                    inline: true 
                }
            )
            .setFooter({ 
                text: `Puan Sistemi • Her mesaj = 1 puan, Her 60sn ses = 5 puan • ${new Date().toLocaleString('tr-TR')}`,
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        if (nextLevelPoints) {
            const barLength = 20;
            const filled = Math.floor((totalPoints / nextLevelPoints) * barLength);
            const bar = '🟪'.repeat(filled) + '⬜'.repeat(barLength - filled);
            embed.addFields({
                name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
                value: `\`${bar}\` **${progressPercent}%**`,
                inline: false
            });
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_stats')
                    .setLabel('🔄 Yenile')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('leaderboard_go')
                    .setLabel('🏆 Liderlik')
                    .setStyle(ButtonStyle.Primary)
            );

        await interaction.editReply({ 
            embeds: [embed],
            components: [row]
        });
    },

    async handleButton(interaction) {
        if (interaction.customId === 'refresh_stats') {
            const title = interaction.message.embeds[0]?.title || '';
            const username = title.replace('📊 ', '').split('#')[0];
            if (!username) return;
            
            const user = await interaction.client.users.fetch(username).catch(() => null);
            if (!user) return;

            const guildId = interaction.guild.id;
            const points = await db.getUserPoints(user.id, guildId);
            const levelData = await db.getUserLevel(user.id, guildId);
            
            const totalPoints = points?.total_points || 0;
            const messagePoints = points?.message_points || 0;
            const voicePoints = points?.voice_points || 0;
            const currentLevel = levelData?.level || 0;
            
            const nextLevelPoints = db.getNextLevelPoints(totalPoints);
            const progressPercent = nextLevelPoints ? 
                Math.floor((totalPoints / nextLevelPoints) * 100) : 100;
            const rank = db.getRank(totalPoints);
            const member = await interaction.guild.members.fetch(user.id);

            const embed = new EmbedBuilder()
                .setColor('#FFB6C1')
                .setTitle(`📊 ${user.username}#${user.discriminator}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .setDescription([
                    `> **${user.username}** kullanıcısının istatistikleri`,
                    `> ${rank.emoji} **Rütbe:** ${rank.name}`,
                    `> 📅 **Katılım:** <t:${Math.floor(member.joinedAt / 1000)}:F>`
                ].join('\n'))
                .addFields(
                    { name: '───────────────────', value: '```css\n[ TEMEL BİLGİLER ]\n```', inline: false },
                    { name: '🆔 Kullanıcı ID', value: `\`${user.id}\``, inline: true },
                    { name: '📊 Seviye', value: `**${currentLevel}**`, inline: true },
                    { name: '⭐ Toplam Puan', value: `**${totalPoints}**`, inline: true },
                    { name: '───────────────────', value: '```css\n[ PUAN DAĞILIMI ]\n```', inline: false },
                    { name: '📝 Mesaj Puanı', value: `\`${messagePoints}\``, inline: true },
                    { name: '🎤 Ses Puanı', value: `\`${voicePoints}\``, inline: true },
                    { name: '🎯 Toplam Puan', value: `\`${totalPoints}\``, inline: true },
                    { name: '───────────────────', value: '```css\n[ LEVEL İLERLEME ]\n```', inline: false },
                    { name: '📈 İlerleme', value: nextLevelPoints ? `${totalPoints}/${nextLevelPoints} puan` : 'Maksimum seviye!', inline: true },
                    { name: '📊 Yüzde', value: `${progressPercent}%`, inline: true }
                )
                .setFooter({ 
                    text: `Puan Sistemi • Her mesaj = 1 puan, Her 60sn ses = 5 puan • ${new Date().toLocaleString('tr-TR')}`,
                    iconURL: interaction.client.user.displayAvatarURL()
                })
                .setTimestamp();

            if (nextLevelPoints) {
                const barLength = 20;
                const filled = Math.floor((totalPoints / nextLevelPoints) * barLength);
                const bar = '🟪'.repeat(filled) + '⬜'.repeat(barLength - filled);
                embed.addFields({
                    name: '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
                    value: `\`${bar}\` **${progressPercent}%**`,
                    inline: false
                });
            }

            await interaction.update({ embeds: [embed] });
        }
        
        if (interaction.customId === 'leaderboard_go') {
            const command = interaction.client.commands.get('liderlik');
            if (command) {
                await command.execute(interaction);
            }
        }
    }
};
