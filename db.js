require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

// .env bilgilerini al
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Kontrol
if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase URL veya Key bilgisi .env dosyasında tanımlı değil!');
}

// Supabase bağlantısı
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Supabase üzerindeki tüm sunucu ayarlarını global Map nesnelerine yükler.
 */
async function loadSettings() {
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('*');

        if (error) {
            console.error('❌ Supabase ayarları yüklenirken hata oluştu:', error.message);
            return;
        }

        if (data && data.length > 0) {
            for (const row of data) {
                const guildId = row.guild_id;

                if (guildId) {
                    global.autoRoles.set(guildId, row.auto_role_id);
                    global.guardDurums.set(guildId, row.guard_durum);
                    global.guvenliListes.set(
                        guildId,
                        Array.isArray(row.guvenli_liste) ? row.guvenli_liste : []
                    );
                    global.ticketKategoris.set(guildId, row.ticket_kategori);
                    global.ticketYetkiliRols.set(guildId, row.ticket_yetkili_rol);
                    global.ticketLogKanals.set(guildId, row.ticket_log_kanal);
                    global.guardSettings.set(guildId, row.guard_settings || {});
                }
            }

            console.log(`🛡️ Ayarlar Supabase üzerinden ${data.length} sunucu için başarıyla yüklendi.`);
        } else {
            console.log('ℹ️ Supabase üzerinde settings tablosunda kayıtlı sunucu bulunamadı.');
        }

    } catch (err) {
        console.error('❌ Supabase bağlantı hatası:', err);
    }
}

// ==========================================
// ⭐ LEVEL HESAPLAMA SİSTEMİ
// ==========================================

/**
 * Puana göre level hesapla
 */
function calculateLevel(points) {
    const levelMap = [
        { minPoints: 0, level: 0 },
        { minPoints: 25, level: 1 },
        { minPoints: 50, level: 2 },
        { minPoints: 75, level: 3 },
        { minPoints: 100, level: 4 },
        { minPoints: 150, level: 5 },
        { minPoints: 200, level: 6 },
        { minPoints: 500, level: 7 },
        { minPoints: 1000, level: 8 },
        { minPoints: 2000, level: 9 },
        { minPoints: 5000, level: 10 },
        { minPoints: 10000, level: 11 },
        { minPoints: 20000, level: 12 },
        { minPoints: 35000, level: 13 },
        { minPoints: 50000, level: 14 },
        { minPoints: 100000, level: 99 }
    ];

    let currentLevel = 0;
    for (const entry of levelMap) {
        if (points >= entry.minPoints) {
            currentLevel = entry.level;
        } else {
            break;
        }
    }
    return currentLevel;
}

/**
 * Bir sonraki level için gereken puanı hesapla
 */
function getNextLevelPoints(points) {
    const levelMap = [
        { minPoints: 0, level: 0 },
        { minPoints: 25, level: 1 },
        { minPoints: 50, level: 2 },
        { minPoints: 75, level: 3 },
        { minPoints: 100, level: 4 },
        { minPoints: 150, level: 5 },
        { minPoints: 200, level: 6 },
        { minPoints: 500, level: 7 },
        { minPoints: 1000, level: 8 },
        { minPoints: 2000, level: 9 },
        { minPoints: 5000, level: 10 },
        { minPoints: 10000, level: 11 },
        { minPoints: 20000, level: 12 },
        { minPoints: 35000, level: 13 },
        { minPoints: 50000, level: 14 },
        { minPoints: 100000, level: 99 }
    ];

    const currentLevel = calculateLevel(points);
    
    for (const entry of levelMap) {
        if (entry.level > currentLevel) {
            return entry.minPoints;
        }
    }
    return null; // Max level
}

// ==========================================
// ⭐ PUAN SİSTEMİ FONKSİYONLARI
// ==========================================

/**
 * Kullanıcı bilgilerini güncelle veya ekle
 */
