const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL veya Key bilgisi .env dosyasında tanımlı değil!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function loadSettings() {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      console.error('❌ Supabase ayarları yüklenirken hata oluştu:', error.message);
      return;
    }

    if (data) {
      global.autoRoleId = data.auto_role_id;
      global.guardDurum = data.guard_durum;
      global.guvenliListe = Array.isArray(data.guvenli_liste) ? data.guvenli_liste : [];
      global.ticketKategori = data.ticket_kategori;
      global.ticketYetkiliRol = data.ticket_yetkili_rol;
      global.ticketLogKanal = data.ticket_log_kanal;
      console.log('🛡️ Ayarlar Supabase üzerinden başarıyla yüklendi.');
    } else {
      console.log('ℹ️ Supabase üzerinde settings tablosunda kayıt bulunamadı. Lütfen SQL editöründen varsayılan satırı eklediğinizden emin olun.');
    }
  } catch (err) {
    console.error('❌ Supabase bağlantı hatası:', err);
  }
}


async function updateSetting(column, value) {
  try {
    const { error } = await supabase
      .from('settings')
      .update({ [column]: value })
      .eq('id', 1);

    if (error) {
      console.error(`❌ Supabase güncellenirken hata oluştu (${column}):`, error.message);
    }
  } catch (err) {
    console.error(`❌ Supabase güncelleme hatası (${column}):`, err);
  }
}


async function updateSettings(settingsObj) {
  try {
    const { error } = await supabase
      .from('settings')
      .update(settingsObj)
      .eq('id', 1);

    if (error) {
      console.error(`❌ Supabase toplu güncellenirken hata oluştu:`, error.message);
    }
  } catch (err) {
    console.error(`❌ Supabase toplu güncelleme hatası:`, err);
  }
}

module.exports = {
  supabase,
  loadSettings,
  updateSetting,
  updateSettings
};
