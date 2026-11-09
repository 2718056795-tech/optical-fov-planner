$ErrorActionPreference='Stop'
# Geometry regression runs before every build when Node.js is available; failures abort the build.
$node=Get-Command node -ErrorAction SilentlyContinue
if($node){
  & node (Join-Path $PSScriptRoot '网页源码\test-geometry.cjs')
  if($LASTEXITCODE -ne 0){throw '几何回归测试未通过，已中止构建'}
}else{
  Write-Host '未找到 Node.js，跳过几何回归测试；建议安装 Node.js 后手动运行 网页源码\test-geometry.cjs'
}
& (Join-Path $PSScriptRoot 'EXE打包源码\build.ps1')
& (Join-Path $PSScriptRoot '打包源码.ps1')