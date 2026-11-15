package android.content;public class ContentUris {public static android.net.Uri.Builder appendId(android.net.Uri.Builder b,long n){return b.appendPath(String.valueOf(n));}}
