package org.looom;

import javax.crypto.BadPaddingException;
import javax.crypto.IllegalBlockSizeException;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Scanner;
import java.util.stream.Stream;

//TIP 要<b>运行</b>代码，请按 <shortcut actionId="Run"/> 或
// 点击装订区域中的 <icon src="AllIcons.Actions.Execute"/> 图标。
public class Main {
    public static void main(String[] args) {
//        interactiveDecrypt();
//        decryptWebAppFiles();
        getrun();
    }

    private static void getrun() {
        String text = ":de6d69dg58;e25j;47ddd52fe;cf;256e;:6h984fe39hdd22753ece9i447cfg79:64fd534f8548c4iff4cc99547;84efe;h9ieh45c45gc3e787c25d49766763;gd;5j5:243f78777;69c:4;e735fd;g43;9f92jcc7;g4f5734fg2ce67:d35de;3747:;8d5fdef8cdjde88fc4d3i7ecf;j92e65736d5ei9jf696di792hc43d8i3:78c8g2d32;685fd:86:i5g::2h923h24e9;9;;774;8d9i5eg5c45e494;56e28hd55865:i24cg3g5493fhcj9774f5646;cg6;937;822c:3c5;24c5g6;e262f56gci6jeif92:c::h744gd992e8:498229ed4d3cdd9c334f4f;9d;3;e27fj2:94234;:7e6c82::3fh:585fffc53ff2f2:3j4e765g36e33e4ef45j6f876:9g2g;e95234e:;748h33858hec;ie;ed2;f87;78c;dg3jdj2f5g;c;;5j;f4d:g;;7h8ff98id92c8ed56cef4f74cf3;e7;5689578g2:47c58866g88;h87;5ei5:8i6;cgf73:64:;6d2d;h3g8:5gc;23;d;fe653d8e8;2385e37ch87ch6i3e82dg399j7:";
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        for (int i = 0; i < bytes.length; i++) {
            bytes[i] = (byte) (bytes[i] - 2);
        }
        String toaes = new String(bytes);
        gf gf = gf_tools.gf_new();
        String res = gf.b(toaes);
        System.out.println(res);
    }

    private static void interactiveDecrypt() {
        // 使用 try-with-resources 确保 Scanner 被正确关闭
        try (Scanner scanner = new Scanner(System.in)) {
            while (true) {
                System.out.print("--> ");
                if (!scanner.hasNextLine()) break;
                System.out.println("<-- " + dk.a(scanner.nextLine()));
            }
        }
    }

    private static void decryptWebAppFiles() {
        Path sourceDir = Paths.get("assets/webapp");
        Path targetDir = Paths.get("assets/webapp_re");
        gf gfInstance = gf_tools.gf_new();

        // 使用 Files.walk (Stream API) 替代繁琐的 SimpleFileVisitor
        try (Stream<Path> paths = Files.walk(sourceDir)) {
            paths.forEach(file -> {
                Path targetFile = targetDir.resolve(sourceDir.relativize(file));
                try {
                    if (Files.isDirectory(file)) {
                        Files.createDirectories(targetFile);
                        return; // 跳过后续文件逻辑
                    }

                    String fileName = file.getFileName().toString().toLowerCase();
                    // 使用正则简化后缀判断
                    if (fileName.matches(".*\\.(html|js|css)$")) {
                        decryptFile(file, targetFile, gfInstance);
                    } else {
                        Files.copy(file, targetFile, StandardCopyOption.REPLACE_EXISTING);
                    }
                } catch (IOException e) {
                    System.err.println("处理路径时出错 " + file + "：" + e.getMessage());
                }
            });
            System.out.println("文件处理完成！输出目录：" + targetDir.toAbsolutePath());
        } catch (IOException e) {
            System.err.println("目录遍历出错：" + e.getMessage());
        }
    }

    private static void decryptFile(Path sourceFile, Path targetFile, gf gfInstance) {
        try {
            // 直接使用 StandardCharsets.UTF_8 避免抛出 UnsupportedEncodingException
            byte[] decryptedBytes = gfInstance.a(Files.readAllBytes(sourceFile));
            String decryptedStr = new String(decryptedBytes, StandardCharsets.UTF_8);

            if (isHexString(decryptedStr)) {
                decryptedStr = gfInstance.b(decryptedStr);
            }

            Files.write(targetFile, decryptedStr.getBytes(StandardCharsets.UTF_8));
            System.out.println("已解密：" + sourceFile.getFileName());
        } catch (Exception e) {
            System.err.println("解密失败 " + sourceFile + "：" + e.getMessage());
            try {
                Files.copy(sourceFile, targetFile, StandardCopyOption.REPLACE_EXISTING);
                System.out.println("已复制（解密失败）：" + sourceFile.getFileName());
            } catch (IOException ioe) {
                System.err.println("复制失败 " + sourceFile + "：" + ioe.getMessage());
            }
        }
    }

    private static boolean isHexString(String str) {
        // 使用单行正则表达式替代 for 循环遍历字符
        // 注意：保留了原代码中允许 `g, h, G, H` 的逻辑（标准的十六进制只到 f/F）
        return str != null && !str.isEmpty() && str.matches("^[0-9a-hA-H]+$");
    }
}