package com.google.firebase.messaging;
public class FirebaseMessagingService extends android.content.Context {
 public android.content.Context context;
 public void onMessageReceived(RemoteMessage message){}public void onNewToken(String token){}
 public android.content.SharedPreferences getSharedPreferences(String n,int m){return context.getSharedPreferences(n,m);}
 public Object getSystemService(String n){return context.getSystemService(n);}
 public java.io.File getCacheDir(){return context.getCacheDir();}
 public android.content.ContentResolver getContentResolver(){return context.getContentResolver();}
}