async function updateUserInfo(user, guildId) {
    try {
        const { error } = await supabase
            .from('users')
            .upsert({
                id: user.id,
                username: user.username,
                discriminator: user.discriminator || '0',
                avatar: user.avatar,
                joined_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('❌ Kullanıcı bilgisi güncellenirken hata:', err);
        return false;
    }
}

/**
 * Kullanıcı puanlarını getir
 */
async function getUserPoints(userId, guildId) {
    try {
        const { data, error } = await supabase
            .from('points')
            .select('*')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .maybeSingle();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error('❌ Puan bilgisi alınırken hata:', err);
        return null;
    }
}

/**
 * Kullanıcı puanlarını güncelle
 */
async function updateUserPoints(userId, guildId, pointsData) {
    try {
        const { error } = await supabase
            .from('points')
            .upsert({
                user_id: userId,
                guild_id: guildId,
                ...pointsData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('❌ Puan güncellenirken hata:', err);
        return false;
    }
}

/**
 * Kullanıcı level bilgisini getir
 */
async function getUserLevel(userId, guildId) {
    try {
        const { data, error } = await supabase
            .from('levels')
            .select('*')
            .eq('user_id', userId)
            .eq('guild_id', guildId)
            .maybeSingle();

        if (error) throw error;
        return data || { level: 0, xp: 0 };
    } catch (err) {
        console.error('❌ Level bilgisi alınırken hata:', err);
        return { level: 0, xp: 0 };
    }
}

/**
 * Kullanıcı levelini güncelle
 */
async function updateUserLevel(userId, guildId, levelData) {
    try {
        const { error } = await supabase
            .from('levels')
            .upsert({
                user_id: userId,
                guild_id: guildId,
                ...levelData,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

        if (error) throw error;
        return true;
    } catch (err) {
        console.error('❌ Level güncellenirken hata:', err);
        return false;
    }
}

/**
 * Top liderlik tablosunu getir
 */
async function getLeaderboard(guildId, limit = 10) {
    try {
        const { data, error } = await supabase
            .from('points')
            .select('user_id, total_points, message_points, voice_points')
            .eq('guild_id', guildId)
            .order('total_points', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('❌ Liderlik tablosu alınırken hata:', err);
        return [];
    }
}

/**
 * Mesaj puanı ekle (spam korumalı)
 */
async function addMessagePoint(userId, guildId) {
    const now = Date.now();
    const points = await getUserPoints(userId, guildId);

    if (!points) {
        // İlk mesaj
        await updateUserPoints(userId, guildId, {
            message_points: 1,
            total_points: 1,
            last_message_time: now
        });
        return { added: true, total: 1 };
    }

    const timeDiff = (now - (points.last_message_time || 0)) / 1000;

    if (timeDiff >= 10) { // 10 saniye spam koruması
        const newMessagePoints = (points.message_points || 0) + 1;
        const newTotal = (points.total_points || 0) + 1;

        await updateUserPoints(userId, guildId, {
            message_points: newMessagePoints,
            total_points: newTotal,
            last_message_time: now
        });

        return { added: true, total: newTotal };
    }

    return { added: false, total: points.total_points || 0 };
}

/**
 * Ses puanı ekle (her 60 saniye = 5 puan)
 */
async function addVoicePoints(userId, guildId, duration) {
    const pointsToAdd = Math.floor(duration / 60) * 5;
    
    if (pointsToAdd <= 0) return { added: false, points: 0 };

    const points = await getUserPoints(userId, guildId);

    if (!points) {
        await updateUserPoints(userId, guildId, {
            voice_points: pointsToAdd,
            total_points: pointsToAdd,
            voice_accumulated: pointsToAdd
        });
        return { added: true, points: pointsToAdd };
    }

    const newVoicePoints = (points.voice_points || 0) + pointsToAdd;
    const newTotal = (points.total_points || 0) + pointsToAdd;

    await updateUserPoints(userId, guildId, {
        voice_points: newVoicePoints,
        total_points: newTotal,
        voice_accumulated: (points.voice_accumulated || 0) + pointsToAdd
    });

    return { added: true, points: pointsToAdd };
}

/**
 * Level kontrolü ve güncelleme - SENİN VERDİĞİN LEVEL SİSTEMİNE GÖRE
 */
async function checkAndUpdateLevel(userId, guildId, totalPoints) {
    const newLevel = calculateLevel(totalPoints);
    const currentLevelData = await getUserLevel(userId, guildId);
    const currentLevel = currentLevelData?.level || 0;

    if (newLevel > currentLevel) {
        // Level atladı!
        await updateUserLevel(userId, guildId, {
            level: newLevel,
            xp: totalPoints
        });
        return { leveledUp: true, oldLevel: currentLevel, newLevel: newLevel, points: totalPoints };
    }

    // Level değişmedi ama XP güncellenebilir
    await updateUserLevel(userId, guildId, {
        level: currentLevel,
        xp: totalPoints
    });

    return { leveledUp: false, oldLevel: currentLevel, newLevel: currentLevel, points: totalPoints };
}

// ==========================================
// TEK AYAR GÜNCELLEME
// ==========================================

/**
 * Tek ayar güncelle
 */
async function updateSetting(guildId, column, value) {
    if (!guildId) return;

    try {
        const { error } = await supabase
            .from('settings')
            .upsert(
                { guild_id: guildId, [column]: value },
                { onConflict: 'guild_id' }
            );

        if (error) {
            console.error(
                `❌ Supabase güncellenirken hata oluştu (Guild: ${guildId}, ${column}):`,
                error.message
            );
        }

    } catch (err) {
        console.error(
            `❌ Supabase güncelleme hatası (Guild: ${guildId}, ${column}):`,
            err
        );
    }
}

/**
 * Toplu ayar güncelle
 */
async function updateSettings(guildId, settingsObj) {
    if (!guildId) return;

    try {
        const { error } = await supabase
            .from('settings')
            .upsert(
                { guild_id: guildId, ...settingsObj },
                { onConflict: 'guild_id' }
            );

        if (error) {
            console.error(
                `❌ Supabase toplu güncellenirken hata oluştu (Guild: ${guildId}):`,
                error.message
            );
        }

    } catch (err) {
        console.error(
            `❌ Supabase toplu güncelleme hatası (Guild: ${guildId}):`,
            err
        );
    }
}

module.exports = {
    supabase,
    loadSettings,
    updateSetting,
    updateSettings,
    // Puan sistemi fonksiyonları
    updateUserInfo,
    getUserPoints,
    updateUserPoints,
    getUserLevel,
    updateUserLevel,
    getLeaderboard,
    addMessagePoint,
    addVoicePoints,
    checkAndUpdateLevel,
    calculateLevel,
    getNextLevelPoints
};
