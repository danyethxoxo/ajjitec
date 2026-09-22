$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Web

$siteRoot = 'https://www.ajjitec.com'
$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'assets\products'
$headers = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AJJITEC-catalog-migration/1.0' }

$categoryUrls = @(
  '/product-category/ika-laboratorios',
  '/product-category/ika-laboratorios/agitadores-de-mecanicos',
  '/product-category/ika-laboratorios/agitadores-magneticos',
  '/product-category/ika-laboratorios/agitadores-magneticos-con-multiposicion',
  '/product-category/ika-laboratorios/agitadores-verticales',
  '/product-category/ika-laboratorios/dispersores',
  '/product-category/ika-laboratorios/molinos',
  '/product-category/ika-laboratorios/reactores-de-alta-viscosidad',
  '/product-category/ika-laboratorios/reactores-de-sintesis',
  '/product-category/ika-laboratorios/rotavapores',
  '/product-category/ika-laboratorios/software-de-laboratorio',
  '/product-category/ika-laboratorios/termostatos',
  '/product-category/ika-laboratorios/viscosimetro',
  '/product-category/ika-procesos',
  '/product-category/ika-procesos/agitadores-ika-process',
  '/product-category/ika-procesos/dispersor-en-linea-tres-etapas-ika-process',
  '/product-category/ika-procesos/dispersor-en-linea-una-etapa-ika-process',
  '/product-category/ika-procesos/dispersor-en-lote-ika-process',
  '/product-category/ika-procesos/dispersor-fondo-de-tanque-ika-process',
  '/product-category/ika-procesos/mezclas-solido-liquido-ika-process',
  '/product-category/ika-procesos/molinos-coloidales-ika-process',
  '/product-category/ika-procesos/plantas-de-laboratorio-ika-process',
  '/product-category/ika-procesos/plantas-de-proceso-ika-process',
  '/product-category/ika-procesos/plantas-piloto-ika-process',
  '/product-category/ika-procesos/stands-ika-process',
  '/product-category/huber',
  '/product-category/Huber/accesorios-huber',
  '/product-category/Huber/chillers-huber',
  '/product-category/Huber/termostatos-de-inmersion-banos-de-circulacion-huber',
  '/product-category/Huber/unimotive-huber',
  '/product-category/Huber/unistats-huber',
  '/product-category/ajjitec'
)

function ConvertTo-PlainText([string]$html) {
  if (-not $html) { return '' }
  $withSpaces = $html -replace '<br\s*/?>', ' ' -replace '</p>', ' '
  $withoutTags = $withSpaces -replace '<[^>]+>', ''
  return ([System.Web.HttpUtility]::HtmlDecode($withoutTags) -replace '\s+', ' ').Trim()
}

function Get-LineName([string]$categoryUrl) {
  if ($categoryUrl -match '/ika-laboratorios') { return 'IKA Laboratorio' }
  if ($categoryUrl -match '/ika-procesos') { return 'IKA Procesos' }
  if ($categoryUrl -match '/Huber|/huber') { return 'Huber' }
  return 'AJJITEC'
}

function Get-SubcategoryName([string]$categoryUrl, [string]$line) {
  $slug = ($categoryUrl.TrimEnd('/') -split '/')[-1]
  if ($slug -in @('ika-laboratorios', 'ika-procesos', 'huber', 'Huber', 'ajjitec')) { return $line }
  $words = (Get-Culture).TextInfo.ToTitleCase(($slug -replace '-', ' '))
  return $words -replace 'Ika', 'IKA' -replace 'H2o', 'H2O'
}

$productMap = [ordered]@{}

foreach ($categoryPath in $categoryUrls) {
  $categoryUrl = "$siteRoot$categoryPath"
  try {
    $response = Invoke-WebRequest -Uri $categoryUrl -Headers $headers -UseBasicParsing -TimeoutSec 45
    $line = Get-LineName $categoryPath
    $subcategory = Get-SubcategoryName $categoryPath $line
    $links = $response.Links | ForEach-Object { $_.href } | Where-Object { $_ -match '^https://www\.ajjitec\.com/product/[^/]+/?$' } | Sort-Object -Unique
    foreach ($link in $links) {
      $slug = ($link.TrimEnd('/') -split '/')[-1]
      if (-not $productMap.Contains($slug)) {
        $productMap[$slug] = [ordered]@{ slug = $slug; sourceUrl = $link; line = $line; category = $subcategory }
      }
    }
  } catch {
    Write-Warning "No se pudo leer ${categoryUrl}: $($_.Exception.Message)"
  }
}

