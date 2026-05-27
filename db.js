const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL veya Key bilgisi .env dosyasında tanımlı değil!');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// =========================
// MERKEZİ AYAR YÖNETİCİSİ
// =========================

const settings = {
  autoRoleId: null,
  guardDurum: false,
  guvenliListe: [],
  ticketKategori: null,
  ticketYetkiliRol: null,
  ticketLogKanal: null,
};

// DB sütun adı ↔ settings key eşlemesi
const DB_KEY_MAP = {
  auto_role_id: 'autoRoleId',
  guard_durum: 'guardDurum',
  guvenli_liste: 'guvenliListe',
  ticket_kategori: 'ticketKategori',
  ticket_yetkili_rol: 'ticketYetkiliRol',
  ticket_log_kanal: 'ticketLogKanal',
};

const SETTINGS_KEY_MAP = Object.fromEntries(
  Object.entries(DB_KEY_MAP).map(([db, local]) => [local, db])
);

/**
 * Ayar değerini oku
 * @param {string} key - settings anahtarı (camelCase)
 */
function get(key) {
  return settings[key];
}

/**
 * Ayar değerini sadece local cache'de güncelle (DB'ye yazmaz)
 * @param {string} key - settings anahtarı (camelCase)
 * @param {*} value
 */
function set(key, value) {
  if (key in settings) {
    settings[key] = value;
  }
}

/**
 * Supabase'den ayarları yükle
 */
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
      settings.autoRoleId = data.auto_role_id;
      settings.guardDurum = data.guard_durum;
      settings.guvenliListe = Array.isArray(data.guvenli_liste) ? data.guvenli_liste : [];
      settings.ticketKategori = data.ticket_kategori;
      settings.ticketYetkiliRol = data.ticket_yetkili_rol;
      settings.ticketLogKanal = data.ticket_log_kanal;
      console.log('🛡️ Ayarlar Supabase üzerinden başarıyla yüklendi.');
    } else {
      console.log('ℹ️ Supabase üzerinde settings tablosunda kayıt bulunamadı. Lütfen SQL editöründen varsayılan satırı eklediğinizden emin olun.');
    }
  } catch (err) {
    console.error('❌ Supabase bağlantı hatası:', err);
  }
}

/**
 * Tek bir ayarı hem local cache'de hem Supabase'de güncelle
 * @param {string} column - DB sütun adı (snake_case)
 * @param {*} value
 */
async function updateSetting(column, value) {
  // Local cache'i güncelle
  const localKey = DB_KEY_MAP[column];
  if (localKey) {
    settings[localKey] = value;
  }

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

/**
 * Birden fazla ayarı hem local cache'de hem Supabase'de güncelle
 * @param {Object} settingsObj - { db_column: value, ... }
 */
async function updateSettings(settingsObj) {
  // Local cache'i güncelle
  for (const [column, value] of Object.entries(settingsObj)) {
    const localKey = DB_KEY_MAP[column];
    if (localKey) {
      settings[localKey] = value;
    }
  }

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
  settings: { get, set },
  loadSettings,
  updateSetting,
  updateSettings,
};
