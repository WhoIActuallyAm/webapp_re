package org.looom;

import java.nio.charset.StandardCharsets;
import java.util.Base64;


public final class dk {
    public static String a(String str) {
        return new dk().a(str, "UTF-8");
    }

    public String a(String str, String str2) {
        byte[] decodedBytes = Base64.getDecoder().decode(str);
        byte[] processedBytes = a(decodedBytes, str2);
        return new String(processedBytes, StandardCharsets.UTF_8);
    }

    private static byte[] a(byte[] bArr, String str) {
        int length = bArr.length;
        int length2 = str.length();
        int i = 0;
        int i2 = 0;
        while (i < length) {
            if (i2 >= length2) {
                i2 = 0;
            }
            bArr[i] = (byte) (bArr[i] ^ str.charAt(i2));
            i++;
            i2++;
        }
        return bArr;
    }
}
