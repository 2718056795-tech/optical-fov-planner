$root = $PSScriptRoot
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'))
$theme = [IO.File]::ReadAllText((Join-Path $root 'workbench-theme.css'))
$html = $html.Replace('<link rel="stylesheet" href="workbench-theme.css">', "<style>`n$theme`n</style>")
$geometry = [IO.File]::ReadAllText((Join-Path $root 'geometry.js'))
$app = [IO.File]::ReadAllText((Join-Path $root 'app.js'))
$html = $html.Replace('<script src="geometry.js"></script>', "<script>`n$geometry`n</script>").Replace('<script src="app.js"></script>', "<script>`n$app`n</script>")
foreach($name in @('v10.js','laser-geometry.js','line-laser.js','ui-layout.js')){$script=[IO.File]::ReadAllText((Join-Path $root $name));$html=$html.Replace(('<script src='+[char]34+$name+[char]34+'></script>'),('<script>'+[Environment]::NewLine+$script+[Environment]::NewLine+'</script>'))}
[IO.File]::WriteAllText((Join-Path $root '3D视野规划工具.html'), $html, [Text.UTF8Encoding]::new($false))
