const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL veya Key bilgisi .env dosyasında tanımlı değil!');
}

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
          global.guvenliListes.set(guildId, Array.isArray(row.guvenli_liste) ? row.guvenli_liste : []);
          global.ticketKategoris.set(guildId, row.ticket_kategori);
          global.ticketYetkiliRols.set(guildId, row.ticket_yetkili_rol);
          global.ticketLogKanals.set(guildId, row.ticket_log_kanal);
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

/**
 * Belirli bir sunucunun tek bir ayarını günceller veya ekler (upsert).
 */
async function updateSetting(guildId, column, value) {
  if (!guildId) return;
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ guild_id: guildId, [column]: value }, { onConflict: 'guild_id' });

    if (error) {
      console.error(`❌ Supabase güncellenirken hata oluştu (Guild: ${guildId}, ${column}):`, error.message);
    }
  } catch (err) {
    console.error(`❌ Supabase güncelleme hatası (Guild: ${guildId}, ${column}):`, err);
  }
}

/**
 * Belirli bir sunucunun birden fazla ayarını toplu günceller veya ekler (upsert).
 */
async function updateSettings(guildId, settingsObj) {
  if (!guildId) return;
  try {
    const { error } = await supabase
      .from('settings')
      .upsert({ guild_id: guildId, ...settingsObj }, { onConflict: 'guild_id' });

    if (error) {
      console.error(`❌ Supabase toplu güncellenirken hata oluştu (Guild: ${guildId}):`, error.message);
    }
  } catch (err) {
    console.error(`❌ Supabase toplu güncelleme hatası (Guild: ${guildId}):`, err);
  }
}

module.exports = {
  supabase,
  loadSettings,
  updateSetting,
  updateSettings
};
