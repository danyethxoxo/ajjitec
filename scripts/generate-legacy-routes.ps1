$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$catalogPath = Join-Path $projectRoot 'catalog-data.js'
$raw = [IO.File]::ReadAllText($catalogPath, [Text.Encoding]::UTF8)
$json = $raw.Substring('window.AJJITEC_PRODUCTS = '.Length).Trim()
$json = $json.Substring(0, $json.Length - 1)
$products = $json | ConvertFrom-Json
$utf8 = New-Object Text.UTF8Encoding($false)

function Write-Redirect([string]$relativePath, [string]$target) {
  $directory = Join-Path $projectRoot $relativePath
  [IO.Directory]::CreateDirectory($directory) | Out-Null
  $escapedTarget = [System.Net.WebUtility]::HtmlEncode($target)
  $content = "<!doctype html><html lang=`"es`"><head><meta charset=`"UTF-8`"><meta name=`"viewport`" content=`"width=device-width,initial-scale=1`"><meta http-equiv=`"refresh`" content=`"0;url=$escapedTarget`"><link rel=`"canonical`" href=`"$escapedTarget`"><title>Redirigiendo | AJJITEC</title></head><body><p>Redirigiendo a <a href=`"$escapedTarget`">AJJITEC</a>…</p><script>location.replace('$target')</script></body></html>"
  [IO.File]::WriteAllText((Join-Path $directory 'index.html'), $content, $utf8)
}

foreach ($product in $products) {
  $target = "../../producto.html?slug=$([Uri]::EscapeDataString($product.slug))"
  Write-Redirect "product\$($product.slug)" $target
}

$routes = @(
  @{ path = 'about-us'; target = '../index.html#nosotros' },
  @{ path = 'contact-us'; target = '../index.html#contacto' },
  @{ path = 'all-product'; target = '../catalogo.html' },
  @{ path = 'privacy'; target = 'https://www.ajjitec.com/assets/pdf/Aviso-de-Privacidad.pdf' },
  @{ path = 'login'; target = '../login.html' },
  @{ path = 'register'; target = '../registro.html' },
  @{ path = 'product-category\ika-laboratorios'; target = '../../catalogo.html?line=IKA%20Laboratorio' },
  @{ path = 'product-category\ika-procesos'; target = '../../catalogo.html?line=IKA%20Procesos' },
  @{ path = 'product-category\huber'; target = '../../catalogo.html?line=Huber' },
  @{ path = 'product-category\ajjitec'; target = '../../catalogo.html?line=AJJITEC' }
)

foreach ($route in $routes) { Write-Redirect $route.path $route.target }
Write-Output "Rutas de producto: $($products.Count); rutas generales: $($routes.Count)"
