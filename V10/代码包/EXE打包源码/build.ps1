param([string]$OutputName='3D视野规划工具-V10.exe')
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$codeRoot=Split-Path $root -Parent
$versionRoot=Split-Path $codeRoot -Parent
$webRoot=Join-Path $codeRoot '网页源码'
# Always regenerate and embed this version's current HTML before compiling.
& (Join-Path $webRoot 'build.ps1')
Copy-Item -LiteralPath (Join-Path $webRoot '3D视野规划工具.html') -Destination (Join-Path $root 'source\tool.html') -Force
# Compress only the embedded web page with the system framework; no added runtime files.
Add-Type -AssemblyName System.IO.Compression
$inputHTML=[IO.File]::OpenRead((Join-Path $root 'source\tool.html'))
$outputHTML=[IO.File]::Create((Join-Path $root 'source\tool.html.gz'))
try{$gzip=[IO.Compression.GZipStream]::new($outputHTML,[IO.Compression.CompressionLevel]::Optimal);try{$inputHTML.CopyTo($gzip)}finally{$gzip.Dispose()}}finally{$inputHTML.Dispose();$outputHTML.Dispose()}
$sdk=Join-Path $root 'vendor\WebView2'
$framework='C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$outDir=Join-Path $versionRoot 'EXE'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$exe=Join-Path $outDir $OutputName
$core=Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$forms=Join-Path $sdk 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loader=Join-Path $sdk 'runtimes\win-x64\native\WebView2Loader.dll'
$compilerArgs=@('/nologo','/target:winexe','/platform:x64','/optimize+','/codepage:65001',('/out:'+$exe),('/win32manifest:'+(Join-Path $root 'source\app.manifest')),('/reference:'+$core),('/reference:'+$forms),'/reference:System.Windows.Forms.dll','/reference:System.Drawing.dll','/reference:System.Core.dll','/reference:System.IO.Compression.dll',('/resource:'+$core+',Microsoft.Web.WebView2.Core.dll'),('/resource:'+$forms+',Microsoft.Web.WebView2.WinForms.dll'),('/resource:'+$loader+',WebView2Loader.dll'),('/resource:'+(Join-Path $sdk 'LICENSE.txt')+',LICENSE.txt'),('/resource:'+(Join-Path $sdk 'NOTICE.txt')+',NOTICE.txt'),('/resource:'+(Join-Path $root 'source\tool.html.gz')+',tool.html.gz'),(Join-Path $root 'source\Host.cs'))
& (Join-Path $framework 'csc.exe') @compilerArgs
if($LASTEXITCODE -ne 0){throw '编译失败'}
Get-Item -LiteralPath $exe | Select-Object Name,Length