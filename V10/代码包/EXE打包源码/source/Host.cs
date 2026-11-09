using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("3D视野规划工具")]
[assembly: AssemblyDescription("保留原页面与绘图的离线单文件桌面版")]
[assembly: AssemblyVersion("10.0.0.0")]
[assembly: AssemblyFileVersion("10.0.0.0")]

internal static class Program
{
    internal static string StorageRoot;
    internal static string Assets;
    internal static string VerifyRoot;
    internal static int VerifyPort;
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)]
    private static extern IntPtr LoadLibrary(string path);
    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern bool SetProcessDpiAwarenessContext(IntPtr context);
    private static void EnableDpiAwareness(){try{if(SetProcessDpiAwarenessContext(new IntPtr(-4)))return;}catch(EntryPointNotFoundException){}SetProcessDPIAware();}

    [STAThread]
    private static void Main(string[] args)
    {
        foreach (string arg in args)
        {
            if (arg.StartsWith("--verify-root=")) VerifyRoot = Path.GetFullPath(arg.Substring(14));
            if (arg.StartsWith("--verify-port=")) int.TryParse(arg.Substring(14), out VerifyPort);
        }
        EnableDpiAwareness();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try
        {
            StorageRoot = VerifyRoot ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "StructuredLightFoV");
            Directory.CreateDirectory(StorageRoot);
            Assets = Path.Combine(StorageRoot, "assets", Digest(ReadResource("tool.html")).Substring(0,16));
            Directory.CreateDirectory(Assets);
            Extract("tool.html", Path.Combine(Assets,"index.html"));
            Extract("LICENSE.txt", Path.Combine(Assets,"LICENSE.txt"));
            Extract("NOTICE.txt", Path.Combine(Assets,"NOTICE.txt"));
            Extract("WebView2Loader.dll", Path.Combine(Assets,"WebView2Loader.dll"));
            if (LoadLibrary(Path.Combine(Assets,"WebView2Loader.dll")) == IntPtr.Zero)
                throw new InvalidOperationException("无法载入窗口组件，错误码："+Marshal.GetLastWin32Error());
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEmbeddedAssembly;
            RunWindow();
        }
        catch(Exception ex) { ReportError(ex); }
    }
    private static Assembly ResolveEmbeddedAssembly(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name;
        if (name=="Microsoft.Web.WebView2.Core" || name=="Microsoft.Web.WebView2.WinForms")
            return Assembly.Load(ReadResource(name+".dll"));
        return null;
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void RunWindow() { Application.Run(new ToolWindow()); }
    private static byte[] ReadResource(string name)
    {
        bool compressed=name=="tool.html";
        using(Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream(compressed?"tool.html.gz":name))
        {
            if(stream==null) throw new FileNotFoundException("程序内部文件缺失："+name);
            using(var memory=new MemoryStream())
            {
                if(compressed){using(var gzip=new GZipStream(stream,CompressionMode.Decompress)){gzip.CopyTo(memory);}}
                else stream.CopyTo(memory);
                return memory.ToArray();
            }
        }
    }
    private static string Digest(byte[] bytes)
    {
        using(var sha=SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
    }
    private static void Extract(string name,string destination)
    {
        byte[] bytes=ReadResource(name);
        if(File.Exists(destination)&&Digest(File.ReadAllBytes(destination))==Digest(bytes))return;
        try {File.WriteAllBytes(destination,bytes);}
        catch(IOException) {if(!File.Exists(destination)||Digest(File.ReadAllBytes(destination))!=Digest(bytes))throw;}
    }
    internal static void ReportError(Exception error)
    {
        string detail=error.ToString();
        if(StorageRoot!=null) try {File.WriteAllText(Path.Combine(StorageRoot,"startup-error.txt"),detail);}catch{}
        if(VerifyRoot!=null) {Environment.ExitCode=1;return;}
        string message=error.GetType().Name == "WebView2RuntimeNotFoundException"
            ? "这台电脑尚未安装 Microsoft Edge WebView2 Runtime。\n\n安装该微软组件后即可打开本工具，计算无需联网。\n下载页面：https://developer.microsoft.com/microsoft-edge/webview2/\n\n程序没有自动安装或修改系统组件。"
            : "工具未能启动："+error.Message+"\n\n详细信息已记录到："+StorageRoot;
        MessageBox.Show(message,"3D视野规划工具",MessageBoxButtons.OK,MessageBoxIcon.Information);
    }
}

internal static class WindowSizing
{
    internal static Size Initial(Size available,double dpi){double scale=Math.Max(1,dpi/96.0);return new Size(Math.Max(1,Math.Min((int)Math.Round(1516*scale),(int)(available.Width*.92))),Math.Max(1,Math.Min((int)Math.Round(959*scale),(int)(available.Height*.92))));}
    internal static Size Minimum(Size available,double dpi){double scale=Math.Max(1,dpi/96.0);return new Size(Math.Max(1,Math.Min((int)Math.Round(820*scale),(int)(available.Width*.85))),Math.Max(1,Math.Min((int)Math.Round(540*scale),(int)(available.Height*.85))));}
}
internal sealed class ToolWindow : Form
{
    private bool useRoundedRegion;
    [DllImport("user32.dll")]private static extern uint GetDpiForWindow(IntPtr hwnd);
    private double WindowDpi(){try{uint dpi=GetDpiForWindow(Handle);if(dpi>0)return dpi;}catch(EntryPointNotFoundException){}using(var g=Graphics.FromHwnd(Handle))return g.DpiX;}
    protected override void OnLoad(EventArgs e){base.OnLoad(e);Rectangle work=Screen.FromControl(this).WorkingArea;double dpi=WindowDpi();MinimumSize=WindowSizing.Minimum(work.Size,dpi);Size=WindowSizing.Initial(work.Size,dpi);Location=new Point(work.Left+(work.Width-Width)/2,work.Top+(work.Height-Height)/2);if(Program.VerifyRoot!=null)File.WriteAllText(Path.Combine(Program.VerifyRoot,"window-bounds.txt"),"dpi="+dpi+";work="+work+";bounds="+Bounds+";minimum="+MinimumSize);}
    protected override void WndProc(ref Message m)
    {
        // Keep the WebView fitted when moving between monitors with different DPI.
        if(m.Msg==0x02E0&&m.LParam!=IntPtr.Zero){int[] box=new int[4];Marshal.Copy(m.LParam,box,0,4);var next=Rectangle.FromLTRB(box[0],box[1],box[2],box[3]);double dpi=((long)m.WParam)&0xffff;var work=Screen.FromRectangle(next).WorkingArea;base.WndProc(ref m);MinimumSize=WindowSizing.Minimum(work.Size,dpi);if(WindowState==FormWindowState.Normal)Bounds=next;UpdateWindowRegion();return;}base.WndProc(ref m);
    }
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr window,int attribute,ref int value,int size);
    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        try
        {
            int corner=2,caption=0xF7F5F5,text=0x1F1D1D,border=0xEAE5E5;
            int result=DwmSetWindowAttribute(Handle,33,ref corner,4);
            DwmSetWindowAttribute(Handle,35,ref caption,4);
            DwmSetWindowAttribute(Handle,36,ref text,4);
            DwmSetWindowAttribute(Handle,34,ref border,4);
            useRoundedRegion=result!=0;
            UpdateWindowRegion();
            if(Program.VerifyRoot!=null)File.WriteAllText(Path.Combine(Program.VerifyRoot,"window-style.txt"),"rounded-corner-result="+result+";fallback-region="+(Region!=null));
        }
        catch(DllNotFoundException){}
        catch(EntryPointNotFoundException){}
    }
    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);UpdateWindowRegion();
    }
    private void UpdateWindowRegion()
    {
        if(!useRoundedRegion || Width<40 || Height<40 || IsDisposed)return;
        Region previous=Region;
        if(WindowState==FormWindowState.Maximized)Region=null;
        else using(var outline=LoadingScreen.RoundedRectangle(new RectangleF(0,0,Width,Height),14))Region=new Region(outline);
        if(previous!=null)previous.Dispose();
    }
    private WebView2 web;
    private LoadingScreen loading;
    private readonly Stopwatch startup=Stopwatch.StartNew();
    internal ToolWindow()
    {
        Text="3D视野规划工具 · v10";
        AutoScaleMode=AutoScaleMode.None;
        Rectangle startArea=Screen.FromPoint(Cursor.Position).WorkingArea;
        Size=WindowSizing.Initial(startArea.Size,96);MinimumSize=WindowSizing.Minimum(startArea.Size,96);
        StartPosition=FormStartPosition.Manual;Location=new Point(startArea.Left+(startArea.Width-Width)/2,startArea.Top+(startArea.Height-Height)/2);
        BackColor=Color.FromArgb(245,245,247);
        web=new WebView2 {Dock=DockStyle.Fill,Visible=false,DefaultBackgroundColor=BackColor};
        loading=new LoadingScreen {Dock=DockStyle.Fill};
        Controls.Add(web);
        Controls.Add(loading);
        loading.BringToFront();
        Shown+=async delegate
        {
            try
            {
                loading.Refresh();
                TraceStartup("loading-visible");
                if(Program.VerifyRoot!=null) SaveLoadingPreview();
                var options=new CoreWebView2EnvironmentOptions();
                if(Program.VerifyPort>0) options.AdditionalBrowserArguments="--remote-debugging-address=127.0.0.1 --remote-debugging-port="+Program.VerifyPort;
                var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.StorageRoot,"profile"),options);
                await web.EnsureCoreWebView2Async(env);
                if(IsDisposed || Disposing)return;
                TraceStartup("engine-ready");
                loading.Message="正在准备界面…";
                web.CoreWebView2.Settings.AreDevToolsEnabled=Program.VerifyRoot!=null;
                web.CoreWebView2.Settings.IsStatusBarEnabled=false;
                web.CoreWebView2.Settings.IsZoomControlEnabled=false;
                web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
                web.ZoomFactor=1.0;
                web.CoreWebView2.SetVirtualHostNameToFolderMapping("fov.local",Program.Assets,CoreWebView2HostResourceAccessKind.DenyCors);
                web.CoreWebView2.DownloadStarting+=OnDownload;
                web.CoreWebView2.NavigationStarting+=delegate(object sender,CoreWebView2NavigationStartingEventArgs e)
                {
                    Uri uri;
                    if(Uri.TryCreate(e.Uri,UriKind.Absolute,out uri)&&uri.Host!="fov.local"&&e.Uri!="about:blank"&&!e.Uri.StartsWith("blob:https://fov.local/"))e.Cancel=true;
                };
                web.CoreWebView2.NewWindowRequested+=delegate(object sender,CoreWebView2NewWindowRequestedEventArgs e){e.Handled=true;};
                web.CoreWebView2.WebMessageReceived+=OnPageMessage;
                web.CoreWebView2.NavigationCompleted+=async delegate(object sender,CoreWebView2NavigationCompletedEventArgs e)
                {
                    if(IsDisposed || Disposing)return;
                    if(!e.IsSuccess) {Program.ReportError(new InvalidOperationException("页面加载失败："+e.WebErrorStatus));Close();return;}
                    TraceStartup("navigation-complete");
                    try
                    {
                        // Keep the native cover until fonts and two browser animation frames are ready.
                        await web.CoreWebView2.ExecuteScriptAsync(@"
(function(){
 var reveal=function(){requestAnimationFrame(function(){requestAnimationFrame(function(){
   window.chrome.webview.postMessage('fov-initial-frame-ready');
 });});};
 if(document.fonts && document.fonts.ready)document.fonts.ready.then(reveal,reveal);else reveal();
})();");
                    }
                    catch(Exception ex){if(!IsDisposed && !Disposing){Program.ReportError(ex);Close();}}
                };
                web.Visible=true;
                web.SendToBack();
                loading.BringToFront();
                web.Source=new Uri("https://fov.local/index.html");
            }
            catch(Exception ex){if(!IsDisposed && !Disposing){Program.ReportError(ex);Close();}}
        };
    }
    private void OnPageMessage(object sender,CoreWebView2WebMessageReceivedEventArgs e)
    {
        if(IsDisposed || Disposing || !loading.Visible || e.Source!="https://fov.local/index.html")return;
        string message;try{message=e.TryGetWebMessageAsString();}catch{return;}
        if(message!="fov-initial-frame-ready")return;
        TraceStartup("page-ready");
        loading.Visible=false;
        BackColor=Color.FromArgb(245,245,247);
        TraceStartup("loading-hidden");
    }
    private void TraceStartup(string stage)
    {
        if(Program.VerifyRoot==null)return;
        try{File.AppendAllText(Path.Combine(Program.VerifyRoot,"startup-stages.tsv"),startup.ElapsedMilliseconds+"\t"+stage+"\tloading="+loading.Visible+"\tweb="+web.Visible+Environment.NewLine);}catch{}
    }
    private void SaveLoadingPreview()
    {
        using(var image=new Bitmap(loading.Width,loading.Height))
        {
            loading.DrawToBitmap(image,new Rectangle(Point.Empty,loading.Size));
            image.Save(Path.Combine(Program.VerifyRoot,"startup-loading.png"),System.Drawing.Imaging.ImageFormat.Png);
        }
    }
    private void OnDownload(object sender,CoreWebView2DownloadStartingEventArgs e)
    {
        e.Handled=true;
        string file=Path.GetFileName(e.ResultFilePath);
        if(Program.VerifyRoot!=null)
        {
            string folder=Path.Combine(Program.VerifyRoot,"downloads");Directory.CreateDirectory(folder);
            e.ResultFilePath=Path.Combine(folder,file);return;
        }
        var deferral=e.GetDeferral();
        BeginInvoke(new Action(delegate
        {
            try
            {
                using(var dialog=new SaveFileDialog())
                {
                    dialog.FileName=file;
                    dialog.Filter="导出文件 (*"+Path.GetExtension(file)+")|*"+Path.GetExtension(file)+"|所有文件 (*.*)|*.*";
                    dialog.OverwritePrompt=true;
                    dialog.RestoreDirectory=true;
                    if(dialog.ShowDialog(this)==DialogResult.OK)e.ResultFilePath=dialog.FileName;
                    else e.Cancel=true;
                }
            }
            catch {e.Cancel=true;}
            finally {deferral.Complete();}
        }));
    }
}
// Native content is available immediately, before the browser process starts.
internal sealed class LoadingScreen : Control
{
    private readonly System.Windows.Forms.Timer animation;
    private float angle;
    private string message="正在启动光学视野工具…";
    internal string Message {get{return message;}set{message=value;Invalidate();}}
    internal LoadingScreen()
    {
        BackColor=Color.FromArgb(245,245,247);
        SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer|ControlStyles.ResizeRedraw|ControlStyles.Opaque,true);
        animation=new System.Windows.Forms.Timer {Interval=30};
        animation.Tick+=delegate{angle=(angle+7)%360;Invalidate();};
    }
    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        if(animation==null)return;
        if(Visible)animation.Start();else animation.Stop();
    }
    internal static GraphicsPath RoundedRectangle(RectangleF r,float radius)
    {
        var p=new GraphicsPath();float d=radius*2;
        p.AddArc(r.Left,r.Top,d,d,180,90);p.AddArc(r.Right-d,r.Top,d,d,270,90);
        p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.Left,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;
    }
    protected override void OnPaintBackground(PaintEventArgs e){e.Graphics.Clear(BackColor);}
    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);var g=e.Graphics;g.Clear(BackColor);g.SmoothingMode=SmoothingMode.AntiAlias;
        int cx=ClientSize.Width/2,cy=ClientSize.Height/2;
        using(var shadow=RoundedRectangle(new RectangleF(cx-230,cy-195,460,400),28))
        using(var card=RoundedRectangle(new RectangleF(cx-230,cy-205,460,400),28))
        using(var shade=new SolidBrush(Color.FromArgb(8,0,0,0)))
        using(var fill=new SolidBrush(Color.White))
        using(var stroke=new Pen(Color.FromArgb(229,229,234),1))
        {g.FillPath(shade,shadow);g.FillPath(fill,card);g.DrawPath(stroke,card);}
        var cyan=Color.FromArgb(0,122,255);var muted=Color.FromArgb(110,110,115);
        using(var brand=new Font("Segoe UI",11,FontStyle.Regular,GraphicsUnit.Pixel))
        using(var title=new Font("Microsoft YaHei",26,FontStyle.Bold,GraphicsUnit.Pixel))
        using(var body=new Font("Microsoft YaHei",14,FontStyle.Regular,GraphicsUnit.Pixel))
        using(var note=new Font("Microsoft YaHei",12,FontStyle.Regular,GraphicsUnit.Pixel))
        using(var faint=new Pen(Color.FromArgb(209,209,214),2))
        using(var accent=new Pen(cyan,3))
        using(var blue=new Pen(Color.FromArgb(0,122,255),2))
        using(var amber=new Pen(Color.FromArgb(255,149,0),2))
        {
            TextRenderer.DrawText(g,"OPTICAL WORKBENCH / 10",brand,new Rectangle(0,cy-158,Width,24),cyan,TextFormatFlags.HorizontalCenter|TextFormatFlags.NoPadding);
            g.DrawLine(blue,cx-38,cy-109,cx-58,cy-62);g.DrawLine(blue,cx-38,cy-109,cx+32,cy-62);
            g.DrawLine(amber,cx+37,cy-109,cx-32,cy-62);g.DrawLine(amber,cx+37,cy-109,cx+58,cy-62);
            g.DrawLine(faint,cx-58,cy-62,cx+58,cy-62);g.DrawEllipse(blue,cx-43,cy-119,10,10);g.DrawEllipse(amber,cx+32,cy-119,10,10);
            TextRenderer.DrawText(g,"3D 视觉视野规划",title,new Rectangle(0,cy-33,Width,42),Color.FromArgb(29,29,31),TextFormatFlags.HorizontalCenter|TextFormatFlags.NoPadding);
            TextRenderer.DrawText(g,"单目 / 双目 · 光学布局与像素间距",note,new Rectangle(0,cy+13,Width,26),muted,TextFormatFlags.HorizontalCenter|TextFormatFlags.NoPadding);
            int textWidth=TextRenderer.MeasureText(message,body).Width,start=cx-(textWidth+40)/2;
            g.DrawEllipse(faint,start,cy+62,22,22);accent.StartCap=LineCap.Round;accent.EndCap=LineCap.Round;g.DrawArc(accent,start,cy+62,22,22,angle,105);
            TextRenderer.DrawText(g,message,body,new Point(start+36,cy+62),muted,TextFormatFlags.NoPadding);
            TextRenderer.DrawText(g,"完全离线运行",note,new Rectangle(0,Height-48,Width,24),muted,TextFormatFlags.HorizontalCenter|TextFormatFlags.NoPadding);
        }
    }
    protected override void Dispose(bool disposing)
    {
        if(disposing){animation.Stop();animation.Dispose();}
        base.Dispose(disposing);
    }
}
