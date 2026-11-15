package io.github.mymayankyadav.lemma;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/**
 * N123 · N2 the copy of the signed-in session that lock-screen actions use: the Supabase URL, the publishable key and
 * the current access token (about an hour), encrypted with an AES-GCM key that never leaves the Android Keystore.
 * Cleared on sign-out. The refresh token stays in the web layer only (see auth.ts).
 */
public final class SessionStore {
    private static final String PREFS = "lemma.session";
    private static final String KEY_ALIAS = "lemma.session.v1";

    public static final class Session {
        public final String url, key, accessToken, ownerId, device;
        public final long expiresAt;
        public Session(String url, String key, String accessToken, long expiresAt) {
            this(url,key,accessToken,expiresAt,"","");
        }
        public Session(String url,String key,String accessToken,long expiresAt,String ownerId,String device) {
            this.url = url; this.key = key; this.accessToken = accessToken; this.expiresAt = expiresAt; this.ownerId=ownerId;this.device=device;
        }
    }

    private SessionStore() {}

    private static SecretKey secret() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    public static void save(Context context, Session session) {
        try {
            String plain = new JSONObject().put("url", session.url).put("key", session.key)
                .put("device",session.device).put("ownerId",session.ownerId).put("accessToken", session.accessToken).put("expiresAt", session.expiresAt).toString();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, secret());
            byte[] sealed = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
            prefs(context).edit()
                .putString("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString("data", Base64.encodeToString(sealed, Base64.NO_WRAP))
                .apply();
        } catch (Exception e) {
            clear(context);
        }
    }

    public static Session load(Context context) {
        SharedPreferences prefs = prefs(context);
        String iv = prefs.getString("iv", null), data = prefs.getString("data", null);
        if (iv == null || data == null) return null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, secret(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            JSONObject json = new JSONObject(new String(cipher.doFinal(Base64.decode(data, Base64.NO_WRAP)), StandardCharsets.UTF_8));
            String owner=json.optString("ownerId","");
            if(owner.isEmpty())try{
                String payload=json.getString("accessToken").split("\\.")[1];
                owner=new JSONObject(new String(Base64.decode(payload,Base64.URL_SAFE),StandardCharsets.UTF_8)).optString("sub","");
            }catch(Exception legacyToken){/* An unidentified queue stays retained, never assigned to another account. */}
            return new Session(json.getString("url"), json.getString("key"), json.getString("accessToken"), json.getLong("expiresAt"),owner,json.optString("device",""));
        } catch (Exception e) {
            return null;
        }
    }

    public static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
