package org.looom;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.spec.SecretKeySpec;
import java.io.UnsupportedEncodingException;
import java.security.Key;

public class gf {
    public static int a = 18;
    public static String b = "DES/ECB/PKCS5Padding";
    private Cipher c;
    private Cipher d;

    public gf(String str) {
        this.c = null;
        this.d = null;
        try {
            Key keyB = b(str.getBytes("UTF-8"));
            Cipher cipher = Cipher.getInstance(b);
            this.c = cipher;
            cipher.init(1, keyB);
            Cipher cipher2 = Cipher.getInstance(b);
            this.d = cipher2;
            cipher2.init(2, keyB);
        } catch (Exception e) {
        }
    }

    public static byte[] a(String str) throws UnsupportedEncodingException {
        byte[] bytes = str.getBytes("UTF-8");
        int length = bytes.length;
        byte[] bArr = new byte[length / 2];
        for (int i = 0; i < length; i += 2) {
            bArr[i / 2] = (byte) Integer.parseInt(new String(bytes, i, 2), a);
        }
        return bArr;
    }

    public byte[] a(byte[] bArr) throws IllegalBlockSizeException, BadPaddingException {
        return this.d.doFinal(bArr);
    }

    public String b(String str) throws UnsupportedEncodingException, IllegalBlockSizeException, BadPaddingException {
        return new String(a(a(str)), "UTF-8");
    }

    private Key b(byte[] bArr) {
        byte[] bArr2 = new byte[8];
        for (int i = 0; i < bArr.length && i < 8; i++) {
            bArr2[i] = bArr[i];
        }
        return new SecretKeySpec(bArr2, b.split("/")[0]);
    }
}

class gf_tools{
    private String s(String str) {
        //<meta-data
        //     android:name="whole"
        //     android:value="false"/>
        // <meta-data
        //     android:name="level"
        //     android:value="false"/>
        // <meta-data
        //     android:name="serve"
        //     android:value="setphp"/>
        // <meta-data
        //     android:name="main"
        //     android:value="hzxqff"/>
        // <meta-data
        //     android:name="sign"
        //     android:value=""/>
//        try {
//            ApplicationInfo applicationInfo = getPackageManager().getApplicationInfo(getPackageName(), 128);
//            if (applicationInfo != null && ((PackageItemInfo) applicationInfo).metaData != null) {
//                return ((PackageItemInfo) applicationInfo).metaData.get(str).toString();
//            }
//        } catch (Exception e) {
//        }
//        return null;
        return "hzxqff";
    }
    public static String d(String str) {
        StringBuilder sb = new StringBuilder();
        for (char c : str.toCharArray()) {
            if (c >= 'a' && c <= 'z') {
                c = (char) (122 - (c - 'a'));
            }
            sb.append(c);
        }
        StringBuilder sb2 = new StringBuilder();
        for (char c2 : sb.toString().toCharArray()) {
            if (c2 >= 'a' && c2 <= 'z') {
                c2 = (char) (((((c2 - 'a') - 3) + 26) % 26) + 97);
            }
            sb2.append(c2);
        }
        return sb2.toString();
    }
    public static gf gf_new(){
        return new gf("bzyapp");
    }
}