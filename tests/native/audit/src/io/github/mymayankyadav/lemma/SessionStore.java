package io.github.mymayankyadav.lemma;
public class SessionStore {
 public static class Session{public String url,key,accessToken,ownerId,device="";public long expiresAt;
 public Session(String url,String key,String token,long expires){this.url=url;this.key=key;this.accessToken=token;this.expiresAt=expires;this.ownerId="";}}
 public static Session current;
 public static Session load(android.content.Context context){return current;}
}
