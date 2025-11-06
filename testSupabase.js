import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const testConnection = async () => {
  console.log("🔍 Testing Supabase connection...");
  const { data, error } = await supabase.from('config').select('*');
  if (error) {
    console.error('❌ Connection failed:', error.message);
  } else {
    console.log('✅ Supabase connected successfully!');
    console.log('Config table data:', data);
  }
};

testConnection();

