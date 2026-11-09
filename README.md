# 3D 视野规划工具 V10

用于 3D 视觉系统的几何选型。面阵结构光支持单目和双目，计算相机视野、投影画幅、共同视野、投影余量和物方像素间距。线激光模式给出激光平面内的梯形视野和测高像素间距。

## 下载与运行

从本仓库的 [Releases](../../releases) 下载 V10 的 Windows x64 EXE，双击运行。Windows 入口使用 Microsoft Edge WebView2 Runtime。离线 HTML 可直接用浏览器打开。

## 源码与构建

源码在 [V10/代码包](V10/代码包)。在 Windows 上执行其中的 `构建全部.ps1`，会重新生成单文件 HTML、内嵌该页面的 EXE 和源码 ZIP。EXE 构建使用 64 位 .NET Framework C# 编译器及包内 WebView2 SDK 文件。安装 Node.js 后，构建会先运行几何回归测试。

- [使用说明](V10/代码包/网页源码/使用说明.md)
- [代码包说明](V10/代码包/代码包说明.md)
- [macOS 风格改版说明](V10/代码包/macOS风格改版说明.md)
- [Microsoft WebView2 SDK 许可与声明](V10/代码包/EXE打包源码/vendor/WebView2)

工具用于粗略选型，计算按当前几何模型与输入条件给出。

