package org.looom;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.Scanner;
import java.util.stream.Stream;

//TIP 要<b>运行</b>代码，请按 <shortcut actionId="Run"/> 或
// 点击装订区域中的 <icon src="AllIcons.Actions.Execute"/> 图标。
public class Main {
    public static void main(String[] args) {
//        interactiveDecrypt();
        decryptWebAppFiles();
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