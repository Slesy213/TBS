const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bilgi')
        .setDescription('Kullanıcı bilgilerini ve puanlarını gösterir')
        .addUserOption(option =>
            option.setName('kullanici')
                .setDescription('Bilgisini görmek istediğin kullanıcı')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('kullanici') || interaction.user;
        const guildId = interaction.guild.id;

        // Kullanıcı bilgilerini al
        const member = await interaction.guild.members.fetch(targetUser.id);
        
        // Puan bilgilerini al
        const points = await db.getUserPoints(targetUser.id, guildId);
        const levelData = await db.getUserLevel(targetUser.id, guildId);
        
        const totalPoints = points?.total_points || 0;
        const messagePoints = points?.message_points || 0;
        const voicePoints = points?.voice_points || 0;
        const currentLevel = levelData?.level || 0;
        
        // Bir sonraki level için gereken puan
        const nextLevelPoints = db.getNextLevelPoints(totalPoints);
        const progressText = nextLevelPoints ? 
            `${totalPoints}/${nextLevelPoints} puan` : 
            'Maksimum seviye!';

        // Embed oluştur
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${targetUser.username}#${targetUser.discriminator}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 1024 }))
            .addFields(
                { name: '👤 Kullanıcı Adı', value: targetUser.username, inline: true },
                { name: '🆔 ID', value: `\`${targetUser.id}\``, inline: true },
                { name: '📅 Katılım Tarihi', value: `<t:${Math.floor(member.joinedAt / 1000)}:F>`, inline: false },
                { name: '📊 Seviye', value: `**${currentLevel}**`, inline: true },
                { name: '⭐ Toplam Puan', value: `**${totalPoints}**`, inline: true },
                { name: '📈 Level İlerleme', value: progressText, inline: false },
                { name: '📝 Mesaj Puanı', value: `${messagePoints}`, inline: true },
                { name: '🎤 Ses Puanı', value: `${voicePoints}`, inline: true }
            )
            .setFooter({ 
                text: 'Puan Sistemi • Her mesaj = 1 puan, Her 60sn ses = 5 puan',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTimestamp();

        // Level bar (progress bar) ekle
        if (nextLevelPoints) {
            const progress = Math.floor((totalPoints / nextLevelPoints) * 20);
            const bar = '█'.repeat(progress) + '░'.repeat(20 - progress);
            embed.addFields({ 
                name: '📊 İlerleme', 
                value: `\`${bar}\` ${Math.floor((totalPoints / nextLevelPoints) * 100)}%`, 
                inline: false 
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
