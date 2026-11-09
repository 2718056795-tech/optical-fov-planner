$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root=$PSScriptRoot
$versionName=Split-Path (Split-Path $root -Parent) -Leaf
$target=Join-Path $root ('3D视野规划工具-'+$versionName+'-代码包.zip')
$files=Get-ChildItem -LiteralPath $root -Recurse -File | Where-Object {$_.Extension -ne '.zip'}
$stream=[IO.File]::Open($target,[IO.FileMode]::Create,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false,[Text.Encoding]::UTF8)
try{foreach($file in $files){$relative=$file.FullName.Substring($root.Length+1).Replace('\','/'); [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$relative,[IO.Compression.CompressionLevel]::Optimal) | Out-Null}}finally{$archive.Dispose()}
Get-Item -LiteralPath $target | Select-Object Name,Length