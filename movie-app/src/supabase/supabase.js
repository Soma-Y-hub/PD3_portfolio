import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Supabaseの環境変数が設定されていません。.envを確認してください。"
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);