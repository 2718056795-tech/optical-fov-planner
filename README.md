# 3D 视野规划工具 V10

用于 3D 视觉系统的几何选型。面阵结构光支持单目和双目，提供相机与投影视野、共同视野、投影余量和物方像素间距。相机景深可比较三种公式，并按输入的 F 值计算对焦处衍射斑。线激光模式给出激光平面内的梯形视野和测高像素间距。

## 下载与运行

[下载最新版离线 HTML](https://github.com/2718056795-tech/optical-fov-planner/releases/latest/download/optical-fov-planner.html)，保存后用浏览器打开。网页中的界面、视野计算、景深和衍射功能与同一次本地 Windows EXE 构建使用同一份 HTML。两种入口的本地参数记录各自保存，需要交换方案时可以导出和载入 JSON。

[查看发布记录](https://github.com/2718056795-tech/optical-fov-planner/releases)

## 源码与构建

源码在 [V10/代码包](V10/代码包)。在 Windows PowerShell 中运行 `V10/代码包/网页源码/build.ps1` 可生成离线 HTML。完整构建脚本 `V10/代码包/构建全部.ps1` 还会生成内嵌同一页面的 EXE 和源码 ZIP。EXE 构建使用 64 位 .NET Framework C# 编译器和包内 WebView2 SDK。安装 Node.js 后，完整构建会先运行几何回归测试。

- [使用说明](V10/代码包/网页源码/使用说明.md)
- [代码包说明](V10/代码包/代码包说明.md)
- [macOS 风格改版说明](V10/代码包/macOS风格改版说明.md)
- [Microsoft WebView2 SDK 许可与声明](V10/代码包/EXE打包源码/vendor/WebView2)

工具用于粗略选型，计算按当前几何模型与输入条件给出。

