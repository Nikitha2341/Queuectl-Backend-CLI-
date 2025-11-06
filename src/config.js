const { supabase } = require('./db');

class Config {
  async get(key) {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to get config: ${error.message}`);
    }

    return data ? data.value : null;
  }

  async set(key, value) {
    const { data, error } = await supabase
      .from('config')
      .upsert({
        key,
        value: String(value),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to set config: ${error.message}`);
    }

    return data;
  }

  async getAll() {
    const { data, error } = await supabase
      .from('config')
      .select('*')
      .order('key');

    if (error) {
      throw new Error(`Failed to get all config: ${error.message}`);
    }

    return data;
  }
}

module.exports = { Config };