$products = @()
$position = 0
foreach ($entry in $productMap.GetEnumerator()) {
  $position++
  $slug = $entry.Key
  $seed = $entry.Value
  Write-Output "[$position/$($productMap.Count)] $slug"
  try {
    $response = Invoke-WebRequest -Uri $seed.sourceUrl -Headers $headers -UseBasicParsing -TimeoutSec 45
    $html = $response.Content
    $nameMatch = [regex]::Match($html, '<h2 class="product-name">(?<value>[\s\S]*?)</h2>', 'IgnoreCase')
    $descriptionMatch = [regex]::Match($html, '<div class="short-desc">(?<value>[\s\S]*?)</div>', 'IgnoreCase')
    $imageMatch = [regex]::Match($html, '<div class="product-gallery"[\s\S]*?<img src="(?<value>[^"]+)"', 'IgnoreCase')
    $pdfMatch = [regex]::Match($html, '<a href="(?<value>[^"]+\.pdf)"[^>]*>\s*cat[aá]logo', 'IgnoreCase')
    $name = if ($nameMatch.Success) { ConvertTo-PlainText $nameMatch.Groups['value'].Value } else { ($slug -replace '-', ' ') }
    $description = if ($descriptionMatch.Success) { ConvertTo-PlainText $descriptionMatch.Groups['value'].Value } else { '' }
    $imageUrl = if ($imageMatch.Success) { $imageMatch.Groups['value'].Value } else { '' }
    $catalogUrl = if ($pdfMatch.Success) { $pdfMatch.Groups['value'].Value } else { '' }

    $specs = @()
    $rows = [regex]::Matches($html, '<tr[^>]*>[\s\S]*?<td[^>]*>(?<label>[\s\S]*?)</td>[\s\S]*?<td[^>]*>(?<value>[\s\S]*?)</td>[\s\S]*?</tr>', 'IgnoreCase')
    foreach ($row in $rows) {
      $label = ConvertTo-PlainText $row.Groups['label'].Value
      $value = ConvertTo-PlainText $row.Groups['value'].Value
      if ($label -and $value -and $specs.Count -lt 24) { $specs += [ordered]@{ label = $label; value = $value } }
    }

    $localImage = ''
    if ($imageUrl) {
      $extension = [IO.Path]::GetExtension(([Uri]$imageUrl).AbsolutePath)
      if (-not $extension -or $extension.Length -gt 5) { $extension = '.jpg' }
      $imageName = "$slug$extension"
      $imagePath = Join-Path $assetRoot $imageName
      if (-not (Test-Path -LiteralPath $imagePath)) {
        try { Invoke-WebRequest -Uri $imageUrl -Headers $headers -UseBasicParsing -TimeoutSec 60 -OutFile $imagePath } catch { Write-Warning "Imagen omitida: $imageUrl" }
      }
      if (Test-Path -LiteralPath $imagePath) { $localImage = "assets/products/$imageName" }
    }

    $products += [ordered]@{
      slug = $slug
      name = $name
      line = $seed.line
      category = $seed.category
      description = $description
      image = $localImage
      catalogUrl = $catalogUrl
      sourceUrl = $seed.sourceUrl
      specs = $specs
    }
  } catch {
    Write-Warning "Producto omitido $($seed.sourceUrl): $($_.Exception.Message)"
  }
}

$sortedProducts = $products | Sort-Object line, category, name
$json = $sortedProducts | ConvertTo-Json -Depth 6
$output = "window.AJJITEC_PRODUCTS = $json;`r`n"
[IO.File]::WriteAllText((Join-Path $projectRoot 'catalog-data.js'), $output, (New-Object Text.UTF8Encoding($false)))
Write-Output "Importados: $($sortedProducts.Count) productos"
